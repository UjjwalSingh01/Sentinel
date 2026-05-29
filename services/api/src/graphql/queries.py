"""
Sentinel API Service — GraphQL Queries
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

import strawberry
import structlog

import json
import base64

from ..db.database import async_session, get_raw_pool
from ..db.models import (
    AlertRule,
    Dashboard,
    Incident,
    NotificationLogEntry,
    OnCallEntry,
    SavedFilter,
    User,
)
from ..services.redis_service import get_all_server_states
from .types import (
    AlertRuleType,
    DashboardType,
    IncidentType,
    LogConnection,
    LogType,
    MetricPointType,
    NotificationLogEntryType,
    OnCallEntryType,
    SavedFilterType,
    ServerType,
    SpanType,
    TraceType,
    UserType,
)

from sqlalchemy import func, select

log: structlog.stdlib.BoundLogger = structlog.get_logger()


def _user_to_type(user: Optional[User]) -> Optional[UserType]:
    if user is None:
        return None
    return UserType(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        created_at=user.created_at,
    )


def _dashboard_to_type(d: Dashboard) -> DashboardType:
    return DashboardType(
        id=d.id,
        owner_id=d.owner_id,
        name=d.name,
        layout=json.dumps(d.layout or []),
        is_default=d.is_default,
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


def _saved_filter_to_type(f: SavedFilter) -> SavedFilterType:
    return SavedFilterType(
        id=f.id,
        owner_id=f.owner_id,
        name=f.name,
        scope=f.scope,
        filter=json.dumps(f.filter or {}),
        created_at=f.created_at,
    )


def _incident_to_type(
    inc: Incident,
    assignee: Optional[UserType],
    child_count: int = 0,
) -> IncidentType:
    return IncidentType(
        id=inc.id,
        server_id=inc.server_id,
        metric_type=inc.metric_type,
        severity=inc.severity,
        current_value=inc.current_value,
        threshold=inc.threshold,
        message=inc.message,
        status=inc.status,
        ai_analysis=inc.ai_analysis,
        assignee_id=inc.assignee_id,
        assignee=assignee,
        created_at=inc.created_at,
        acknowledged_at=inc.acknowledged_at,
        acknowledged_by=inc.acknowledged_by,
        resolved_at=inc.resolved_at,
        log_context=json.dumps(inc.log_context) if inc.log_context else None,
        rule_id=inc.rule_id,
        rule_name=inc.rule_name,
        parent_incident_id=inc.parent_incident_id,
        child_count=child_count,
        exemplar_trace_ids=list(inc.exemplar_trace_ids) if inc.exemplar_trace_ids else None,
    )


@strawberry.type
class Query:
    """Root GraphQL query type."""

    @strawberry.field
    async def servers(self) -> list[ServerType]:
        """Get all servers with their latest metric values from Redis."""
        states = await get_all_server_states()
        return [
            ServerType(
                server_id=s.get("server_id", "unknown"),
                cpu=float(s.get("cpu", 0)),
                memory=float(s.get("memory", 0)),
                disk=float(s.get("disk", 0)),
                latency_ms=float(s.get("latency_ms", 0)),
            )
            for s in states
        ]

    @strawberry.field
    async def metrics(
        self,
        server_id: str,
        from_time: Optional[datetime] = None,
        to_time: Optional[datetime] = None,
        bucket_minutes: int = 1,
    ) -> list[MetricPointType]:
        """Get time-bucketed metric aggregates for a server from TimescaleDB."""
        if from_time is None:
            from_time = datetime.now(timezone.utc) - timedelta(hours=1)
        if to_time is None:
            to_time = datetime.now(timezone.utc)

        pool = await get_raw_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    time_bucket($1::interval, time) AS bucket,
                    AVG(cpu) AS cpu,
                    AVG(memory) AS memory,
                    AVG(disk) AS disk,
                    AVG(latency_ms) AS latency_ms
                FROM metrics
                WHERE server_id = $2
                  AND time >= $3
                  AND time <= $4
                GROUP BY bucket
                ORDER BY bucket ASC
                """,
                timedelta(minutes=bucket_minutes),
                server_id,
                from_time,
                to_time,
            )

            return [
                MetricPointType(
                    time=row["bucket"],
                    cpu=round(row["cpu"], 2) if row["cpu"] is not None else None,
                    memory=round(row["memory"], 2) if row["memory"] is not None else None,
                    disk=round(row["disk"], 2) if row["disk"] is not None else None,
                    latency_ms=round(row["latency_ms"], 2) if row["latency_ms"] is not None else None,
                )
                for row in rows
            ]

    @strawberry.field
    async def incidents(
        self,
        status: Optional[str] = None,
        server_id: Optional[str] = None,
        limit: int = 50,
    ) -> list[IncidentType]:
        """Get incidents with optional status and server filters."""
        async with async_session() as session:
            query = select(Incident).order_by(Incident.created_at.desc()).limit(limit)

            if status is not None:
                query = query.where(Incident.status == status)
            if server_id is not None:
                query = query.where(Incident.server_id == server_id)

            result = await session.execute(query)
            incidents = result.scalars().all()

            # Batch the child-count lookup for all returned incidents
            ids = [inc.id for inc in incidents]
            child_counts: dict[str, int] = {}
            if ids:
                child_result = await session.execute(
                    select(Incident.parent_incident_id, func.count())
                    .where(Incident.parent_incident_id.in_(ids))
                    .group_by(Incident.parent_incident_id)
                )
                child_counts = {pid: int(c) for pid, c in child_result.all() if pid}

            incident_types: list[IncidentType] = []
            for inc in incidents:
                assignee = None
                if inc.assignee_id:
                    user_result = await session.execute(
                        select(User).where(User.id == inc.assignee_id)
                    )
                    assignee = _user_to_type(user_result.scalar_one_or_none())
                incident_types.append(
                    _incident_to_type(inc, assignee, child_counts.get(inc.id, 0))
                )

            return incident_types

    @strawberry.field
    async def incident(self, id: str) -> Optional[IncidentType]:
        """Get a single incident by ID."""
        async with async_session() as session:
            result = await session.execute(
                select(Incident).where(Incident.id == id)
            )
            inc = result.scalar_one_or_none()
            if inc is None:
                return None

            assignee = None
            if inc.assignee_id:
                user_result = await session.execute(
                    select(User).where(User.id == inc.assignee_id)
                )
                assignee = _user_to_type(user_result.scalar_one_or_none())

            child_count_result = await session.execute(
                select(func.count()).where(Incident.parent_incident_id == inc.id)
            )
            child_count = int(child_count_result.scalar() or 0)
            return _incident_to_type(inc, assignee, child_count)

    @strawberry.field
    async def users(self) -> list[UserType]:
        """Get all users (for assignment dropdown)."""
        async with async_session() as session:
            result = await session.execute(select(User).order_by(User.name))
            users = result.scalars().all()
            return [
                UserType(
                    id=u.id,
                    email=u.email,
                    name=u.name,
                    role=u.role,
                    created_at=u.created_at,
                )
                for u in users
            ]

    # ---------- Phase 4: rules / dashboards / saved filters ----------
    @strawberry.field
    async def alert_rules(self) -> list[AlertRuleType]:
        """All alert rules (enabled + disabled), newest first."""
        async with async_session() as session:
            result = await session.execute(
                select(AlertRule).order_by(AlertRule.updated_at.desc())
            )
            rules = result.scalars().all()
            return [
                AlertRuleType(
                    id=r.id,
                    name=r.name,
                    type=r.type,
                    severity=r.severity,
                    expression=json.dumps(r.expression),
                    enabled=r.enabled,
                    runbook_url=r.runbook_url,
                    created_by=r.created_by,
                    created_at=r.created_at,
                    updated_at=r.updated_at,
                )
                for r in rules
            ]

    @strawberry.field
    async def dashboards(self) -> list[DashboardType]:
        async with async_session() as session:
            result = await session.execute(
                select(Dashboard).order_by(Dashboard.updated_at.desc())
            )
            rows = result.scalars().all()
            return [_dashboard_to_type(d) for d in rows]

    @strawberry.field
    async def dashboard(self, id: str) -> Optional[DashboardType]:
        async with async_session() as session:
            result = await session.execute(
                select(Dashboard).where(Dashboard.id == id)
            )
            d = result.scalar_one_or_none()
            return _dashboard_to_type(d) if d else None

    @strawberry.field
    async def on_call_schedule(self) -> list[OnCallEntryType]:
        async with async_session() as session:
            result = await session.execute(
                select(OnCallEntry).order_by(OnCallEntry.starts_at.desc())
            )
            rows = result.scalars().all()
            user_ids = {r.user_id for r in rows}
            users_by_id: dict[str, User] = {}
            if user_ids:
                u_result = await session.execute(
                    select(User).where(User.id.in_(user_ids))
                )
                users_by_id = {u.id: u for u in u_result.scalars().all()}
            return [
                OnCallEntryType(
                    id=e.id,
                    user_id=e.user_id,
                    user=_user_to_type(users_by_id.get(e.user_id)),
                    starts_at=e.starts_at,
                    ends_at=e.ends_at,
                    created_at=e.created_at,
                )
                for e in rows
            ]

    @strawberry.field
    async def current_on_call(self) -> Optional[OnCallEntryType]:
        """Return the on-call entry covering NOW(), or None if nobody is on-call."""
        pool = await get_raw_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, user_id, starts_at, ends_at, created_at
                FROM on_call_schedule
                WHERE NOW() BETWEEN starts_at AND ends_at
                ORDER BY starts_at DESC
                LIMIT 1
                """
            )
        if row is None:
            return None
        async with async_session() as session:
            user_result = await session.execute(
                select(User).where(User.id == row["user_id"])
            )
            user = _user_to_type(user_result.scalar_one_or_none())
        return OnCallEntryType(
            id=row["id"],
            user_id=row["user_id"],
            user=user,
            starts_at=row["starts_at"],
            ends_at=row["ends_at"],
            created_at=row["created_at"],
        )

    @strawberry.field
    async def notification_log(
        self, incident_id: Optional[str] = None, limit: int = 50
    ) -> list[NotificationLogEntryType]:
        limit = max(1, min(limit, 500))
        async with async_session() as session:
            query = select(NotificationLogEntry).order_by(
                NotificationLogEntry.sent_at.desc()
            ).limit(limit)
            if incident_id is not None:
                query = query.where(NotificationLogEntry.incident_id == incident_id)
            result = await session.execute(query)
            rows = result.scalars().all()
            return [
                NotificationLogEntryType(
                    id=r.id,
                    incident_id=r.incident_id,
                    channel=r.channel,
                    recipient=r.recipient,
                    template=r.template,
                    sent_at=r.sent_at,
                    payload=json.dumps(r.payload) if r.payload else None,
                )
                for r in rows
            ]

    @strawberry.field
    async def saved_filters(self, scope: Optional[str] = None) -> list[SavedFilterType]:
        async with async_session() as session:
            query = select(SavedFilter).order_by(SavedFilter.created_at.desc())
            if scope:
                query = query.where(SavedFilter.scope == scope)
            result = await session.execute(query)
            rows = result.scalars().all()
            return [_saved_filter_to_type(f) for f in rows]

    @strawberry.field
    async def incident_children(self, parent_id: str) -> list[IncidentType]:
        """Return all child incidents grouped under `parent_id`."""
        async with async_session() as session:
            result = await session.execute(
                select(Incident)
                .where(Incident.parent_incident_id == parent_id)
                .order_by(Incident.created_at.asc())
            )
            children = result.scalars().all()
            out: list[IncidentType] = []
            for inc in children:
                assignee = None
                if inc.assignee_id:
                    u = await session.execute(
                        select(User).where(User.id == inc.assignee_id)
                    )
                    assignee = _user_to_type(u.scalar_one_or_none())
                out.append(_incident_to_type(inc, assignee, 0))
            return out

    @strawberry.field
    async def incident_traces(self, incident_id: str) -> list[TraceType]:
        """
        Return reconstructed traces for the exemplar trace_ids attached to an
        incident. One TraceType per exemplar; spans ordered by start time.
        """
        async with async_session() as session:
            result = await session.execute(
                select(Incident).where(Incident.id == incident_id)
            )
            inc = result.scalar_one_or_none()
        if inc is None or not inc.exemplar_trace_ids:
            return []

        pool = await get_raw_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT time, trace_id, span_id, parent_span_id, server_id,
                       service, name, duration_ms, status, attributes
                FROM spans
                WHERE trace_id = ANY($1::text[])
                ORDER BY trace_id, time ASC
                """,
                list(inc.exemplar_trace_ids),
            )

        by_trace: dict[str, list[SpanType]] = {}
        for r in rows:
            attrs = r["attributes"]
            attrs_str: Optional[str]
            if attrs is None:
                attrs_str = None
            elif isinstance(attrs, str):
                attrs_str = attrs
            else:
                attrs_str = json.dumps(attrs)
            by_trace.setdefault(r["trace_id"], []).append(
                SpanType(
                    time=r["time"],
                    trace_id=r["trace_id"],
                    span_id=r["span_id"],
                    parent_span_id=r["parent_span_id"],
                    server_id=r["server_id"],
                    service=r["service"],
                    name=r["name"],
                    duration_ms=float(r["duration_ms"]),
                    status=r["status"],
                    attributes=attrs_str,
                )
            )

        traces: list[TraceType] = []
        for trace_id in inc.exemplar_trace_ids:
            spans = by_trace.get(trace_id, [])
            if not spans:
                continue
            root = next((s for s in spans if s.parent_span_id is None), spans[0])
            traces.append(
                TraceType(
                    trace_id=trace_id,
                    server_id=root.server_id,
                    root_name=root.name,
                    root_duration_ms=root.duration_ms,
                    spans=spans,
                )
            )
        return traces

    @strawberry.field
    async def logs(
        self,
        server_id: Optional[str] = None,
        service: Optional[str] = None,
        levels: Optional[list[str]] = None,
        from_time: Optional[datetime] = None,
        to_time: Optional[datetime] = None,
        query: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: int = 100,
    ) -> LogConnection:
        """
        Paginated logs query.

        - `query` is full-text matched against `search_vec` (websearch syntax).
        - `cursor` is an opaque base64 of the last item's ISO time; pass back
          to fetch the next older page (results are newest-first).
        """
        limit = max(1, min(limit, 500))
        if from_time is None:
            from_time = datetime.now(timezone.utc) - timedelta(hours=1)
        if to_time is None:
            to_time = datetime.now(timezone.utc)

        # Cursor decoding: ISO timestamp of the last item from the previous page
        cursor_time: Optional[datetime] = None
        if cursor:
            try:
                cursor_time = datetime.fromisoformat(
                    base64.urlsafe_b64decode(cursor.encode()).decode()
                )
            except Exception:
                cursor_time = None

        where: list[str] = ["time >= $1", "time <= $2"]
        params: list[object] = [from_time, to_time]

        if server_id:
            params.append(server_id)
            where.append(f"server_id = ${len(params)}")
        if service:
            params.append(service)
            where.append(f"service = ${len(params)}")
        if levels:
            params.append([lv.upper() for lv in levels])
            where.append(f"level = ANY(${len(params)}::text[])")
        if query:
            params.append(query)
            where.append(f"search_vec @@ websearch_to_tsquery('english', ${len(params)})")
        if cursor_time is not None:
            params.append(cursor_time)
            where.append(f"time < ${len(params)}")

        # Fetch one extra row to detect has_more
        params.append(limit + 1)
        sql = f"""
            SELECT time, server_id, service, level, message, fields, trace_id
            FROM logs
            WHERE {" AND ".join(where)}
            ORDER BY time DESC
            LIMIT ${len(params)}
        """

        pool = await get_raw_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        has_more = len(rows) > limit
        page_rows = rows[:limit]

        items = [
            LogType(
                time=r["time"],
                server_id=r["server_id"],
                service=r["service"],
                level=r["level"],
                message=r["message"],
                fields=r["fields"] if r["fields"] is None else json.dumps(
                    json.loads(r["fields"]) if isinstance(r["fields"], str) else r["fields"]
                ),
                trace_id=r["trace_id"],
            )
            for r in page_rows
        ]

        next_cursor: Optional[str] = None
        if has_more and page_rows:
            last_time = page_rows[-1]["time"].isoformat()
            next_cursor = base64.urlsafe_b64encode(last_time.encode()).decode()

        return LogConnection(items=items, next_cursor=next_cursor, has_more=has_more)
