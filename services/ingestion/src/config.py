"""
Sentinel Ingestion Service — Configuration
"""

import os
from typing import Final

KAFKA_BOOTSTRAP_SERVERS: Final[str] = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "redpanda:9092")
KAFKA_TOPIC_METRICS: Final[str] = os.getenv("KAFKA_TOPIC_METRICS", "metrics")
LOG_LEVEL: Final[str] = os.getenv("LOG_LEVEL", "INFO")
