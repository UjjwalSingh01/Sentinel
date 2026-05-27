"""
Sentinel Log Ingestion Service — Pydantic Models
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LogRecord(BaseModel):
    """One structured log record from a shipper or simulator."""

    server_id: str = Field(..., min_length=1, max_length=64)
    service: Optional[str] = Field(default=None, max_length=128)
    level: str = Field(..., pattern=r"^(?i)(DEBUG|INFO|WARN|WARNING|ERROR|FATAL)$")
    message: str = Field(..., min_length=1, max_length=8192)
    timestamp: datetime
    fields: Optional[dict[str, object]] = None
    trace_id: Optional[str] = Field(default=None, max_length=128)


class LogBatch(BaseModel):
    """A batch of log records — preferred shape for shippers."""

    records: list[LogRecord] = Field(..., min_length=1, max_length=1000)


class HealthResponse(BaseModel):
    status: str
    service: str
