"""
Sentinel Stream Processor — TimescaleDB Storage

Manages the metrics hypertable and writes time-series data.
"""

from datetime import datetime
from typing import Optional

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

        log.info("storage.schema.initialized")


async def close_storage() -> None:
    """Close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        log.info("storage.pool.closed")


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
) -> None:
    """Create an incident record in PostgreSQL."""
    if _pool is None:
        raise RuntimeError("Storage pool is not initialized")

    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO incidents (id, server_id, metric_type, severity, current_value, threshold, message, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
            ON CONFLICT (id) DO NOTHING
            """,
            incident_id, server_id, metric_type, severity, current_value, threshold, message,
        )
    log.info(
        "storage.incident.created",
        incident_id=incident_id,
        server_id=server_id,
        severity=severity,
    )
