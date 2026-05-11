"""
Sentinel API Service — Database Connection
"""

from typing import AsyncIterator

import asyncpg
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import structlog

from ..config import ASYNCPG_DSN, DATABASE_URL

log: structlog.stdlib.BoundLogger = structlog.get_logger()

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Raw asyncpg pool for TimescaleDB queries
_raw_pool: asyncpg.Pool | None = None


async def get_raw_pool() -> asyncpg.Pool:
    """Get or create the raw asyncpg connection pool."""
    global _raw_pool
    if _raw_pool is None:
        _raw_pool = await asyncpg.create_pool(dsn=ASYNCPG_DSN, min_size=2, max_size=10)
        log.info("db.raw_pool.created")
    return _raw_pool


async def get_session() -> AsyncIterator[AsyncSession]:
    """Yield an async database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def close_db() -> None:
    """Close all database connections."""
    global _raw_pool
    await engine.dispose()
    if _raw_pool is not None:
        await _raw_pool.close()
        _raw_pool = None
    log.info("db.connections.closed")
