"""
Sentinel Stream Processor Service

Consumes metrics from Redpanda, writes to TimescaleDB, updates Redis
server state, evaluates alert rules, and publishes incidents.
"""

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

import structlog
from fastapi import FastAPI

from .alerter import (
    check_cooldown,
    close_alerter,
    init_alerter,
    publish_alert,
    set_cooldown,
    update_server_state,
)
from .consumer import create_consumer, parse_timestamp
from .drain import cluster_logs
from .log_consumer import process_logs
from .rules import SlidingWindowEvaluator
from .storage import (
    close_storage,
    create_incident,
    fetch_log_snapshot,
    init_storage,
    write_metric,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    ),
)

log: structlog.stdlib.BoundLogger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Sliding window evaluator (in-memory)
# ---------------------------------------------------------------------------
evaluator = SlidingWindowEvaluator(window_seconds=30.0)


async def process_metrics() -> None:
    """Main processing loop: consume, store, evaluate, alert."""
    # Initialize dependencies here (not in lifespan) so health endpoint can respond immediately
    await init_storage()
    await init_alerter()
    consumer = await create_consumer()
    log.info("processor.loop.started")

    try:
        async for msg in consumer:
            try:
                data = msg.value
                server_id: str = data["server_id"]
                cpu: float = float(data["cpu"])
                memory: float = float(data["memory"])
                disk: float = float(data["disk"])
                latency_ms: float = float(data["latency_ms"])
                timestamp = parse_timestamp(data["timestamp"])

                # 1. Write to TimescaleDB
                await write_metric(timestamp, server_id, cpu, memory, disk, latency_ms)

                # 2. Update Redis server state
                await update_server_state(server_id, cpu, memory, disk, latency_ms)

                # 3. Add to sliding window and evaluate rules
                evaluator.add_metric(server_id, cpu, memory, disk, latency_ms)
                fired_alerts = evaluator.evaluate(server_id)

                # 4. Process fired alerts
                for alert in fired_alerts:
                    in_cooldown = await check_cooldown(alert.server_id, alert.metric_type)
                    if not in_cooldown:
                        incident_id = str(uuid.uuid4())

                        # Eager log snapshot: capture surrounding WARN/ERROR/FATAL
                        # logs into the incident row before the SSE fire-out.
                        log_context = await _build_log_context(
                            server_id=alert.server_id,
                            anchor=timestamp,
                        )

                        # Create incident in DB
                        await create_incident(
                            incident_id=incident_id,
                            server_id=alert.server_id,
                            metric_type=alert.metric_type,
                            severity=alert.severity.value,
                            current_value=alert.current_value,
                            threshold=alert.threshold,
                            message=alert.message,
                            log_context=log_context,
                        )

                        # Publish to Redis pub/sub
                        await publish_alert(alert, incident_id)

                        # Set cooldown
                        await set_cooldown(alert.server_id, alert.metric_type)

                log.debug(
                    "metric.processed",
                    server_id=server_id,
                    cpu=cpu,
                    memory=memory,
                )

            except Exception as exc:
                log.error("processor.message.error", error=str(exc), exc_info=True)

    finally:
        await consumer.stop()
        log.info("processor.loop.stopped")


async def _build_log_context(server_id: str, anchor: datetime) -> dict[str, object] | None:
    """
    Capture the WARN/ERROR/FATAL log slice around an incident's anchor time,
    cluster it via drain, and return a JSON-serializable summary. None if
    no logs were found or if the snapshot itself failed (incident creation
    must not depend on logs being available).
    """
    try:
        start = anchor - timedelta(seconds=60)
        end = anchor + timedelta(seconds=30)
        lines = await fetch_log_snapshot(server_id, start, end)
        if not lines:
            return None
        clusters = cluster_logs(lines)
        return {
            "window_start": start.astimezone(timezone.utc).isoformat(),
            "window_end": end.astimezone(timezone.utc).isoformat(),
            "total_lines": len(lines),
            "templates": clusters,
        }
    except Exception as exc:
        log.warning("processor.log_context.failed", server_id=server_id, error=str(exc))
        return None


# ---------------------------------------------------------------------------
# FastAPI app (for health endpoint)
# ---------------------------------------------------------------------------
_processing_task: asyncio.Task[None] | None = None
_log_task: asyncio.Task[None] | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Start/stop the processor and its dependencies."""
    global _processing_task, _log_task

    log.info("processor.starting")

    _processing_task = asyncio.create_task(process_metrics())
    _log_task = asyncio.create_task(process_logs())

    yield

    log.info("processor.stopping")
    for task in (_processing_task, _log_task):
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    await close_alerter()
    await close_storage()


app = FastAPI(
    title="Sentinel Stream Processor",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy", "service": "processor"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002)
