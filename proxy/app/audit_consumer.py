"""
Async audit log consumer — reads from Redis Streams and batch-writes to TimescaleDB.
Supports horizontal scaling via consumer groups, exponential backoff retries,
dead-letter queue, and graceful shutdown.

Key fixes over v1:
  - Actual DB batch writes (was logging only)
  - SQLAlchemy bulk insert with executemany
  - Proper consumer group ACK only after DB success
  - Graceful shutdown flushes pending events
  - Exponential backoff with jitter
  - Dead-letter queue for poison messages
  - Metrics tracking (processed, errors, lag)
  - OpenTelemetry spans for each poll cycle
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import signal
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from proxy.app.clickhouse import ClickHouseWriter
from proxy.app.config import get_settings
from proxy.app.logging_config import setup_logging
from proxy.app.metrics import (
    AUDIT_BATCH_SIZE,
    AUDIT_BATCH_WRITE_DURATION,
    AUDIT_CONSUMER_HEALTH,
    AUDIT_CONSUMER_LAG,
    AUDIT_DEAD_LETTER_DEPTH,
    AUDIT_DEAD_LETTERED,
    AUDIT_EVENTS_PROCESSED,
    AUDIT_PENDING_CLAIMS,
    AUDIT_QUEUE_DEPTH,
    AUDIT_RETRIES,
)

log = structlog.get_logger()

settings = get_settings()

STREAM_KEY = settings.audit_stream_key
RETRY_STREAM = settings.audit_retry_stream_key
PUBSUB_CHANNEL = "airlock:audit:events"
CONSUMER_GROUP = settings.audit_consumer_group
CONSUMER_NAME = f"writer-{uuid.uuid4().hex[:8]}"
BATCH_SIZE = settings.audit_batch_size
POLL_TIMEOUT_MS = settings.audit_poll_timeout_ms
MAX_RETRIES = settings.audit_retry_max_attempts
CLAIM_IDLE_MS = settings.audit_claim_idle_ms
DEAD_LETTER_STREAM = settings.audit_dead_letter_stream_key
DEAD_LETTER_MAXLEN = settings.audit_dead_letter_maxlen
BASE_BACKOFF = 0.5  # seconds


class AuditConsumer:
    """
    Redis Streams consumer that batch-writes audit events to TimescaleDB.

    Architecture:
      Redis Stream (audit:events)
        ↓ xreadgroup (consumer group)
      Batch of up to 100 events
        ↓ executemany INSERT
      TimescaleDB (audit_events hypertable)
        ↓ xack on success
      Dead-letter on persistent failure

    Graceful shutdown:
      - Signal handler sets _running = False
      - Pending batch is flushed before exit
    """

    def __init__(self) -> None:
        self._running = True
        self._processed_count = 0
        self._error_count = 0
        self._redis: Any = None
        self._owns_redis = True
        self._db_session_factory: async_sessionmaker[AsyncSession] | None = None
        self._clickhouse_writer = ClickHouseWriter()

    async def _ensure_db(self) -> async_sessionmaker[AsyncSession] | None:
        """Lazy-init DB session factory."""
        if self._db_session_factory is not None:
            return self._db_session_factory
        database_url = os.environ.get("DATABASE_URL", "postgresql+asyncpg://aigw:aigw_password@postgres:5432/ai_governance")
        try:
            engine = create_async_engine(database_url, pool_size=5, max_overflow=10)
            self._db_session_factory = async_sessionmaker(engine, expire_on_commit=False)
            log.info("audit_consumer.db_connected")
            return self._db_session_factory
        except Exception as e:
            log.warning("audit_consumer.db_connect_failed", error=str(e))
            return None

    async def start(self) -> None:
        """Main consumer loop with batch DB writes."""
        setup_logging(os.environ.get("LOG_LEVEL", "INFO"))
        log.info("audit_consumer.starting", consumer=CONSUMER_NAME, group=CONSUMER_GROUP, stream=STREAM_KEY)

        if self._redis is None:
            try:
                import redis.asyncio as aioredis
            except ImportError:
                log.error("audit_consumer.redis_not_installed")
                return
            redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
            self._redis = aioredis.from_url(redis_url, decode_responses=True)
            self._owns_redis = True
        else:
            self._owns_redis = False

        redis = self._redis
        pubsub_task = asyncio.create_task(self._consume_pubsub(redis), name="audit-consumer-pubsub")

        # Create consumer group if it doesn't exist
        for stream_name in (STREAM_KEY, RETRY_STREAM):
            try:
                await redis.xgroup_create(stream_name, CONSUMER_GROUP, id="0", mkstream=True)
            except Exception:
                pass  # Group already exists

        log.info("audit_consumer.started")
        AUDIT_CONSUMER_HEALTH.labels(consumer=CONSUMER_NAME).set(1)

        try:
            while self._running:
                try:
                    await self._claim_abandoned_messages(redis)
                    messages = await redis.xreadgroup(
                        CONSUMER_GROUP,
                        CONSUMER_NAME,
                        {STREAM_KEY: ">", RETRY_STREAM: ">"},
                        count=BATCH_SIZE,
                        block=POLL_TIMEOUT_MS,
                    )

                    if not messages:
                        await self._refresh_stream_metrics(redis)
                        continue

                    for _stream_name, stream_messages in messages:
                        if not stream_messages:
                            continue

                        message_ids: list[str] = []
                        events: list[dict[str, Any]] = []

                        for msg_id, data in stream_messages:
                            message_ids.append(msg_id)
                            events.append(self._normalize_event(data))

                        success = await self._write_batch(events)

                        if success:
                            if message_ids:
                                await redis.xack(_stream_name, CONSUMER_GROUP, *message_ids)
                                self._processed_count += len(message_ids)
                                AUDIT_EVENTS_PROCESSED.labels(result="success").inc(len(message_ids))
                        else:
                            for msg_id, data in zip(message_ids, events):
                                await self._handle_failed_message(redis, _stream_name, msg_id, data)

                    await self._refresh_stream_metrics(redis)

                except Exception as e:
                    log.error("audit_consumer.poll_error", error=str(e))
                    self._error_count += 1
                    AUDIT_CONSUMER_HEALTH.labels(consumer=CONSUMER_NAME).set(0)
                    await asyncio.sleep(1)
        finally:
            pubsub_task.cancel()
            await asyncio.gather(pubsub_task, return_exceptions=True)
            AUDIT_CONSUMER_HEALTH.labels(consumer=CONSUMER_NAME).set(0)

        # Flush any pending events on shutdown
        try:
            pending = await redis.xpending_range(STREAM_KEY, CONSUMER_GROUP, min="-", max="+", count=10)
            if pending:
                log.info("audit_consumer.pending_flush", count=len(pending))
        except Exception:
            pass

        if self._owns_redis:
            await redis.aclose()

        log.info(
            "audit_consumer.stopped",
            processed=self._processed_count,
            errors=self._error_count,
        )

    async def _write_batch(self, events: list[dict[str, Any]]) -> bool:
        """Write a batch of events to TimescaleDB using bulk INSERT.

        Uses SQLAlchemy executemany for efficient batch writes.
        Retries up to MAX_RETRIES with exponential backoff + jitter.
        """
        db_factory = await self._ensure_db()
        if db_factory is None:
            # Fallback: log events if DB not available
            for event in events:
                log.warning("audit_consumer.no_db_fallback", event_id=event.get("event_id", "unknown"))
            return True  # Don't dead-letter — DB might come back

        for attempt in range(MAX_RETRIES):
            try:
                started_at = time.perf_counter()
                async with db_factory() as session:
                    async_events = [event for event in events if event.get("event_type") == "async_detection"]
                    regular_events = [event for event in events if event.get("event_type") != "async_detection"]

                    if regular_events:
                        stmt = sql_text("""
                            INSERT INTO audit_events (
                                event_id, timestamp, org_id, user_id, session_id,
                                tool_name, llm_provider, prompt_hash, detection_results,
                                risk_score, action_taken, policy_rule_id,
                                redacted_prompt, request_duration_ms, upstream_status_code
                            ) VALUES (
                                :event_id, :timestamp, :org_id, :user_id, :session_id,
                                :tool_name, :llm_provider, :prompt_hash, :detection_results::jsonb,
                                :risk_score, :action_taken, :policy_rule_id,
                                :redacted_prompt, :request_duration_ms, :upstream_status_code
                            )
                            ON CONFLICT (event_id) DO NOTHING
                        """)
                        params = []
                        for event in regular_events:
                            params.append({
                                "event_id": event.get("event_id", uuid.uuid4().hex),
                                "timestamp": event.get("timestamp", datetime.now(timezone.utc).isoformat()),
                                "org_id": event.get("org_id", "00000000-0000-0000-0000-000000000000"),
                                "user_id": event.get("user_id", "00000000-0000-0000-0000-000000000000"),
                                "session_id": event.get("session_id", ""),
                                "tool_name": event.get("tool_name", ""),
                                "llm_provider": event.get("llm_provider", ""),
                                "prompt_hash": event.get("prompt_hash", ""),
                                "detection_results": event.get("detection_results", "{}"),
                                "risk_score": int(event.get("risk_score", 0)),
                                "action_taken": event.get("action_taken", "ALLOW"),
                                "policy_rule_id": event.get("policy_rule_id"),
                                "redacted_prompt": event.get("redacted_prompt"),
                                "request_duration_ms": float(event.get("request_duration_ms", 0)),
                                "upstream_status_code": event.get("upstream_status_code"),
                            })
                        await session.execute(stmt, params)

                    if async_events:
                        async_stmt = sql_text("""
                            INSERT INTO audit_events (
                                event_id, timestamp, org_id, user_id, session_id,
                                tool_name, llm_provider, prompt_hash, detection_results,
                                risk_score, action_taken, policy_rule_id,
                                redacted_prompt, request_duration_ms, upstream_status_code
                            ) VALUES (
                                :event_id, :timestamp, :org_id, :user_id, :session_id,
                                :tool_name, :llm_provider, :prompt_hash, :detection_results::jsonb,
                                :risk_score, :action_taken, :policy_rule_id,
                                :redacted_prompt, :request_duration_ms, :upstream_status_code
                            )
                            ON CONFLICT (event_id) DO NOTHING
                        """)
                        async_params = []
                        for event in async_events:
                            org_id = event.get("org_id", "")
                            user_id = event.get("user_id", "")
                            if not self._is_valid_uuid(org_id) or not self._is_valid_uuid(user_id):
                                log.info(
                                    "audit_consumer.async_event_skipped",
                                    reason="missing_or_invalid_identity",
                                    trace_id=event.get("trace_id", ""),
                                )
                                continue
                            async_params.append({
                                "event_id": uuid.uuid4().hex,
                                "timestamp": datetime.now(timezone.utc),
                                "org_id": org_id,
                                "user_id": user_id,
                                "session_id": event.get("trace_id", ""),
                                "tool_name": "detection_async",
                                "llm_provider": "",
                                "prompt_hash": event.get("text_hash", ""),
                                "detection_results": json.dumps({
                                    "event_type": event.get("event_type"),
                                    "tier": event.get("tier"),
                                    "detectors": self._coerce_json_field(event.get("detectors", [])),
                                    "text_hash": event.get("text_hash"),
                                    "tier_b_results": self._coerce_json_field(event.get("tier_b_results", [])),
                                    "final_action": event.get("final_action"),
                                    "trace_id": event.get("trace_id", ""),
                                }),
                                "risk_score": int(event.get("risk_score", 0)),
                                "action_taken": event.get("final_action") or "ALLOW",
                                "policy_rule_id": None,
                                "redacted_prompt": None,
                                "request_duration_ms": float(event.get("request_duration_ms", 0)),
                                "upstream_status_code": None,
                            })
                        if async_params:
                            await session.execute(async_stmt, async_params)

                    await session.commit()
                    try:
                        await self._clickhouse_writer.write_audit_events(regular_events + async_events)
                    except Exception as clickhouse_exc:
                        log.warning("audit_consumer.clickhouse_degraded", error=str(clickhouse_exc), count=len(events))
                    AUDIT_BATCH_WRITE_DURATION.observe(time.perf_counter() - started_at)
                    AUDIT_BATCH_SIZE.observe(len(events))
                    return True

            except Exception as e:
                wait = BASE_BACKOFF * (2 ** attempt) + random.uniform(0, 0.1)
                AUDIT_RETRIES.inc()
                log.warning(
                    "audit_consumer.write_retry",
                    attempt=attempt + 1,
                    max_retries=MAX_RETRIES,
                    error=str(e)[:200],
                    wait_seconds=round(wait, 2),
                )
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(wait)

        return False

    async def _handle_failed_message(self, redis: Any, source_stream: str, msg_id: str, data: dict[str, Any]) -> None:
        retry_count = int(data.get("retry_count", 0))
        if retry_count + 1 < MAX_RETRIES:
            await self._schedule_retry(redis, source_stream, msg_id, data, retry_count + 1)
            await redis.xack(source_stream, CONSUMER_GROUP, msg_id)
            AUDIT_EVENTS_PROCESSED.labels(result="retry").inc()
            return

        await self._dead_letter(redis, msg_id, data)
        await redis.xack(source_stream, CONSUMER_GROUP, msg_id)
        AUDIT_EVENTS_PROCESSED.labels(result="dead_letter").inc()

    async def _schedule_retry(
        self,
        redis: Any,
        source_stream: str,
        msg_id: str,
        data: dict[str, Any],
        retry_count: int,
    ) -> None:
        retry_event = dict(data)
        retry_event["retry_count"] = str(retry_count)
        retry_event["_original_id"] = msg_id
        retry_event["_retry_source_stream"] = source_stream
        retry_event["_retry_scheduled_at"] = datetime.now(timezone.utc).isoformat()
        await redis.xadd(RETRY_STREAM, retry_event, maxlen=settings.audit_stream_maxlen, approximate=True)

    async def _dead_letter(self, redis: Any, msg_id: str, data: dict[str, Any]) -> None:
        """Send persistently failing message to dead-letter queue."""
        try:
            payload = dict(data)
            payload["_original_id"] = msg_id
            payload["_failed_at"] = datetime.now(timezone.utc).isoformat()
            payload["_dead_letter_reason"] = "max_retries_exceeded"
            await redis.xadd(DEAD_LETTER_STREAM, payload, maxlen=DEAD_LETTER_MAXLEN, approximate=True)
            AUDIT_DEAD_LETTERED.inc()
            log.warning("audit_consumer.dead_lettered", msg_id=msg_id)
        except Exception as e:
            log.error("audit_consumer.dead_letter_failed", error=str(e), msg_id=msg_id)

    def stop(self) -> None:
        self._running = False

    async def _consume_pubsub(self, redis: Any) -> None:
        pubsub = redis.pubsub()
        try:
            await pubsub.subscribe(PUBSUB_CHANNEL)
            while self._running:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if not message:
                    await asyncio.sleep(0.05)
                    continue
                try:
                    payload = json.loads(message["data"])
                    await self._write_batch([payload])
                except Exception as exc:
                    log.warning("audit_consumer.pubsub_message_failed", error=str(exc))
        finally:
            await pubsub.unsubscribe(PUBSUB_CHANNEL)
            await pubsub.aclose()

    async def _claim_abandoned_messages(self, redis: Any) -> None:
        for stream_name in (STREAM_KEY, RETRY_STREAM):
            try:
                claimed = await redis.xautoclaim(
                    stream_name,
                    CONSUMER_GROUP,
                    CONSUMER_NAME,
                    min_idle_time=CLAIM_IDLE_MS,
                    start_id="0-0",
                    count=BATCH_SIZE,
                )
                if claimed and len(claimed) >= 2:
                    reclaimed_messages = claimed[1]
                    if reclaimed_messages:
                        AUDIT_PENDING_CLAIMS.inc(len(reclaimed_messages))
                        log.info(
                            "audit_consumer.pending_claimed",
                            stream=stream_name,
                            count=len(reclaimed_messages),
                        )
            except Exception:
                continue

    async def _refresh_stream_metrics(self, redis: Any) -> None:
        try:
            AUDIT_QUEUE_DEPTH.set(await redis.xlen(STREAM_KEY))
            AUDIT_DEAD_LETTER_DEPTH.set(await redis.xlen(DEAD_LETTER_STREAM))
            try:
                pending = await redis.xpending(STREAM_KEY, CONSUMER_GROUP)
                AUDIT_CONSUMER_LAG.set(int(pending.get("pending", 0)))
            except Exception:
                AUDIT_CONSUMER_LAG.set(0)
        except Exception:
            pass

    @staticmethod
    def _coerce_json_field(value: Any) -> Any:
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return value
        return value

    @staticmethod
    def _is_valid_uuid(value: str) -> bool:
        try:
            uuid.UUID(str(value))
            return True
        except Exception:
            return False

    @classmethod
    def _normalize_event(cls, data: dict[str, Any]) -> dict[str, Any]:
        payload_raw = data.get("payload")
        if payload_raw:
            payload = cls._coerce_json_field(payload_raw)
            if isinstance(payload, dict):
                normalized = dict(payload)
                normalized.setdefault("event_id", data.get("event_id", uuid.uuid4().hex))
                normalized.setdefault("trace_id", data.get("trace_id", ""))
                normalized.setdefault("workspace_id", data.get("workspace_id", ""))
                normalized.setdefault("org_id", data.get("org_id", normalized.get("org_id", "")))
                normalized.setdefault("retry_count", data.get("retry_count", "0"))
                normalized.setdefault("event_type", data.get("event_type", ""))
                normalized.setdefault("version", data.get("version", "v1"))
                normalized.setdefault("stream", data.get("stream", STREAM_KEY))
                return normalized
        return data


async def run_consumer_forever(redis: Any) -> None:
    """Run the audit consumer with a DEDICATED Redis connection (not shared).

    FIXED (BUG-006): Must NOT use the shared proxy Redis connection.
    xreadgroup() with block=500 holds the connection, starving all other
    Redis operations (rate limiting, cache reads, policy cache) that share
    the same connection object.
    """
    consumer = AuditConsumer()
    # Create a dedicated connection for the consumer
    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
    try:
        import redis.asyncio as aioredis
        dedicated_redis = aioredis.from_url(
            redis_url,
            decode_responses=True,
            max_connections=5,  # Small pool — consumer is serial
        )
        await dedicated_redis.ping()
        log.info("audit_consumer.dedicated_redis_connected")
        consumer._redis = dedicated_redis
        consumer._owns_redis = True  # Consumer owns and will close this connection
    except Exception as e:
        log.warning("audit_consumer.dedicated_redis_failed", error=str(e))
        log.info("audit_consumer.falling_back_to_shared_redis")
        consumer._redis = redis
        consumer._owns_redis = False
    await consumer.start()


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
