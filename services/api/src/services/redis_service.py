"""
Sentinel API Service — Redis Service

Provides Redis access for caching, server state reading,
and pub/sub publishing for incident updates.
"""

import json
from typing import Any, Optional

import redis.asyncio as aioredis
import structlog

from ..config import REDIS_URL

log: structlog.stdlib.BoundLogger = structlog.get_logger()

_redis: Optional[aioredis.Redis] = None


async def init_redis() -> None:
    """Initialize the Redis connection."""
    global _redis
    _redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    await _redis.ping()
    log.info("redis.connected")


async def close_redis() -> None:
    """Close the Redis connection."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        log.info("redis.closed")


def get_redis() -> aioredis.Redis:
    """Get the Redis client instance."""
    if _redis is None:
        raise RuntimeError("Redis is not initialized")
    return _redis


async def get_server_state(server_id: str) -> dict[str, str] | None:
    """Get the latest state for a server from Redis."""
    r = get_redis()
    data = await r.hgetall(f"server:{server_id}")
    return data if data else None


async def get_all_server_states() -> list[dict[str, str]]:
    """Get latest state for all known servers."""
    r = get_redis()
    servers: list[dict[str, str]] = []

    # Scan for all server keys
    async for key in r.scan_iter(match="server:*"):
        data = await r.hgetall(key)
        if data:
            servers.append(data)

    return servers


async def publish_incident_update(incident_data: dict[str, Any]) -> None:
    """Publish an incident update to the Redis pub/sub channel."""
    r = get_redis()
    await r.publish("alerts:update", json.dumps(incident_data, default=str))
    log.info("redis.incident_update.published", incident_id=incident_data.get("id"))


async def get_ai_cache(incident_id: str) -> str | None:
    """Get cached AI analysis from Redis."""
    r = get_redis()
    return await r.get(f"ai:incident:{incident_id}")


async def set_ai_cache(incident_id: str, analysis: str, ttl: int = 900) -> None:
    """Cache AI analysis in Redis with TTL."""
    r = get_redis()
    await r.setex(f"ai:incident:{incident_id}", ttl, analysis)
