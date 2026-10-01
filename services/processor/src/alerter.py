"""
Sentinel Stream Processor — Alert Publisher

Handles Redis-based alert cooldowns, server state updates,
and pub/sub alert publishing.
"""

import json
from typing import Optional

import redis.asyncio as aioredis
import structlog

from .config import ALERT_COOLDOWN_SECONDS, REDIS_URL, SERVER_STATE_TTL_SECONDS
from .rule_engine import FiredAlert

log: structlog.stdlib.BoundLogger = structlog.get_logger()

_redis: Optional[aioredis.Redis] = None


async def init_alerter() -> None:
    """Initialize the Redis connection."""
    global _redis
    _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    await _redis.ping()
    log.info("alerter.redis.connected")


async def close_alerter() -> None:
    """Close the Redis connection."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        log.info("alerter.redis.closed")


async def update_server_state(
    server_id: str,
    cpu: float,
    memory: float,
    disk: float,
    latency_ms: float,
) -> None:
    """Update the latest server state in Redis."""
    if _redis is None:
        raise RuntimeError("Redis is not initialized")

    key = f"server:{server_id}"
    await _redis.hset(
        key,
        mapping={
            "server_id": server_id,
            "cpu": str(round(cpu, 2)),
            "memory": str(round(memory, 2)),
            "disk": str(round(disk, 2)),
            "latency_ms": str(round(latency_ms, 2)),
        },
    )
    await _redis.expire(key, SERVER_STATE_TTL_SECONDS)


async def check_cooldown(server_id: str, cooldown_key: str) -> bool:
    """Check if an alert is in cooldown. Returns True if in cooldown."""
    if _redis is None:
        raise RuntimeError("Redis is not initialized")

    key = f"alert:cooldown:{server_id}:{cooldown_key}"
    return await _redis.exists(key) > 0


async def set_cooldown(server_id: str, cooldown_key: str) -> None:
    """Set a cooldown key to prevent alert storms."""
    if _redis is None:
        raise RuntimeError("Redis is not initialized")

    key = f"alert:cooldown:{server_id}:{cooldown_key}"
    await _redis.setex(key, ALERT_COOLDOWN_SECONDS, "1")
    log.debug("alerter.cooldown.set", server_id=server_id, cooldown_key=cooldown_key, ttl=ALERT_COOLDOWN_SECONDS)


async def publish_alert(alert: FiredAlert, incident_id: str) -> None:
    """Publish an alert to the Redis pub/sub channel."""
    if _redis is None:
        raise RuntimeError("Redis is not initialized")

    payload = json.dumps({
        "id": incident_id,
        "server_id": alert.server_id,
        "metric_type": alert.metric_type,
        "severity": alert.severity.value,
        "current_value": alert.current_value,
        "threshold": alert.threshold,
        "message": alert.message,
        "status": "open",
        "rule_id": alert.rule_id,
        "rule_name": alert.rule_name,
    })

    await _redis.publish("alerts", payload)
    log.info(
        "alerter.alert.published",
        incident_id=incident_id,
        server_id=alert.server_id,
        severity=alert.severity.value,
        rule_id=alert.rule_id,
    )


async def publish_occurrence(alert: FiredAlert, incident_id: str, occurrence_count: int) -> None:
    """
    Announce a recurrence on an already-claimed incident. Goes out on
    `alerts:update` (a quiet refresh) rather than `alerts`, so it neither
    toasts every console nor pages on-call a second time.
    """
    if _redis is None:
        raise RuntimeError("Redis is not initialized")

    payload = json.dumps({
        "id": incident_id,
        "server_id": alert.server_id,
        "occurrence_count": occurrence_count,
        "current_value": alert.current_value,
    })

    await _redis.publish("alerts:update", payload)
    log.info(
        "alerter.occurrence.published",
        incident_id=incident_id,
        server_id=alert.server_id,
        occurrence_count=occurrence_count,
    )
