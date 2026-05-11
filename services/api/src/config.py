"""
Sentinel API Service — Configuration
"""

import os
from typing import Final

DATABASE_URL: Final[str] = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://sentinel:sentinel_secret@timescaledb:5432/sentinel",
)
DATABASE_URL_SYNC: Final[str] = os.getenv(
    "DATABASE_URL_SYNC",
    "postgresql://sentinel:sentinel_secret@timescaledb:5432/sentinel",
)
ASYNCPG_DSN: Final[str] = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

REDIS_URL: Final[str] = os.getenv("REDIS_URL", "redis://redis:6379/0")

JWT_SECRET: Final[str] = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM: Final[str] = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_EXPIRY_MINUTES: Final[int] = int(os.getenv("JWT_ACCESS_EXPIRY_MINUTES", "60"))
JWT_REFRESH_EXPIRY_MINUTES: Final[int] = int(os.getenv("JWT_REFRESH_EXPIRY_MINUTES", "10080"))

GEMINI_API_KEY: Final[str] = os.getenv("GEMINI_API_KEY", "")

LOG_LEVEL: Final[str] = os.getenv("LOG_LEVEL", "INFO")
