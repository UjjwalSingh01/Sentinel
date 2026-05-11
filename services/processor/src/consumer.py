"""
Sentinel Stream Processor — Kafka Consumer
"""

import asyncio
import json
from datetime import datetime, timezone

from aiokafka import AIOKafkaConsumer
import structlog

from .config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_GROUP_ID, KAFKA_TOPIC_METRICS

log: structlog.stdlib.BoundLogger = structlog.get_logger()


async def create_consumer(max_retries: int = 10, retry_delay: float = 3.0) -> AIOKafkaConsumer:
    """Create and start a Kafka consumer with retry logic."""
    for attempt in range(1, max_retries + 1):
        try:
            consumer = AIOKafkaConsumer(
                KAFKA_TOPIC_METRICS,
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                group_id=KAFKA_GROUP_ID,
                auto_offset_reset="latest",
                enable_auto_commit=True,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            )
            await consumer.start()
            log.info(
                "consumer.started",
                topic=KAFKA_TOPIC_METRICS,
                group=KAFKA_GROUP_ID,
            )
            return consumer
        except Exception as exc:
            log.warning(
                "consumer.retry",
                attempt=attempt,
                max_retries=max_retries,
                error=str(exc),
            )
            if attempt < max_retries:
                await asyncio.sleep(retry_delay)
            else:
                log.error("consumer.failed", error=str(exc))
                raise


def parse_timestamp(raw: str) -> datetime:
    """Parse an ISO timestamp string to a timezone-aware datetime."""
    dt = datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt
