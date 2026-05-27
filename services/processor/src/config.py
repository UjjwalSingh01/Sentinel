"""
Sentinel Stream Processor — Configuration
"""

import os
from typing import Final

KAFKA_BOOTSTRAP_SERVERS: Final[str] = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "redpanda:9092")
KAFKA_TOPIC_METRICS: Final[str] = os.getenv("KAFKA_TOPIC_METRICS", "metrics")
KAFKA_TOPIC_LOGS: Final[str] = os.getenv("KAFKA_TOPIC_LOGS", "logs.raw")
KAFKA_GROUP_ID: Final[str] = os.getenv("KAFKA_GROUP_ID", "sentinel-processor")
KAFKA_GROUP_ID_LOGS: Final[str] = os.getenv("KAFKA_GROUP_ID_LOGS", "sentinel-processor-logs")

LOG_BATCH_SIZE: Final[int] = int(os.getenv("PROCESSOR_LOG_BATCH_SIZE", "100"))
LOG_BATCH_TIMEOUT: Final[float] = float(os.getenv("PROCESSOR_LOG_BATCH_TIMEOUT", "1.0"))

DATABASE_URL: Final[str] = os.getenv("DATABASE_URL", "postgresql+asyncpg://sentinel:sentinel_secret@timescaledb:5432/sentinel")
# Extract raw asyncpg DSN (strip the +asyncpg part for raw asyncpg usage)
ASYNCPG_DSN: Final[str] = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

REDIS_URL: Final[str] = os.getenv("REDIS_URL", "redis://redis:6379/0")

LOG_LEVEL: Final[str] = os.getenv("LOG_LEVEL", "INFO")

# Alert rule configuration
ALERT_COOLDOWN_SECONDS: Final[int] = 300  # 5 minutes
SERVER_STATE_TTL_SECONDS: Final[int] = 300  # 5 minutes
