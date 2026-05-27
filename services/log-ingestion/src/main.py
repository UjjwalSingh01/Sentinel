"""
Sentinel Log Ingestion Service

Receives structured log records (single or batch) via REST,
validates them with Pydantic, and publishes them to Redpanda.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI, HTTPException

from .config import MAX_BATCH_SIZE
from .models import HealthResponse, LogBatch, LogRecord
from .producer import is_producer_ready, publish_log_records, start_producer, stop_producer

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


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    log.info("log_ingestion.starting")
    asyncio.create_task(start_producer())
    yield
    log.info("log_ingestion.stopping")
    await stop_producer()


app = FastAPI(
    title="Sentinel Log Ingestion Service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.post("/api/logs")
async def ingest_logs(batch: LogBatch) -> dict[str, object]:
    """Ingest a batch of log records and publish to Kafka."""
    if not is_producer_ready():
        raise HTTPException(status_code=503, detail="Producer is still connecting")

    if len(batch.records) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Batch exceeds maximum of {MAX_BATCH_SIZE} records",
        )

    payload = [r.model_dump(mode="json") for r in batch.records]
    try:
        await publish_log_records(payload)
        return {"status": "accepted", "count": len(payload)}
    except RuntimeError as exc:
        log.error("log_ingestion.error", error=str(exc))
        raise HTTPException(status_code=503, detail="Producer not available") from exc


@app.post("/api/logs/single")
async def ingest_single_log(record: LogRecord) -> dict[str, str]:
    """Convenience endpoint for shippers that don't batch."""
    if not is_producer_ready():
        raise HTTPException(status_code=503, detail="Producer is still connecting")
    try:
        await publish_log_records([record.model_dump(mode="json")])
        return {"status": "accepted"}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="Producer not available") from exc


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="healthy", service="log-ingestion")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8003)
