"""
Sentinel Notification Service — DB Helpers (direct asyncpg)
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg
import structlog

from .config import ASYNCPG_DSN

log: structlog.stdlib.BoundLogger = structlog.get_logger()

_pool: Optional[asyncpg.Pool] = None


async def init_db() -> None:
    global _pool
    _pool = await asyncpg.create_pool(dsn=ASYNCPG_DSN, min_size=1, max_size=5)
    log.info("notification.db.pool_created")


async def close_db() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _pool_or_raise() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("notification db pool not initialized")
    return _pool


async def current_on_call_email() -> Optional[str]:
    """Find the user currently on-call (now BETWEEN starts_at AND ends_at)."""
    pool = _pool_or_raise()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT u.email
            FROM on_call_schedule s
            JOIN users u ON u.id = s.user_id
            WHERE NOW() BETWEEN s.starts_at AND s.ends_at
            ORDER BY s.starts_at DESC
            LIMIT 1
            """
        )
    return row["email"] if row else None


async def admin_emails() -> list[str]:
    pool = _pool_or_raise()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT email FROM users WHERE role = 'admin'")
    return [r["email"] for r in rows]


async def is_acknowledged(incident_id: str) -> bool:
    pool = _pool_or_raise()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT acknowledged_at, status FROM incidents WHERE id = $1",
            incident_id,
        )
    if row is None:
        # Incident was deleted or never existed — treat as "done" so we stop escalating.
        return True
    if row["acknowledged_at"] is not None:
        return True
    # Resolved without ack also counts as "no longer pending".
    return row["status"] in ("resolved", "acknowledged")


async def write_notification_log(
    incident_id: str,
    channel: str,
    recipient: str,
    template: str,
    payload: dict[str, Any] | None = None,
) -> None:
    pool = _pool_or_raise()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO notification_log
                (id, incident_id, channel, recipient, template, sent_at, payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            """,
            str(uuid.uuid4()),
            incident_id,
            channel,
            recipient,
            template,
            datetime.now(timezone.utc),
            json.dumps(payload) if payload else None,
        )
