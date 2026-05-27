"""
Sentinel Stream Processor — Log Consumer

Consumes log records from Redpanda, batches them, writes to the `logs`
hypertable, republishes each line to Redis `logs.live.<server_id>` for
the SSE log tail, and feeds each line into the rule engine so log-based
and composite rules can fire (Phase 2).
"""

import asyncio
import json
from typing import Any, Callable, Optional

from aiokafka import AIOKafkaConsumer
import redis.asyncio as aioredis
import structlog

from .config import (
    KAFKA_BOOTSTRAP_SERVERS,
    KAFKA_GROUP_ID_LOGS,
    KAFKA_TOPIC_LOGS,
    LOG_BATCH_SIZE,
    LOG_BATCH_TIMEOUT,
    REDIS_URL,
)
from .storage import is_storage_ready, write_log_batch


# Callback set by main.py so we don't create an import cycle.
# Signature: (server_id: str, level: str, message: str) -> None
_engine_ingest_hook: Optional[Callable[[str, str, str], None]] = None


def set_engine_ingest_hook(hook: Callable[[str, str, str], None]) -> None:
    """main.py registers the RuleEngine.ingest_log bound method here at startup."""
    global _engine_ingest_hook
    _engine_ingest_hook = hook

log: structlog.stdlib.BoundLogger = structlog.get_logger()


async def _create_log_consumer(max_retries: int = 10, retry_delay: float = 3.0) -> AIOKafkaConsumer:
    for attempt in range(1, max_retries + 1):
        try:
            consumer = AIOKafkaConsumer(
                KAFKA_TOPIC_LOGS,
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                group_id=KAFKA_GROUP_ID_LOGS,
                auto_offset_reset="latest",
                enable_auto_commit=True,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            )
            await consumer.start()
            log.info("log_consumer.started", topic=KAFKA_TOPIC_LOGS, group=KAFKA_GROUP_ID_LOGS)
            return consumer
        except Exception as exc:
            log.warning("log_consumer.retry", attempt=attempt, error=str(exc))
            if attempt < max_retries:
                await asyncio.sleep(retry_delay)
            else:
                raise


async def _publish_live(redis_client: aioredis.Redis, record: dict[str, Any]) -> None:
    """Publish one log record to its per-server live channel."""
    server_id = record.get("server_id")
    if not server_id:
        return
    channel = f"logs.live.{server_id}"
    try:
        await redis_client.publish(channel, json.dumps(record, default=str))
    except Exception as exc:
        log.warning("log_consumer.publish_live.failed", error=str(exc), channel=channel)


async def process_logs() -> None:
    """Main log processing loop. Batches inserts, fans out to Redis pubsub."""
    # process_metrics() initializes the shared storage pool; we wait for it
    # rather than racing and dropping the first few batches.
    while not is_storage_ready():
        await asyncio.sleep(0.5)

    consumer = await _create_log_consumer()
    redis_client: Optional[aioredis.Redis] = aioredis.from_url(REDIS_URL, decode_responses=True)
    await redis_client.ping()

    buffer: list[dict[str, Any]] = []
    last_flush = asyncio.get_event_loop().time()
    log.info("log_consumer.loop.started")

    try:
        while True:
            try:
                # Poll with a short timeout so we can also flush on idle
                msg_dict = await consumer.getmany(timeout_ms=200, max_records=LOG_BATCH_SIZE)
                now = asyncio.get_event_loop().time()

                if msg_dict:
                    for _tp, messages in msg_dict.items():
                        for m in messages:
                            try:
                                rec = m.value
                                buffer.append(rec)
                                await _publish_live(redis_client, rec)
                                # Feed into the in-process rule engine so
                                # log-based / composite rules see this event.
                                if _engine_ingest_hook is not None:
                                    try:
                                        _engine_ingest_hook(
                                            str(rec.get("server_id", "")),
                                            str(rec.get("level", "INFO")),
                                            str(rec.get("message", "")),
                                        )
                                    except Exception as exc:
                                        log.warning("log_consumer.engine_hook.error", error=str(exc))
                            except Exception as exc:
                                log.warning("log_consumer.message.error", error=str(exc))

                should_flush = (
                    len(buffer) >= LOG_BATCH_SIZE
                    or (buffer and (now - last_flush) >= LOG_BATCH_TIMEOUT)
                )

                if should_flush:
                    try:
                        written = await write_log_batch(buffer)
                        log.debug("log_consumer.flush", written=written, batched=len(buffer))
                    except Exception as exc:
                        log.error("log_consumer.write.failed", error=str(exc))
                    buffer.clear()
                    last_flush = now

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.error("log_consumer.iter.error", error=str(exc), exc_info=True)
                await asyncio.sleep(1.0)

    finally:
        # Final flush before shutdown
        if buffer:
            try:
                await write_log_batch(buffer)
            except Exception as exc:
                log.error("log_consumer.final_flush.failed", error=str(exc))
        await consumer.stop()
        if redis_client is not None:
            await redis_client.aclose()
        log.info("log_consumer.loop.stopped")
