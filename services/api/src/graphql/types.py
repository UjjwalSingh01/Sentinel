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
    # Phase 2: which rule produced this incident.
    rule_id: Optional[str] = None
    rule_name: Optional[str] = None
    # Phase 3: dedup + tracing.
    parent_incident_id: Optional[str] = None
    child_count: int = 0
    exemplar_trace_ids: Optional[list[str]] = None


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


@strawberry.type
class SpanType:
    """One trace span. Sequence + nesting reconstructed via parent_span_id."""

    time: datetime
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    server_id: str
    service: Optional[str] = None
    name: str
    duration_ms: float
    status: Optional[str] = None
    # JSON-encoded structured attributes; null if none.
    attributes: Optional[str] = None


@strawberry.type
class TraceType:
    """All spans for a single trace_id, ordered for waterfall rendering."""

    trace_id: str
    server_id: str
    root_name: str
    root_duration_ms: float
    spans: list[SpanType]


@strawberry.type
class AlertRuleType:
    """A DB-stored alert rule."""

    id: str
    name: str
    type: str  # 'metric' | 'log' | 'composite'
    severity: str
    # JSON-encoded expression; frontend parses & edits structurally.
    expression: str
    enabled: bool
    runbook_url: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


@strawberry.type
class DashboardType:
    """A user-saved dashboard layout."""

    id: str
    owner_id: str
    name: str
    # JSON-encoded layout: array of widget cells.
    layout: str
    is_default: bool
    created_at: datetime
    updated_at: datetime


@strawberry.type
class SavedFilterType:
    """A bookmarked filter for the incidents or logs pages."""

    id: str
    owner_id: str
    name: str
    scope: str  # 'incidents' | 'logs'
    # JSON-encoded filter state.
    filter: str
    created_at: datetime
