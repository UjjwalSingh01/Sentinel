"""
Sentinel Ingestion Service — Kafka Producer
"""

import asyncio
import json
from typing import Optional

from aiokafka import AIOKafkaProducer

import structlog

from .config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC_METRICS

log: structlog.stdlib.BoundLogger = structlog.get_logger()

_producer: Optional[AIOKafkaProducer] = None


def is_producer_ready() -> bool:
    """Check if the Kafka producer is connected and ready."""
    return _producer is not None


async def start_producer(max_retries: int = 30, retry_delay: float = 3.0) -> None:
    """Initialize and start the Kafka producer with retry logic."""
    global _producer

    for attempt in range(1, max_retries + 1):
        try:
            producer = AIOKafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
            )
            await producer.start()
            _producer = producer
            log.info("kafka.producer.started", bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
            return
        except Exception as exc:
            log.warning(
                "kafka.producer.retry",
                attempt=attempt,
                max_retries=max_retries,
                error=str(exc),
            )
            if attempt < max_retries:
                await asyncio.sleep(retry_delay)
            else:
                log.error("kafka.producer.failed", error=str(exc))
                raise


async def stop_producer() -> None:
    """Stop the Kafka producer."""
    global _producer
    if _producer is not None:
        await _producer.stop()
        _producer = None
        log.info("kafka.producer.stopped")


async def publish_metric(payload: dict[str, object]) -> None:
    """Publish a metric payload to the metrics topic."""
    if _producer is None:
        raise RuntimeError("Kafka producer is not initialized")

    server_id = str(payload.get("server_id", ""))
    await _producer.send_and_wait(
        topic=KAFKA_TOPIC_METRICS,
        key=server_id,
        value=payload,
    )
    log.debug("kafka.metric.published", server_id=server_id, topic=KAFKA_TOPIC_METRICS)
