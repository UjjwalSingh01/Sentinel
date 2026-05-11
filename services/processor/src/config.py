"""
Sentinel Stream Processor — Configuration
"""

import os
from typing import Final

KAFKA_BOOTSTRAP_SERVERS: Final[str] = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "redpanda:9092")
KAFKA_TOPIC_METRICS: Final[str] = os.getenv("KAFKA_TOPIC_METRICS", "metrics")
KAFKA_GROUP_ID: Final[str] = os.getenv("KAFKA_GROUP_ID", "sentinel-processor")

DATABASE_URL: Final[str] = os.getenv("DATABASE_URL", "postgresql+asyncpg://sentinel:sentinel_secret@timescaledb:5432/sentinel")
# Extract raw asyncpg DSN (strip the +asyncpg part for raw asyncpg usage)
ASYNCPG_DSN: Final[str] = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

REDIS_URL: Final[str] = os.getenv("REDIS_URL", "redis://redis:6379/0")

LOG_LEVEL: Final[str] = os.getenv("LOG_LEVEL", "INFO")

# Alert rule configuration
ALERT_COOLDOWN_SECONDS: Final[int] = 300  # 5 minutes
SERVER_STATE_TTL_SECONDS: Final[int] = 300  # 5 minutes
