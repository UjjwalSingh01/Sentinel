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

import redis.asyncio as aioredis

from .alerter import (
    check_cooldown,
    close_alerter,
    init_alerter,
    publish_alert,
    set_cooldown,
    update_server_state,
)
from .config import REDIS_URL
from .consumer import create_consumer, parse_timestamp
from .dedup import compute_fingerprint
from .drain import cluster_logs
from .log_consumer import process_logs, set_engine_ingest_hook
from .rule_engine import AlertRule, RuleEngine, Severity
from .storage import (
    close_storage,
    create_incident,
    fetch_log_snapshot,
    find_parent_incident,
    init_storage,
    load_alert_rules,
    pick_exemplar_traces,
    seed_default_rules,
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
# DB-driven rule engine (Phase 2)
# ---------------------------------------------------------------------------
engine = RuleEngine()
set_engine_ingest_hook(engine.ingest_log)


def _rules_from_rows(rows: list[dict[str, object]]) -> list[AlertRule]:
    out: list[AlertRule] = []
    for r in rows:
        try:
            sev = Severity(r["severity"])
        except ValueError:
            log.warning("rule.invalid_severity", rule_id=r.get("id"), severity=r.get("severity"))
            continue
        out.append(AlertRule(
            id=str(r["id"]),
            name=str(r["name"]),
            type=str(r["type"]),
            severity=sev,
            expression=r["expression"] if isinstance(r["expression"], dict) else dict(r["expression"]),
            enabled=bool(r.get("enabled", True)),
            runbook_url=r.get("runbook_url"),  # type: ignore[arg-type]
        ))
    return out


async def _refresh_rules() -> None:
    rows = await load_alert_rules()
    rules = _rules_from_rows(rows)
    engine.set_rules(rules)
    log.info("processor.rules.loaded", count=len(rules))


async def _watch_rule_changes() -> None:
    """
    Subscribe to `alert_rules.changed` and reload the engine when the API
    service signals a CRUD event. Self-heals through Redis reconnects.
    """
    while True:
        try:
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            pubsub = redis_client.pubsub()
            await pubsub.subscribe("alert_rules.changed")
            log.info("processor.rule_watch.subscribed")

            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                log.info("processor.rule_watch.event", data=message.get("data"))
                try:
                    await _refresh_rules()
                except Exception as exc:
                    log.error("processor.rule_watch.refresh_failed", error=str(exc))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning("processor.rule_watch.reconnecting", error=str(exc))
            await asyncio.sleep(2.0)
        finally:
            try:
                await pubsub.aclose()  # type: ignore[has-type]
                await redis_client.aclose()  # type: ignore[has-type]
            except Exception:
                pass


async def process_metrics() -> None:
    """Main processing loop: consume, store, evaluate, alert."""
    # Initialize dependencies here (not in lifespan) so health endpoint can respond immediately
    await init_storage()
    await init_alerter()
    await seed_default_rules()
    await _refresh_rules()
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

                # 3. Feed metric tick to engine and evaluate every active rule
                engine.add_metric(server_id, cpu, memory, disk, latency_ms)
                fired_alerts = engine.evaluate_server(server_id)

                # 4. Process fired alerts (cooldowns keyed on rule_id so
                # different rules on the same server don't suppress each other)
                for alert in fired_alerts:
                    cooldown_key = f"{alert.rule_id}:{alert.metric_type}"
                    in_cooldown = await check_cooldown(alert.server_id, cooldown_key)
                    if in_cooldown:
                        continue

                    incident_id = str(uuid.uuid4())

                    # Dedup: incidents on related servers (same role) firing
                    # the same rule within 60s collapse under one parent.
                    fingerprint, _group = compute_fingerprint(
                        alert.rule_id, alert.server_id, timestamp,
                    )
                    parent_id = await find_parent_incident(alert.rule_id, fingerprint)

                    # Eager log snapshot: capture surrounding WARN/ERROR/FATAL
                    # logs into the incident row before the SSE fire-out.
                    log_context = await _build_log_context(
                        server_id=alert.server_id,
                        anchor=timestamp,
                    )

                    # Exemplar traces: top-2 slowest root spans in the window
                    exemplars = await pick_exemplar_traces(
                        server_id=alert.server_id,
                        anchor=timestamp,
                    )

                    await create_incident(
                        incident_id=incident_id,
                        server_id=alert.server_id,
                        metric_type=alert.metric_type,
                        severity=alert.severity.value,
                        current_value=alert.current_value,
                        threshold=alert.threshold,
                        message=alert.message,
                        log_context=log_context,
                        rule_id=alert.rule_id,
                        rule_name=alert.rule_name,
                        parent_incident_id=parent_id,
                        dedup_fingerprint=fingerprint,
                        exemplar_trace_ids=exemplars or None,
                    )

                    # Only publish parents to the SSE feed; children are
                    # discoverable via parent.children in the UI. This keeps
                    # the live feed quiet during multi-server incident storms.
                    if parent_id is None:
                        await publish_alert(alert, incident_id)

                    await set_cooldown(alert.server_id, cooldown_key)

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
_rule_watch_task: asyncio.Task[None] | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Start/stop the processor and its dependencies."""
    global _processing_task, _log_task, _rule_watch_task

    log.info("processor.starting")

    _processing_task = asyncio.create_task(process_metrics())
    _log_task = asyncio.create_task(process_logs())
    _rule_watch_task = asyncio.create_task(_watch_rule_changes())

    yield

    log.info("processor.stopping")
    for task in (_processing_task, _log_task, _rule_watch_task):
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
