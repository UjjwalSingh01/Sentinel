"""
Sentinel Stream Processor — TimescaleDB Storage

Manages the metrics hypertable and writes time-series data.
"""

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import asyncpg
import structlog

from .config import ASYNCPG_DSN

log: structlog.stdlib.BoundLogger = structlog.get_logger()

_pool: Optional[asyncpg.Pool] = None


async def init_storage() -> None:
    """Initialize the connection pool and ensure the schema exists."""
    global _pool
    _pool = await asyncpg.create_pool(dsn=ASYNCPG_DSN, min_size=2, max_size=10)
    log.info("storage.pool.created")

    async with _pool.acquire() as conn:
        # Ensure TimescaleDB extension
        await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")

        # Create metrics hypertable
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS metrics (
                time        TIMESTAMPTZ NOT NULL,
                server_id   TEXT        NOT NULL,
                cpu         DOUBLE PRECISION,
                memory      DOUBLE PRECISION,
                disk        DOUBLE PRECISION,
                latency_ms  DOUBLE PRECISION
            );
        """)

        # Convert to hypertable (idempotent with if_not_exists)
        await conn.execute("""
            SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);
        """)

        # Create index for server_id queries
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_metrics_server_id_time
            ON metrics (server_id, time DESC);
        """)

        # Ensure incidents table exists (processor creates incidents directly)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id          TEXT PRIMARY KEY,
                server_id   TEXT NOT NULL,
                metric_type TEXT NOT NULL,
                severity    TEXT NOT NULL,
                current_value DOUBLE PRECISION NOT NULL,
                threshold   DOUBLE PRECISION NOT NULL,
                message     TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'open',
                ai_analysis TEXT,
                assignee_id TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                acknowledged_at TIMESTAMPTZ,
                resolved_at TIMESTAMPTZ
            );
        """)

        # Create users table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              TEXT PRIMARY KEY,
                email           TEXT UNIQUE NOT NULL,
                name            TEXT NOT NULL,
                role            TEXT NOT NULL DEFAULT 'engineer',
                hashed_password TEXT NOT NULL,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # Add log_context column to incidents (idempotent)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS log_context JSONB;
        """)

        # Create logs hypertable for log pipeline
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS logs (
                time        TIMESTAMPTZ NOT NULL,
                server_id   TEXT NOT NULL,
                service     TEXT,
                level       TEXT NOT NULL,
                message     TEXT NOT NULL,
                fields      JSONB,
                trace_id    TEXT,
                search_vec  TSVECTOR
            );
        """)

        await conn.execute("""
            SELECT create_hypertable('logs', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour');
        """)

        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_server_id_time
            ON logs (server_id, time DESC);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_level_time
            ON logs (level, time DESC);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_search
            ON logs USING GIN (search_vec);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_fields
            ON logs USING GIN (fields);
        """)

        log.info("storage.schema.initialized")


async def close_storage() -> None:
    """Close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        log.info("storage.pool.closed")


def is_storage_ready() -> bool:
    """True once init_storage() has finished creating the connection pool."""
    return _pool is not None


async def write_metric(
    timestamp: datetime,
    server_id: str,
    cpu: float,
    memory: float,
    disk: float,
    latency_ms: float,
) -> None:
    """Write a single metric point to TimescaleDB."""
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO metrics (time, server_id, cpu, memory, disk, latency_ms)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            timestamp, server_id, cpu, memory, disk, latency_ms,
        )


async def create_incident(
    incident_id: str,
    server_id: str,
    metric_type: str,
    severity: str,
    current_value: float,
    threshold: float,
    message: str,
    log_context: Optional[dict[str, Any]] = None,
) -> None:
    """Create an incident record in PostgreSQL with optional pre-captured log context."""
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO incidents
                (id, server_id, metric_type, severity, current_value, threshold, message, status, log_context)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8::jsonb)
            ON CONFLICT (id) DO NOTHING
            """,
            incident_id, server_id, metric_type, severity, current_value, threshold, message,
            json.dumps(log_context) if log_context is not None else None,
        )
    log.info(
        "storage.incident.created",
        incident_id=incident_id,
        server_id=server_id,
        severity=severity,
        has_log_context=log_context is not None,
    )


async def write_log_batch(records: list[dict[str, Any]]) -> int:
    """
    Write a batch of log records to the logs hypertable.
    Returns the number of rows written. Skips malformed records silently.
    """
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")
    if not records:
        return 0

    rows: list[tuple[Any, ...]] = []
    for rec in records:
        try:
            ts = rec["timestamp"]
            if isinstance(ts, str):
                ts_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            else:
                ts_dt = ts
            if ts_dt.tzinfo is None:
                ts_dt = ts_dt.replace(tzinfo=timezone.utc)

            rows.append((
                ts_dt,
                str(rec["server_id"]),
                rec.get("service"),
                str(rec.get("level", "INFO")).upper(),
                str(rec.get("message", ""))[:8192],
                json.dumps(rec["fields"]) if rec.get("fields") else None,
                rec.get("trace_id"),
            ))
        except (KeyError, TypeError, ValueError) as exc:
            log.warning("storage.log.skip", error=str(exc), record=rec)

    if not rows:
        return 0

    async with _pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO logs (time, server_id, service, level, message, fields, trace_id, search_vec)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7,
                    to_tsvector('english', COALESCE($3, '') || ' ' || $5))
            """,
            rows,
        )

    return len(rows)


async def fetch_log_snapshot(
    server_id: str,
    start: datetime,
    end: datetime,
    levels: tuple[str, ...] = ("WARN", "WARNING", "ERROR", "FATAL"),
    limit: int = 500,
) -> list[dict[str, Any]]:
    """
    Fetch raw log lines for an incident time window.
    Returns at most `limit` lines, ordered oldest-first.
    """
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT time, server_id, service, level, message, fields, trace_id
            FROM logs
            WHERE server_id = $1
              AND time BETWEEN $2 AND $3
              AND level = ANY($4::text[])
            ORDER BY time ASC
            LIMIT $5
            """,
            server_id, start, end, list(levels), limit,
        )
    return [
        {
            "time": r["time"].isoformat(),
            "server_id": r["server_id"],
            "service": r["service"],
            "level": r["level"],
            "message": r["message"],
            "fields": r["fields"],
            "trace_id": r["trace_id"],
        }
        for r in rows
    ]
