"""
Sentinel Ingestion Service — Pydantic Models
"""

from datetime import datetime

from pydantic import BaseModel, Field


class MetricPayload(BaseModel):
    """Incoming metric data from a server simulator."""

    server_id: str = Field(..., min_length=1, max_length=64, description="Unique server identifier")
    cpu: float = Field(..., ge=0.0, le=100.0, description="CPU usage percentage")
    memory: float = Field(..., ge=0.0, le=100.0, description="Memory usage percentage")
    disk: float = Field(..., ge=0.0, le=100.0, description="Disk usage percentage")
    latency_ms: float = Field(..., ge=0.0, description="Request latency in milliseconds")
    timestamp: datetime = Field(..., description="Metric collection timestamp (UTC)")


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    service: str
