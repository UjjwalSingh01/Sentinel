"""
Sentinel API Service — GraphQL Type Definitions
"""

from datetime import datetime
from typing import Optional

import strawberry


@strawberry.type
class ServerType:
    """Represents a monitored server with its current metrics."""

    server_id: str
    cpu: float
    memory: float
    disk: float
    latency_ms: float


@strawberry.type
class MetricPointType:
    """A single time-bucketed metric data point."""

    time: datetime
    cpu: Optional[float] = None
    memory: Optional[float] = None
    disk: Optional[float] = None
    latency_ms: Optional[float] = None


@strawberry.type
class UserType:
    """A platform user."""

    id: str
    email: str
    name: str
    role: str
    created_at: datetime


@strawberry.type
class IncidentType:
    """An infrastructure incident."""

    id: str
    server_id: str
    metric_type: str
    severity: str
    current_value: float
    threshold: float
    message: str
    status: str
    ai_analysis: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee: Optional[UserType] = None
    created_at: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    # JSON-encoded snapshot of correlated logs at incident time.
    # Frontend parses via JSON.parse(). null when no logs were captured.
    log_context: Optional[str] = None


@strawberry.type
class AiAnalysisType:
    """Result of an AI-powered root-cause analysis."""

    incident_id: str
    analysis: str
    cached: bool


@strawberry.type
class LogType:
    """A single log line stored in the logs hypertable."""

    time: datetime
    server_id: str
    service: Optional[str] = None
    level: str
    message: str
    # JSON-encoded structured fields; null if none.
    fields: Optional[str] = None
    trace_id: Optional[str] = None


@strawberry.type
class LogConnection:
    """Paginated logs result."""

    items: list[LogType]
    next_cursor: Optional[str] = None
    has_more: bool
