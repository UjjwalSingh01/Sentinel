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
