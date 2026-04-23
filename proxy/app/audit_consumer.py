"""
Async audit log consumer — reads from Redis Streams and writes to TimescaleDB.
Runs as a standalone background worker process.
"""

from __future__ import annotations

import asyncio
import json
<<<<<<< HEAD
import os
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
import signal
import sys
import uuid
from datetime import datetime
from typing import Any

import structlog
from proxy.app.logging_config import setup_logging

log = structlog.get_logger()

STREAM_KEY = "audit:events"
CONSUMER_GROUP = "audit-writers"
CONSUMER_NAME = f"writer-{uuid.uuid4().hex[:8]}"
BATCH_SIZE = 100
POLL_TIMEOUT_MS = 500
MAX_RETRIES = 3
DEAD_LETTER_STREAM = "audit:dead-letter"


class AuditConsumer:
    """
    Redis Streams consumer that batch-writes audit events to TimescaleDB.
    Features:
    - Consumer group for horizontal scaling
    - Batch reads (up to 100 events per poll)
    - Retry with exponential backoff
    - Dead-letter queue for persistent failures
    """

    def __init__(self) -> None:
        self._running = True
        self._processed_count = 0
        self._error_count = 0
<<<<<<< HEAD
        self._engine: Any = None

    async def _get_engine(self) -> Any:
        """Lazily initialize async SQLAlchemy engine."""
        if self._engine is None:
            from sqlalchemy.ext.asyncio import create_async_engine

            db_url = os.environ.get(
                "DATABASE_URL",
                "postgresql+asyncpg://aigw:aigw_password@postgres:5432/ai_governance",
            )
            self._engine = create_async_engine(
                db_url,
                pool_size=5,
                max_overflow=2,
                pool_pre_ping=True,
            )
        return self._engine
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2

    async def start(self) -> None:
        """Main consumer loop."""
        setup_logging("INFO")
        log.info("audit_consumer.starting", consumer=CONSUMER_NAME, group=CONSUMER_GROUP)

        try:
            import redis.asyncio as aioredis
        except ImportError:
            log.error("audit_consumer.redis_not_installed")
            return

<<<<<<< HEAD
        redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
=======
        redis_url = "redis://redis:6379/0"
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
        redis = aioredis.from_url(redis_url, decode_responses=True)

        # Create consumer group if it doesn't exist
        try:
            await redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        except Exception:
            pass  # Group already exists

        log.info("audit_consumer.started")

        while self._running:
            try:
                # Read batch from stream
                messages = await redis.xreadgroup(
                    CONSUMER_GROUP,
                    CONSUMER_NAME,
                    {STREAM_KEY: ">"},
                    count=BATCH_SIZE,
                    block=POLL_TIMEOUT_MS,
                )

                if not messages:
                    continue

                for stream_name, stream_messages in messages:
                    events = []
                    message_ids = []

                    for msg_id, data in stream_messages:
                        message_ids.append(msg_id)
                        events.append(data)

                    # Write batch to database
                    success = await self._write_batch(events)

                    if success:
                        # Acknowledge messages
                        if message_ids:
                            await redis.xack(STREAM_KEY, CONSUMER_GROUP, *message_ids)
                            self._processed_count += len(message_ids)
                    else:
                        # Send to dead-letter queue after retries exhausted
                        for msg_id, data in zip(message_ids, events):
                            await self._dead_letter(redis, msg_id, data)

            except Exception as e:
                log.error("audit_consumer.poll_error", error=str(e))
                self._error_count += 1
                await asyncio.sleep(1)

<<<<<<< HEAD
        if self._engine:
            await self._engine.dispose()
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
        await redis.aclose()
        log.info(
            "audit_consumer.stopped",
            processed=self._processed_count,
            errors=self._error_count,
        )

    async def _write_batch(self, events: list[dict[str, Any]]) -> bool:
