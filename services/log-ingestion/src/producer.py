"""
Sentinel Log Ingestion Service — Kafka Producer
"""

import asyncio
import json
from typing import Optional

from aiokafka import AIOKafkaProducer

import structlog

from .config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC_LOGS

log: structlog.stdlib.BoundLogger = structlog.get_logger()

_producer: Optional[AIOKafkaProducer] = None


def is_producer_ready() -> bool:
    return _producer is not None


async def start_producer(max_retries: int = 30, retry_delay: float = 3.0) -> None:
    """Start the Kafka producer with retry-on-startup."""
    global _producer

    for attempt in range(1, max_retries + 1):
        try:
            producer = AIOKafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                linger_ms=50,
                acks="all",
            )
            await producer.start()
            _producer = producer
            log.info("kafka.log_producer.started", topic=KAFKA_TOPIC_LOGS)
            return
        except Exception as exc:
            log.warning(
                "kafka.log_producer.retry",
                attempt=attempt,
                max_retries=max_retries,
                error=str(exc),
            )
            if attempt < max_retries:
                await asyncio.sleep(retry_delay)
            else:
                log.error("kafka.log_producer.failed", error=str(exc))
                raise


async def stop_producer() -> None:
    global _producer
    if _producer is not None:
        await _producer.stop()
        _producer = None
        log.info("kafka.log_producer.stopped")


async def publish_log_records(records: list[dict[str, object]]) -> None:
    """Publish a batch of log records; each one keyed by server_id for partitioning."""
    if _producer is None:
        raise RuntimeError("Kafka producer is not initialized")

    for rec in records:
        server_id = str(rec.get("server_id", ""))
        await _producer.send(topic=KAFKA_TOPIC_LOGS, key=server_id, value=rec)
    await _producer.flush()
    log.debug("kafka.log.batch_published", count=len(records))
