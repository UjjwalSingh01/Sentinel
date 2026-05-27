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
from ..db.models import Incident, User
from ..services.redis_service import get_all_server_states
from .types import IncidentType, LogConnection, LogType, MetricPointType, ServerType, UserType

from sqlalchemy import select

log: structlog.stdlib.BoundLogger = structlog.get_logger()


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

            incident_types: list[IncidentType] = []
            for inc in incidents:
                assignee = None
                if inc.assignee_id:
                    user_result = await session.execute(
                        select(User).where(User.id == inc.assignee_id)
                    )
                    user = user_result.scalar_one_or_none()
                    if user:
                        assignee = UserType(
                            id=user.id,
                            email=user.email,
                            name=user.name,
                            role=user.role,
                            created_at=user.created_at,
                        )

                incident_types.append(
                    IncidentType(
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
                        resolved_at=inc.resolved_at,
                        log_context=json.dumps(inc.log_context) if inc.log_context else None,
                    )
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
                user = user_result.scalar_one_or_none()
                if user:
                    assignee = UserType(
                        id=user.id,
                        email=user.email,
                        name=user.name,
                        role=user.role,
                        created_at=user.created_at,
                    )

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
                resolved_at=inc.resolved_at,
                log_context=json.dumps(inc.log_context) if inc.log_context else None,
            )

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
