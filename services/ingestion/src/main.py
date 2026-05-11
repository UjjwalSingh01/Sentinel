"""
Sentinel Ingestion Service

Receives metric payloads via REST, validates them with Pydantic,
and publishes valid metrics to a Redpanda (Kafka) topic.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, HTTPException

from .models import HealthResponse, MetricPayload
from .producer import publish_metric, start_producer, stop_producer, is_producer_ready

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
# Application lifecycle
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Start/stop Kafka producer on app lifecycle."""
    log.info("ingestion.starting")
    # Start producer in background so health endpoint can respond immediately
    asyncio.create_task(start_producer())
    yield
    log.info("ingestion.stopping")
    await stop_producer()


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Sentinel Ingestion Service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.post("/api/ingest")
async def ingest_metric(payload: MetricPayload) -> dict[str, str]:
    """Ingest a metric payload and publish to Kafka."""
    if not is_producer_ready():
        raise HTTPException(status_code=503, detail="Producer is still connecting")
    try:
        await publish_metric(payload.model_dump(mode="json"))
        return {"status": "accepted"}
    except RuntimeError as exc:
        log.error("ingest.error", error=str(exc))
        raise HTTPException(status_code=503, detail="Producer not available") from exc


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", service="ingestion")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