<<<<<<< HEAD
        """Write a batch of audit events to TimescaleDB. Returns True on success."""
        for attempt in range(MAX_RETRIES):
            try:
                from sqlalchemy.ext.asyncio import AsyncSession
                from sqlalchemy.orm import sessionmaker
                from proxy.app.db_models import AuditEventRecord

                engine = await self._get_engine()
                async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

                records = []
                for event in events:
                    try:
                        org_id_raw = event.get("org_id", "")
                        user_id_raw = event.get("user_id", "")

                        # Safely parse UUIDs — fallback to a nil UUID if invalid
                        try:
                            org_id = uuid.UUID(str(org_id_raw))
                        except (ValueError, AttributeError):
                            org_id = uuid.UUID("00000000-0000-0000-0000-000000000000")

                        try:
                            user_id = uuid.UUID(str(user_id_raw))
                        except (ValueError, AttributeError):
                            user_id = uuid.UUID("00000000-0000-0000-0000-000000000000")

                        # Parse detection_results JSON string if needed
                        detection_results = event.get("detection_results", "{}")
                        if isinstance(detection_results, str):
                            try:
                                detection_results = json.loads(detection_results)
                            except json.JSONDecodeError:
                                detection_results = {}

                        # Parse timestamp
                        ts_raw = event.get("timestamp")
                        if ts_raw:
                            try:
                                timestamp = datetime.fromisoformat(str(ts_raw))
                            except ValueError:
                                timestamp = datetime.utcnow()
                        else:
                            timestamp = datetime.utcnow()

                        record = AuditEventRecord(
                            org_id=org_id,
                            user_id=user_id,
                            session_id=str(event.get("session_id", "")),
                            tool_name=str(event.get("tool_name", "")),
                            llm_provider=str(event.get("llm_provider", "")),
                            prompt_hash=str(event.get("prompt_hash", "")),
                            encrypted_prompt_hash=str(event.get("encrypted_prompt_hash", "")) or None,
                            detection_results=detection_results,
                            encrypted_detected_spans=str(event.get("encrypted_detected_spans", "")) or None,
                            risk_score=int(event.get("risk_score", 0)),
                            action_taken=str(event.get("action_taken", "ALLOW")),
                            redacted_prompt=event.get("redacted_prompt"),
                            request_duration_ms=float(event.get("request_duration_ms", 0)),
                            upstream_status_code=event.get("upstream_status_code"),
                            timestamp=timestamp,
                        )
                        records.append(record)
                    except Exception as parse_err:
                        log.warning(
                            "audit_consumer.event_parse_error",
                            error=str(parse_err),
                            event=event,
                        )

                if records:
                    async with async_session() as session:
                        session.add_all(records)
                        await session.commit()

                log.debug(
                    "audit_consumer.batch_written",
                    count=len(records),
                    attempt=attempt + 1,
                )
=======
        """Write a batch of events to TimescaleDB. Returns True on success."""
        for attempt in range(MAX_RETRIES):
            try:
                # In production, use SQLAlchemy bulk insert or COPY protocol
                # For now, log the events (actual DB write would go here)
                for event in events:
                    log.debug(
                        "audit_consumer.event_written",
                        event_id=event.get("event_id", "unknown"),
                        action=event.get("action_taken", "ALLOW"),
                        risk_score=event.get("risk_score", 0),
                    )
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                return True

            except Exception as e:
                wait_time = (2 ** attempt) * 0.5
                log.warning(
                    "audit_consumer.write_retry",
                    attempt=attempt + 1,
                    max_retries=MAX_RETRIES,
                    error=str(e),
                    wait_seconds=wait_time,
                )
                await asyncio.sleep(wait_time)

        return False

    async def _dead_letter(self, redis: Any, msg_id: str, data: dict[str, Any]) -> None:
        """Send failed message to dead-letter queue."""
        try:
            data["_original_id"] = msg_id
            data["_failed_at"] = datetime.utcnow().isoformat()
            await redis.xadd(DEAD_LETTER_STREAM, data, maxlen=10_000)
            log.warning("audit_consumer.dead_lettered", msg_id=msg_id)
        except Exception as e:
            log.error("audit_consumer.dead_letter_failed", error=str(e), msg_id=msg_id)

    def stop(self) -> None:
        self._running = False


async def main() -> None:
    consumer = AuditConsumer()

    def signal_handler(sig: int, frame: Any) -> None:
        log.info("audit_consumer.shutdown_signal")
        consumer.stop()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    await consumer.start()


if __name__ == "__main__":
    asyncio.run(main())
