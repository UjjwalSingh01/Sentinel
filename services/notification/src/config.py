"""
Sentinel Notification Service — Configuration
"""

import os
from typing import Final

DATABASE_URL: Final[str] = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://sentinel:sentinel_secret@timescaledb:5432/sentinel",
)
ASYNCPG_DSN: Final[str] = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

REDIS_URL: Final[str] = os.getenv("REDIS_URL", "redis://redis:6379/0")

# Email driver: 'stub' (dev, logs only) or 'smtp' (production).
EMAIL_DRIVER: Final[str] = os.getenv("EMAIL_DRIVER", "stub").lower()

# Fallback recipients used when no on-call schedule entry / no admins exist.
DEFAULT_ON_CALL_EMAIL: Final[str] = os.getenv(
    "DEFAULT_ON_CALL_EMAIL", "oncall@sentinel.local"
)
ADMIN_EMAIL_FALLBACK: Final[str] = os.getenv(
    "ADMIN_EMAIL_FALLBACK", "admin@sentinel.local"
)

# Escalation window: how long the on-call has to ack before admin escalation.
ESCALATION_SECONDS: Final[int] = int(os.getenv("ESCALATION_SECONDS", "900"))

# SMTP configuration (only used when EMAIL_DRIVER=smtp).
SMTP_HOST: Final[str] = os.getenv("SMTP_HOST", "")
SMTP_PORT: Final[int] = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME: Final[str] = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD: Final[str] = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM: Final[str] = os.getenv("SMTP_FROM", "sentinel@localhost")
SMTP_USE_TLS: Final[bool] = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")

LOG_LEVEL: Final[str] = os.getenv("LOG_LEVEL", "INFO")

# Redis keys / channels
REDIS_PENDING_KEY: Final[str] = "notifications:pending"
REDIS_INCIDENTS_CHANNEL: Final[str] = "alerts"
REDIS_ACK_CHANNEL: Final[str] = "incidents.acknowledged"
