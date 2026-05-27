"""
Sentinel Log Ingestion Service — Configuration
"""

import os
from typing import Final

KAFKA_BOOTSTRAP_SERVERS: Final[str] = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "redpanda:9092")
KAFKA_TOPIC_LOGS: Final[str] = os.getenv("KAFKA_TOPIC_LOGS", "logs.raw")
LOG_LEVEL: Final[str] = os.getenv("LOG_LEVEL", "INFO")

MAX_BATCH_SIZE: Final[int] = int(os.getenv("LOG_INGEST_MAX_BATCH", "500"))
