"""
Sentinel Notification Service

Hosts a tiny FastAPI health endpoint and runs the notifier loops in the
background. Phase 5 §5.1: page the on-call when an incident fires, and
escalate to admins if it isn't acknowledged within the window.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI

from .db import close_db, init_db
from .notifier import run_all

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

_notifier_task: asyncio.Task[None] | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    global _notifier_task
    log.info("notification.starting")
    await init_db()
    _notifier_task = asyncio.create_task(run_all())
    yield
    log.info("notification.stopping")
    if _notifier_task is not None:
        _notifier_task.cancel()
        try:
            await _notifier_task
        except asyncio.CancelledError:
            pass
    await close_db()


app = FastAPI(
    title="Sentinel Notification Service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "notification"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8004)
