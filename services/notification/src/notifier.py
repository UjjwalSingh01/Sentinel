"""
Sentinel Notification Service — Core Notifier

Three async loops:

    1. `consume_incidents` subscribes to `alerts` (Redis pub/sub).
       On every new incident, look up the on-call recipient, send the
       initial email, write a `notification_log` row, and schedule an
       escalation timer in the `notifications:pending` sorted set.

    2. `consume_acknowledgements` subscribes to `incidents.acknowledged`.
       On every ack, remove the incident's timer from the pending set so
       the admin escalation doesn't fire.

    3. `run_escalation_timer` polls the sorted set every few seconds.
       For each timer whose score is <= now, re-check the incident's
       acknowledged_at; if still unacked, fan out an admin escalation
       email and write another `notification_log` row.

Child incidents (deduped under a parent) are skipped — only parents page.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Optional

import redis.asyncio as aioredis
import structlog

from .config import (
    ADMIN_EMAIL_FALLBACK,
    DEFAULT_ON_CALL_EMAIL,
    ESCALATION_SECONDS,
    REDIS_ACK_CHANNEL,
    REDIS_INCIDENTS_CHANNEL,
    REDIS_PENDING_KEY,
    REDIS_URL,
)
from .db import (
    admin_emails,
    current_on_call_email,
    is_acknowledged,
    write_notification_log,
)
from .drivers import get_driver

log: structlog.stdlib.BoundLogger = structlog.get_logger()


def _format_incident_email(payload: dict[str, Any]) -> tuple[str, str]:
    """Return (subject, body) for the on-call email."""
    sev = str(payload.get("severity", "warning")).upper()
    server = payload.get("server_id", "?")
    rule = payload.get("rule_name") or payload.get("metric_type", "alert")
    msg = payload.get("message", "")
    incident_id = payload.get("id", "?")

    subject = f"[Sentinel {sev}] {server} — {rule}"
    body = (
        f"A {sev.lower()} incident just fired.\n\n"
        f"Incident ID: {incident_id}\n"
        f"Server:      {server}\n"
        f"Rule:        {rule}\n"
        f"Message:     {msg}\n\n"
        f"Acknowledge in Sentinel within {ESCALATION_SECONDS // 60} minutes "
        f"or this incident will be escalated to admins."
    )
    return subject, body


def _format_admin_email(payload: dict[str, Any]) -> tuple[str, str]:
    sev = str(payload.get("severity", "warning")).upper()
    server = payload.get("server_id", "?")
    rule = payload.get("rule_name") or payload.get("metric_type", "alert")
    incident_id = payload.get("id", "?")

    subject = f"[Sentinel ESCALATED {sev}] {server} — {rule}"
    body = (
        f"The on-call engineer did not acknowledge a {sev.lower()} incident "
        f"within {ESCALATION_SECONDS // 60} minutes.\n\n"
        f"Incident ID: {incident_id}\n"
        f"Server:      {server}\n"
        f"Rule:        {rule}\n\n"
        "Please investigate."
    )
    return subject, body


async def _send_on_call(incident: dict[str, Any]) -> Optional[str]:
    """Send the initial on-call email. Returns the recipient (or None on failure)."""
    recipient = await current_on_call_email() or DEFAULT_ON_CALL_EMAIL
    subject, body = _format_incident_email(incident)
    ok = await get_driver().send(recipient, subject, body)
    if not ok:
        return None
    await write_notification_log(
        incident_id=str(incident["id"]),
        channel="email",
        recipient=recipient,
        template="on_call",
        payload={"severity": incident.get("severity"), "subject": subject},
    )
    return recipient


async def _send_admin_escalation(incident: dict[str, Any]) -> None:
    recipients = await admin_emails()
    if not recipients:
        recipients = [ADMIN_EMAIL_FALLBACK]

    subject, body = _format_admin_email(incident)
    for recipient in recipients:
        ok = await get_driver().send(recipient, subject, body)
        if ok:
            await write_notification_log(
                incident_id=str(incident["id"]),
                channel="email",
                recipient=recipient,
                template="admin_escalation",
                payload={"severity": incident.get("severity"), "subject": subject},
            )


# ---------------------------------------------------------------------------
# Loop 1: incidents (alerts channel)
# ---------------------------------------------------------------------------
async def consume_incidents(redis_client: aioredis.Redis) -> None:
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(REDIS_INCIDENTS_CHANNEL)
    log.info("notification.incident_listener.subscribed", channel=REDIS_INCIDENTS_CHANNEL)

    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                incident = json.loads(message["data"])
            except (TypeError, ValueError) as exc:
                log.warning("notification.incident.parse_failed", error=str(exc))
                continue

            incident_id = str(incident.get("id") or "")
            if not incident_id:
                continue

            try:
                recipient = await _send_on_call(incident)
                if recipient is None:
                    log.warning("notification.incident.send_skipped", incident_id=incident_id)
                    continue

                # Schedule escalation: store the JSON so we don't need to re-fetch.
                due_at = time.time() + ESCALATION_SECONDS
                await redis_client.zadd(
                    REDIS_PENDING_KEY,
                    {json.dumps({"id": incident_id, "incident": incident}): due_at},
                )
                log.info(
                    "notification.incident.scheduled",
                    incident_id=incident_id,
                    recipient=recipient,
                    due_in_s=ESCALATION_SECONDS,
                )
            except Exception as exc:
                log.error("notification.incident.handle_failed", incident_id=incident_id, error=str(exc))
    finally:
        await pubsub.unsubscribe(REDIS_INCIDENTS_CHANNEL)
        await pubsub.aclose()


# ---------------------------------------------------------------------------
# Loop 2: acks (incidents.acknowledged channel)
# ---------------------------------------------------------------------------
async def consume_acknowledgements(redis_client: aioredis.Redis) -> None:
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(REDIS_ACK_CHANNEL)
    log.info("notification.ack_listener.subscribed", channel=REDIS_ACK_CHANNEL)

    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                ack = json.loads(message["data"])
                incident_id = str(ack.get("id") or ack.get("incident_id") or "")
            except (TypeError, ValueError):
                continue
            if not incident_id:
                continue

            # Find and remove every pending timer matching this incident id.
            removed = 0
            members = await redis_client.zrange(REDIS_PENDING_KEY, 0, -1)
            for raw in members:
                try:
                    obj = json.loads(raw)
                except (TypeError, ValueError):
                    continue
                if obj.get("id") == incident_id:
                    removed += await redis_client.zrem(REDIS_PENDING_KEY, raw)

            if removed:
                log.info(
                    "notification.ack.cancelled_escalation",
                    incident_id=incident_id,
                    removed=removed,
                )
    finally:
        await pubsub.unsubscribe(REDIS_ACK_CHANNEL)
        await pubsub.aclose()


# ---------------------------------------------------------------------------
# Loop 3: escalation timer (Redis sorted set polling)
# ---------------------------------------------------------------------------
async def run_escalation_timer(redis_client: aioredis.Redis, poll_seconds: float = 5.0) -> None:
    log.info("notification.timer.started", poll_seconds=poll_seconds)
    while True:
        try:
            now = time.time()
            due = await redis_client.zrangebyscore(REDIS_PENDING_KEY, 0, now)
            for raw in due:
                try:
                    obj = json.loads(raw)
                except (TypeError, ValueError):
                    await redis_client.zrem(REDIS_PENDING_KEY, raw)
                    continue

                incident_id = str(obj.get("id") or "")
                if not incident_id:
                    await redis_client.zrem(REDIS_PENDING_KEY, raw)
                    continue

                # Re-check ack state right before firing — protects against
                # races between the listener and an ack landing during polling.
                if await is_acknowledged(incident_id):
                    log.info("notification.timer.skip_acknowledged", incident_id=incident_id)
                    await redis_client.zrem(REDIS_PENDING_KEY, raw)
                    continue

                await _send_admin_escalation(obj.get("incident") or {"id": incident_id})
                await redis_client.zrem(REDIS_PENDING_KEY, raw)
                log.info("notification.timer.escalated", incident_id=incident_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.error("notification.timer.error", error=str(exc))

        await asyncio.sleep(poll_seconds)


async def run_all() -> None:
    """Top-level entry: connect Redis once and run all three loops concurrently."""
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    await redis_client.ping()
    log.info("notification.redis.connected")

    try:
        await asyncio.gather(
            consume_incidents(redis_client),
            consume_acknowledgements(redis_client),
            run_escalation_timer(redis_client),
        )
    finally:
        await redis_client.aclose()
