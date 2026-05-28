"""
Sentinel API Service — Span Ingest

Receives synthetic OTel-style trace spans from the simulator (or any other
emitter) and writes them to the `spans` hypertable. Phase 3 uses a direct
HTTP path; production deployments would swap this for an OTel collector.
"""

import json
from datetime import datetime, timezone
from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..db.database import get_raw_pool

log: structlog.stdlib.BoundLogger = structlog.get_logger()

router = APIRouter(tags=["spans"])


class SpanPayload(BaseModel):
    trace_id: str = Field(..., min_length=1, max_length=64)
    span_id: str = Field(..., min_length=1, max_length=64)
    parent_span_id: Optional[str] = Field(default=None, max_length=64)
    server_id: str = Field(..., min_length=1, max_length=64)
    service: Optional[str] = Field(default=None, max_length=128)
    name: str = Field(..., min_length=1, max_length=256)
    start: datetime
    duration_ms: float = Field(..., ge=0.0)
    status: Optional[str] = Field(default=None, max_length=32)
    attributes: Optional[dict[str, object]] = None


class SpanBatch(BaseModel):
    spans: list[SpanPayload] = Field(..., min_length=1, max_length=1000)


@router.post("/api/spans")
async def ingest_spans(batch: SpanBatch) -> dict[str, object]:
    """Batch ingest spans into the TimescaleDB hypertable."""
    pool = await get_raw_pool()

    rows = []
    for s in batch.spans:
        ts = s.start
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        rows.append((
            ts,
            s.trace_id,
            s.span_id,
            s.parent_span_id,
            s.server_id,
            s.service,
            s.name,
            float(s.duration_ms),
            s.status,
            json.dumps(s.attributes) if s.attributes else None,
        ))

    async with pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO spans
                (time, trace_id, span_id, parent_span_id, server_id, service, name, duration_ms, status, attributes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
            """,
            rows,
        )

    log.debug("spans.ingested", count=len(rows))
    return {"status": "accepted", "count": len(rows)}
