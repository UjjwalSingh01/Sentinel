"""
Sentinel API Service — Main Application

FastAPI application combining GraphQL, REST auth, SSE, and health endpoints.
"""

import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext

from .db.database import async_session, close_db, get_raw_pool
from .db.models import User
from .graphql.schema import graphql_router
from .routes.auth import router as auth_router
from .routes.health import router as health_router
from .routes.spans import router as spans_router
from .routes.sse import router as sse_router
from .services.ai_service import init_gemini
from .services.redis_service import close_redis, init_redis

from sqlalchemy import select, text

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO)
    ),
)

log: structlog.stdlib.BoundLogger = structlog.get_logger()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def _seed_users() -> None:
    """Create demo users if the users table is empty."""
    async with async_session() as session:
        result = await session.execute(select(User).limit(1))
        if result.scalar_one_or_none() is not None:
            log.info("seed.users.skipped", reason="Users already exist")
            return

        demo_users = [
            User(
                id=str(uuid.uuid4()),
                email="admin@sentinel.io",
                name="Admin User",
                role="admin",
                hashed_password=pwd_context.hash("sentinel123"),
            ),
            User(
                id=str(uuid.uuid4()),
                email="alice@sentinel.io",
                name="Alice Chen",
                role="engineer",
                hashed_password=pwd_context.hash("sentinel123"),
            ),
            User(
                id=str(uuid.uuid4()),
                email="bob@sentinel.io",
                name="Bob Martinez",
                role="engineer",
                hashed_password=pwd_context.hash("sentinel123"),
            ),
            User(
                id=str(uuid.uuid4()),
                email="carol@sentinel.io",
                name="Carol Park",
                role="viewer",
                hashed_password=pwd_context.hash("sentinel123"),
            ),
        ]

        for user in demo_users:
            session.add(user)

        await session.commit()
        log.info("seed.users.created", count=len(demo_users))


async def _ensure_schema() -> None:
    """Ensure database schema exists (tables created by processor, but also ensure here)."""
    pool = await get_raw_pool()
    async with pool.acquire() as conn:
        # Ensure TimescaleDB extension
        await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")

        # Ensure tables exist
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

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id              TEXT PRIMARY KEY,
                server_id       TEXT NOT NULL,
                metric_type     TEXT NOT NULL,
                severity        TEXT NOT NULL,
                current_value   DOUBLE PRECISION NOT NULL,
                threshold       DOUBLE PRECISION NOT NULL,
                message         TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'open',
                ai_analysis     TEXT,
                assignee_id     TEXT,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                acknowledged_at TIMESTAMPTZ,
                resolved_at     TIMESTAMPTZ
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS metrics (
                time        TIMESTAMPTZ NOT NULL,
                server_id   TEXT NOT NULL,
                cpu         DOUBLE PRECISION,
                memory      DOUBLE PRECISION,
                disk        DOUBLE PRECISION,
                latency_ms  DOUBLE PRECISION
            );
        """)

        await conn.execute("""
            SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);
        """)

        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_metrics_server_id_time
            ON metrics (server_id, time DESC);
        """)

        # Log pipeline schema (mirrors services/processor/src/storage.py)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS log_context JSONB;
        """)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS rule_id TEXT;
        """)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS rule_name TEXT;
        """)
        # Phase 3
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS parent_incident_id TEXT;
        """)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS dedup_fingerprint TEXT;
        """)
        await conn.execute("""
            ALTER TABLE incidents
            ADD COLUMN IF NOT EXISTS exemplar_trace_ids TEXT[];
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS spans (
                time            TIMESTAMPTZ NOT NULL,
                trace_id        TEXT NOT NULL,
                span_id         TEXT NOT NULL,
                parent_span_id  TEXT,
                server_id       TEXT NOT NULL,
                service         TEXT,
                name            TEXT NOT NULL,
                duration_ms     DOUBLE PRECISION NOT NULL,
                status          TEXT,
                attributes      JSONB
            );
        """)
        await conn.execute("""
            SELECT create_hypertable('spans', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 hour');
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_spans_server_time
            ON spans (server_id, time DESC);
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_spans_trace_id
            ON spans (trace_id);
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS alert_rules (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                type        TEXT NOT NULL,
                severity    TEXT NOT NULL,
                expression  JSONB NOT NULL,
                enabled     BOOLEAN NOT NULL DEFAULT TRUE,
                runbook_url TEXT,
                created_by  TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)

        # Phase 4: dashboards + saved filters (mirrors processor schema)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS dashboards (
                id          TEXT PRIMARY KEY,
                owner_id    TEXT NOT NULL,
                name        TEXT NOT NULL,
                layout      JSONB NOT NULL DEFAULT '[]'::jsonb,
                is_default  BOOLEAN NOT NULL DEFAULT FALSE,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_dashboards_owner
            ON dashboards (owner_id);
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS saved_filters (
                id          TEXT PRIMARY KEY,
                owner_id    TEXT NOT NULL,
                name        TEXT NOT NULL,
                scope       TEXT NOT NULL,
                filter      JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_saved_filters_owner_scope
            ON saved_filters (owner_id, scope);
        """)

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

    log.info("schema.ensured")


# ---------------------------------------------------------------------------
# Application lifecycle
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Application startup and shutdown."""
    log.info("api.starting")

    # Initialize services
    await init_redis()
    init_gemini()

    # Ensure schema and seed data
    await _ensure_schema()
    await _seed_users()

    log.info("api.started")
    yield

    log.info("api.stopping")
    await close_redis()
    await close_db()


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Sentinel API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(auth_router)
app.include_router(health_router)
app.include_router(sse_router)
app.include_router(spans_router)

# GraphQL
app.include_router(graphql_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
