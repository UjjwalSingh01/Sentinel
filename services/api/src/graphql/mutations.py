"""
Sentinel API Service — GraphQL Mutations
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import strawberry
import structlog
from sqlalchemy import select

from ..db.database import async_session
from ..db.models import (
    AlertRule,
    Dashboard,
    Incident,
    OnCallEntry,
    SavedFilter,
    User,
)
from ..services.ai_service import analyze_incident
from ..services.redis_service import (
    publish_incident_acknowledged,
    publish_incident_update,
    publish_rules_changed,
)
from .types import (
    AiAnalysisType,
    AlertRuleType,
    DashboardType,
    IncidentType,
    OnCallEntryType,
    SavedFilterType,
    UserType,
)

log: structlog.stdlib.BoundLogger = structlog.get_logger()


@strawberry.type
class Mutation:
    """Root GraphQL mutation type."""

    @strawberry.mutation
    async def acknowledge_incident(
        self, id: str, user_id: Optional[str] = None
    ) -> IncidentType:
        """Acknowledge an incident. Cancels the pending admin escalation."""
        async with async_session() as session:
            result = await session.execute(
                select(Incident).where(Incident.id == id)
            )
            inc = result.scalar_one_or_none()
            if inc is None:
                raise ValueError(f"Incident {id} not found")

            inc.status = "acknowledged"
            inc.acknowledged_at = datetime.now(timezone.utc)
            inc.acknowledged_by = user_id
            await session.commit()
            await session.refresh(inc)

            await publish_incident_update({
                "id": inc.id,
                "server_id": inc.server_id,
                "status": inc.status,
                "acknowledged_at": inc.acknowledged_at.isoformat() if inc.acknowledged_at else None,
                "acknowledged_by": user_id,
            })
            # Tell the notification service to cancel the escalation timer.
            await publish_incident_acknowledged(inc.id, user_id)

            log.info("incident.acknowledged", incident_id=id, user_id=user_id)
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

    # ---------- Phase 4: alert_rules CRUD ----------
    @strawberry.mutation
    async def create_rule(
        self,
        name: str,
        type: str,
        severity: str,
        expression: str,
        enabled: bool = True,
        runbook_url: Optional[str] = None,
    ) -> AlertRuleType:
        """Create a new alert rule. `expression` is a JSON-encoded leaf or composite."""
        try:
            expr_obj = json.loads(expression)
        except json.JSONDecodeError as exc:
            raise ValueError(f"expression is not valid JSON: {exc}")

        rule_id = f"rule-{uuid.uuid4().hex[:12]}"
        async with async_session() as session:
            rule = AlertRule(
                id=rule_id,
                name=name,
                type=type,
                severity=severity,
                expression=expr_obj,
                enabled=enabled,
                runbook_url=runbook_url,
                created_by="user",
            )
            session.add(rule)
            await session.commit()
            await session.refresh(rule)

        await publish_rules_changed(rule_id, "create")
        log.info("rule.created", rule_id=rule_id, name=name)
        return _to_alert_rule_type(rule)

    @strawberry.mutation
    async def update_rule(
        self,
        id: str,
        name: Optional[str] = None,
        severity: Optional[str] = None,
        expression: Optional[str] = None,
        runbook_url: Optional[str] = None,
    ) -> AlertRuleType:
        async with async_session() as session:
            rule = await session.get(AlertRule, id)
            if rule is None:
                raise ValueError(f"Rule {id} not found")

            if name is not None:
                rule.name = name
            if severity is not None:
                rule.severity = severity
            if expression is not None:
                try:
                    rule.expression = json.loads(expression)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"expression is not valid JSON: {exc}")
            if runbook_url is not None:
                rule.runbook_url = runbook_url
            rule.updated_at = datetime.now(timezone.utc)

            await session.commit()
            await session.refresh(rule)

        await publish_rules_changed(id, "update")
        log.info("rule.updated", rule_id=id)
        return _to_alert_rule_type(rule)

    @strawberry.mutation
    async def toggle_rule(self, id: str, enabled: bool) -> AlertRuleType:
        async with async_session() as session:
            rule = await session.get(AlertRule, id)
            if rule is None:
                raise ValueError(f"Rule {id} not found")
            rule.enabled = enabled
            rule.updated_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(rule)

        await publish_rules_changed(id, "toggle")
        log.info("rule.toggled", rule_id=id, enabled=enabled)
        return _to_alert_rule_type(rule)

    @strawberry.mutation
    async def delete_rule(self, id: str) -> bool:
        async with async_session() as session:
            rule = await session.get(AlertRule, id)
            if rule is None:
                return False
            await session.delete(rule)
            await session.commit()

        await publish_rules_changed(id, "delete")
        log.info("rule.deleted", rule_id=id)
        return True

    # ---------- Phase 4: dashboards CRUD ----------
    @strawberry.mutation
    async def create_dashboard(
        self,
        name: str,
        layout: Optional[str] = None,
        owner_id: Optional[str] = None,
    ) -> DashboardType:
        try:
            layout_obj = json.loads(layout) if layout else []
        except json.JSONDecodeError as exc:
            raise ValueError(f"layout is not valid JSON: {exc}")

        d_id = str(uuid.uuid4())
        async with async_session() as session:
            dash = Dashboard(
                id=d_id,
                owner_id=owner_id or "shared",
                name=name,
                layout=layout_obj,
                is_default=False,
            )
            session.add(dash)
            await session.commit()
            await session.refresh(dash)

        log.info("dashboard.created", dashboard_id=d_id)
        return _to_dashboard_type(dash)

    @strawberry.mutation
    async def update_dashboard(
        self,
        id: str,
        name: Optional[str] = None,
        layout: Optional[str] = None,
    ) -> DashboardType:
        async with async_session() as session:
            dash = await session.get(Dashboard, id)
            if dash is None:
                raise ValueError(f"Dashboard {id} not found")
            if name is not None:
                dash.name = name
            if layout is not None:
                try:
                    dash.layout = json.loads(layout)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"layout is not valid JSON: {exc}")
            dash.updated_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(dash)
        log.info("dashboard.updated", dashboard_id=id)
        return _to_dashboard_type(dash)

    @strawberry.mutation
    async def delete_dashboard(self, id: str) -> bool:
        async with async_session() as session:
            dash = await session.get(Dashboard, id)
            if dash is None:
                return False
            await session.delete(dash)
            await session.commit()
        log.info("dashboard.deleted", dashboard_id=id)
        return True

    # ---------- Phase 4: saved_filters CRUD ----------
    @strawberry.mutation
    async def create_saved_filter(
        self,
        name: str,
        scope: str,
        filter: str,
        owner_id: Optional[str] = None,
    ) -> SavedFilterType:
        if scope not in ("incidents", "logs"):
            raise ValueError("scope must be 'incidents' or 'logs'")
        try:
            filter_obj = json.loads(filter)
        except json.JSONDecodeError as exc:
            raise ValueError(f"filter is not valid JSON: {exc}")

        f_id = str(uuid.uuid4())
        async with async_session() as session:
            sf = SavedFilter(
                id=f_id,
                owner_id=owner_id or "shared",
                name=name,
                scope=scope,
                filter=filter_obj,
            )
            session.add(sf)
            await session.commit()
            await session.refresh(sf)
        log.info("saved_filter.created", filter_id=f_id, scope=scope)
        return _to_saved_filter_type(sf)

    @strawberry.mutation
    async def delete_saved_filter(self, id: str) -> bool:
        async with async_session() as session:
            sf = await session.get(SavedFilter, id)
            if sf is None:
                return False
            await session.delete(sf)
            await session.commit()
        log.info("saved_filter.deleted", filter_id=id)
        return True

    # ---------- Phase 5: on-call schedule CRUD ----------
    @strawberry.mutation
    async def create_on_call_entry(
        self,
        user_id: str,
        starts_at: datetime,
        ends_at: datetime,
    ) -> OnCallEntryType:
        if ends_at <= starts_at:
            raise ValueError("ends_at must be after starts_at")
        async with async_session() as session:
            user = await session.get(User, user_id)
            if user is None:
                raise ValueError(f"User {user_id} not found")
            entry = OnCallEntry(
                id=str(uuid.uuid4()),
                user_id=user_id,
                starts_at=starts_at,
                ends_at=ends_at,
            )
            session.add(entry)
            await session.commit()
            await session.refresh(entry)
            user_t = UserType(
                id=user.id,
                email=user.email,
                name=user.name,
                role=user.role,
                created_at=user.created_at,
            )
        log.info("on_call.created", entry_id=entry.id, user_id=user_id)
        return OnCallEntryType(
            id=entry.id,
            user_id=entry.user_id,
            user=user_t,
            starts_at=entry.starts_at,
            ends_at=entry.ends_at,
            created_at=entry.created_at,
        )

    @strawberry.mutation
    async def delete_on_call_entry(self, id: str) -> bool:
        async with async_session() as session:
            entry = await session.get(OnCallEntry, id)
            if entry is None:
                return False
            await session.delete(entry)
            await session.commit()
        log.info("on_call.deleted", entry_id=id)
        return True


def _to_alert_rule_type(rule: AlertRule) -> AlertRuleType:
    return AlertRuleType(
        id=rule.id,
        name=rule.name,
        type=rule.type,
        severity=rule.severity,
        expression=json.dumps(rule.expression),
        enabled=rule.enabled,
        runbook_url=rule.runbook_url,
        created_by=rule.created_by,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _to_dashboard_type(dash: Dashboard) -> DashboardType:
    return DashboardType(
        id=dash.id,
        owner_id=dash.owner_id,
        name=dash.name,
        layout=json.dumps(dash.layout or []),
        is_default=dash.is_default,
        created_at=dash.created_at,
        updated_at=dash.updated_at,
    )


def _to_saved_filter_type(sf: SavedFilter) -> SavedFilterType:
    return SavedFilterType(
        id=sf.id,
        owner_id=sf.owner_id,
        name=sf.name,
        scope=sf.scope,
        filter=json.dumps(sf.filter or {}),
        created_at=sf.created_at,
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
        acknowledged_by=inc.acknowledged_by,
        resolved_at=inc.resolved_at,
        log_context=json.dumps(inc.log_context) if inc.log_context else None,
        rule_id=inc.rule_id,
        rule_name=inc.rule_name,
        parent_incident_id=inc.parent_incident_id,
        child_count=0,
        exemplar_trace_ids=list(inc.exemplar_trace_ids) if inc.exemplar_trace_ids else None,
        occurrence_count=inc.occurrence_count or 0,
        last_occurred_at=inc.last_occurred_at,
    )
