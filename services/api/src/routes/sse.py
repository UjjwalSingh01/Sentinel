"""
Sentinel API Service — Server-Sent Events Endpoint

Streams real-time incident events to connected clients.
Subscribes to Redis pub/sub channels for alerts and updates.
"""

import asyncio
import json
from typing import AsyncGenerator

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException, Request, status
from sse_starlette.sse import EventSourceResponse

import structlog

from ..auth.jwt_handler import verify_access_token
from ..config import REDIS_URL

log: structlog.stdlib.BoundLogger = structlog.get_logger()

router = APIRouter(tags=["sse"])


async def _event_generator(
    request: Request,
    user_id: str,
) -> AsyncGenerator[dict[str, str], None]:
    """Generate SSE events from Redis pub/sub channels."""
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()

    try:
        await pubsub.subscribe("alerts", "alerts:update")
        log.info("sse.client.connected", user_id=user_id)

        # Send a heartbeat to establish the connection
        yield {"event": "connected", "data": json.dumps({"status": "connected"})}

        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                log.info("sse.client.disconnected", user_id=user_id)
                break

            message = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=1.0,
            )

            if message is not None and message["type"] == "message":
                channel = message["channel"]
                data = message["data"]

                if channel == "alerts":
                    yield {"event": "newIncident", "data": data}
                    log.debug("sse.event.sent", event="newIncident", user_id=user_id)
                elif channel == "alerts:update":
                    yield {"event": "incidentUpdated", "data": data}
                    log.debug("sse.event.sent", event="incidentUpdated", user_id=user_id)
            else:
                # Send periodic keepalive
                yield {"event": "keepalive", "data": ""}
                await asyncio.sleep(1)

    except asyncio.CancelledError:
        log.info("sse.client.cancelled", user_id=user_id)
    finally:
        await pubsub.unsubscribe("alerts", "alerts:update")
        await pubsub.aclose()
        await redis_client.aclose()
        log.info("sse.client.cleanup", user_id=user_id)


@router.get("/api/events")
async def sse_events(request: Request, token: str = "") -> EventSourceResponse:
    """
    SSE endpoint for real-time incident streaming.
    Authentication is via the `token` query parameter since
    EventSource cannot send custom headers.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is required",
        )

    payload = verify_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload["sub"]

    return EventSourceResponse(
        _event_generator(request, user_id),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


async def _log_tail_generator(
    request: Request,
    user_id: str,
    server_id: str | None,
) -> AsyncGenerator[dict[str, str], None]:
    """Stream live logs from Redis `logs.live.<server_id>` (or `logs.live.*`)."""
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    pubsub = redis_client.pubsub()

    pattern = f"logs.live.{server_id}" if server_id else "logs.live.*"
    try:
        await pubsub.psubscribe(pattern)
        log.info("sse.log_tail.connected", user_id=user_id, pattern=pattern)

        yield {"event": "connected", "data": json.dumps({"status": "connected", "pattern": pattern})}

        while True:
            if await request.is_disconnected():
                log.info("sse.log_tail.disconnected", user_id=user_id)
                break

            message = await pubsub.get_message(
                ignore_subscribe_messages=True,
                timeout=1.0,
            )

            if message is not None and message["type"] == "pmessage":
                yield {"event": "log", "data": message["data"]}
            else:
                yield {"event": "keepalive", "data": ""}
                await asyncio.sleep(1)

    except asyncio.CancelledError:
        log.info("sse.log_tail.cancelled", user_id=user_id)
    finally:
        await pubsub.punsubscribe(pattern)
        await pubsub.aclose()
        await redis_client.aclose()
        log.info("sse.log_tail.cleanup", user_id=user_id)


@router.get("/api/logs/tail")
async def sse_log_tail(
    request: Request,
    token: str = "",
    server_id: str = "",
) -> EventSourceResponse:
    """
    SSE endpoint streaming live log lines.
    Omit `server_id` to tail all servers (uses Redis pattern subscribe).
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is required",
        )

    payload = verify_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload["sub"]
    sid = server_id.strip() or None

    return EventSourceResponse(
        _log_tail_generator(request, user_id, sid),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
