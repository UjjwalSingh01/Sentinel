"""
Sentinel API Service — GraphQL Mutations
"""

import json
from datetime import datetime, timezone

import strawberry
import structlog
from sqlalchemy import select

from ..db.database import async_session
from ..db.models import Incident, User
from ..services.ai_service import analyze_incident
from ..services.redis_service import publish_incident_update
from .types import AiAnalysisType, IncidentType, UserType

log: structlog.stdlib.BoundLogger = structlog.get_logger()


@strawberry.type
class Mutation:
    """Root GraphQL mutation type."""

    @strawberry.mutation
    async def acknowledge_incident(self, id: str) -> IncidentType:
        """Acknowledge an incident."""
        async with async_session() as session:
            result = await session.execute(
                select(Incident).where(Incident.id == id)
            )
            inc = result.scalar_one_or_none()
            if inc is None:
                raise ValueError(f"Incident {id} not found")

            inc.status = "acknowledged"
            inc.acknowledged_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(inc)

            # Publish update via Redis
            await publish_incident_update({
                "id": inc.id,
                "server_id": inc.server_id,
                "status": inc.status,
                "acknowledged_at": inc.acknowledged_at.isoformat() if inc.acknowledged_at else None,
            })

            log.info("incident.acknowledged", incident_id=id)
            return await _to_incident_type(inc, session)

    @strawberry.mutation
    async def resolve_incident(self, id: str) -> IncidentType:
        """Resolve an incident."""
        async with async_session() as session:
            result = await session.execute(
                select(Incident).where(Incident.id == id)
            )
            inc = result.scalar_one_or_none()
            if inc is None:
                raise ValueError(f"Incident {id} not found")

            inc.status = "resolved"
            inc.resolved_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(inc)

            await publish_incident_update({
                "id": inc.id,
                "server_id": inc.server_id,
                "status": inc.status,
                "resolved_at": inc.resolved_at.isoformat() if inc.resolved_at else None,
            })

            log.info("incident.resolved", incident_id=id)
            return await _to_incident_type(inc, session)

    @strawberry.mutation
    async def assign_incident(self, id: str, user_id: str) -> IncidentType:
        """Assign an incident to a user."""
        async with async_session() as session:
            result = await session.execute(
                select(Incident).where(Incident.id == id)
            )
            inc = result.scalar_one_or_none()
            if inc is None:
                raise ValueError(f"Incident {id} not found")

            # Verify user exists
            user_result = await session.execute(
                select(User).where(User.id == user_id)
            )
            user = user_result.scalar_one_or_none()
            if user is None:
                raise ValueError(f"User {user_id} not found")

            inc.assignee_id = user_id
            await session.commit()
            await session.refresh(inc)

            await publish_incident_update({
                "id": inc.id,
                "server_id": inc.server_id,
                "status": inc.status,
                "assignee_id": inc.assignee_id,
                "assignee_name": user.name,
            })

            log.info("incident.assigned", incident_id=id, assignee_id=user_id)
            return await _to_incident_type(inc, session)

    @strawberry.mutation
    async def request_ai_analysis(self, id: str) -> AiAnalysisType:
        """Request AI-powered root-cause analysis for an incident."""
        async with async_session() as session:
            result = await session.execute(
                select(Incident).where(Incident.id == id)
            )
            inc = result.scalar_one_or_none()
            if inc is None:
                raise ValueError(f"Incident {id} not found")

            # Check if analysis already exists on the record
            if inc.ai_analysis:
                return AiAnalysisType(
                    incident_id=id,
                    analysis=inc.ai_analysis,
                    cached=True,
                )

            # Generate analysis (passes pre-captured log_context for richer prompt)
            analysis = await analyze_incident(
                incident_id=id,
                server_id=inc.server_id,
                metric_type=inc.metric_type,
                severity=inc.severity,
                current_value=inc.current_value,
                threshold=inc.threshold,
                message=inc.message,
                log_context=inc.log_context,
            )

            # Store on the incident record
            inc.ai_analysis = analysis
            await session.commit()

            log.info("incident.ai_analysis.completed", incident_id=id)
            return AiAnalysisType(
                incident_id=id,
                analysis=analysis,
                cached=False,
            )


async def _to_incident_type(inc: Incident, session: object) -> IncidentType:
    """Convert an Incident model to a GraphQL IncidentType."""
    from sqlalchemy.ext.asyncio import AsyncSession
    assert isinstance(session, AsyncSession)

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
        rule_id=inc.rule_id,
        rule_name=inc.rule_name,
        parent_incident_id=inc.parent_incident_id,
        child_count=0,
        exemplar_trace_ids=list(inc.exemplar_trace_ids) if inc.exemplar_trace_ids else None,
    )
