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

# GraphQL
app.include_router(graphql_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
