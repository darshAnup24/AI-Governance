from __future__ import annotations

import asyncio
import json
import os
import random
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text as sql_text

from proxy.app.config import get_settings
from proxy.app.events.schema import EventStream
from proxy.app.events.streams import get_dlq_stream, get_primary_stream, get_retry_stream
from proxy.app.metrics import (
    EVENT_STREAM_BATCH_DURATION,
    EVENT_STREAM_BATCH_SIZE,
    EVENT_STREAM_CONSUMER_HEALTH,
    EVENT_STREAM_CONSUMER_LAG,
    EVENT_STREAM_DEAD_LETTERED,
    EVENT_STREAM_EVENTS_PROCESSED,
    EVENT_STREAM_QUEUE_DEPTH,
    EVENT_STREAM_RETRIES,
)

log = structlog.get_logger()
settings = get_settings()


class GenericStreamWorker:
    def __init__(
        self,
        *,
        stream: EventStream,
        consumer_group: str,
        consumer_prefix: str,
        batch_handler: Callable[[list[dict[str, Any]]], Awaitable[bool]],
    ) -> None:
        self.stream = stream
        self.consumer_group = consumer_group
        self.consumer_name = f"{consumer_prefix}-{uuid.uuid4().hex[:8]}"
        self.batch_handler = batch_handler
        self.running = True
        self._db_factory: async_sessionmaker[AsyncSession] | None = None

    async def run(self) -> None:
        import redis.asyncio as aioredis

        redis = aioredis.from_url(os.environ.get("REDIS_URL", settings.redis_url), decode_responses=True)
        primary = get_primary_stream(self.stream)
        retry = get_retry_stream(self.stream)
        dlq = get_dlq_stream(self.stream)

        for stream_name in (primary, retry):
            try:
                await redis.xgroup_create(stream_name, self.consumer_group, id="0", mkstream=True)
            except Exception:
                pass

        try:
            EVENT_STREAM_CONSUMER_HEALTH.labels(
                stream=self.stream.value,
                consumer=self.consumer_name,
            ).set(1)
            while self.running:
                messages = await redis.xreadgroup(
                    self.consumer_group,
                    self.consumer_name,
                    {primary: ">", retry: ">"},
                    count=settings.audit_batch_size,
                    block=settings.audit_poll_timeout_ms,
                )
                if not messages:
                    await self._refresh_stream_metrics(redis, primary=primary, retry=retry, dlq=dlq)
                    continue

                for stream_name, stream_messages in messages:
                    message_ids: list[str] = []
                    payloads: list[dict[str, Any]] = []
                    for msg_id, data in stream_messages:
                        message_ids.append(msg_id)
                        payloads.append(self._normalize(data))

                    started_at = time.perf_counter()
                    success = await self.batch_handler(payloads)
                    EVENT_STREAM_BATCH_DURATION.labels(stream=self.stream.value).observe(
                        time.perf_counter() - started_at
                    )
                    EVENT_STREAM_BATCH_SIZE.labels(stream=self.stream.value).observe(len(payloads))
                    if success:
                        await redis.xack(stream_name, self.consumer_group, *message_ids)
                        EVENT_STREAM_EVENTS_PROCESSED.labels(
                            stream=self.stream.value,
                            result="success",
                        ).inc(len(message_ids))
                        continue

                    for msg_id, payload in zip(message_ids, payloads):
                        retry_count = int(payload.get("retry_count", 0)) + 1
                        if retry_count < settings.audit_retry_max_attempts:
                            retry_payload = dict(payload)
                            retry_payload["retry_count"] = str(retry_count)
                            retry_payload["_retry_scheduled_at"] = datetime.now(timezone.utc).isoformat()
                            await redis.xadd(retry, retry_payload, maxlen=settings.audit_stream_maxlen, approximate=True)
                            await redis.xack(stream_name, self.consumer_group, msg_id)
                            EVENT_STREAM_RETRIES.labels(stream=self.stream.value).inc()
                            EVENT_STREAM_EVENTS_PROCESSED.labels(
                                stream=self.stream.value,
                                result="retry",
                            ).inc()
                        else:
                            dead_payload = dict(payload)
                            dead_payload["_failed_at"] = datetime.now(timezone.utc).isoformat()
                            dead_payload["_dead_letter_reason"] = "max_retries_exceeded"
                            await redis.xadd(dlq, dead_payload, maxlen=settings.audit_dead_letter_maxlen, approximate=True)
                            await redis.xack(stream_name, self.consumer_group, msg_id)
                            EVENT_STREAM_DEAD_LETTERED.labels(stream=self.stream.value).inc()
                            EVENT_STREAM_EVENTS_PROCESSED.labels(
                                stream=self.stream.value,
                                result="dead_letter",
                            ).inc()
                    await self._refresh_stream_metrics(redis, primary=primary, retry=retry, dlq=dlq)
                    await asyncio.sleep(BASE_BACKOFF + random.uniform(0, 0.1))
        finally:
            EVENT_STREAM_CONSUMER_HEALTH.labels(
                stream=self.stream.value,
                consumer=self.consumer_name,
            ).set(0)
            await redis.aclose()

    @staticmethod
    def _normalize(data: dict[str, Any]) -> dict[str, Any]:
        payload = data.get("payload")
        if payload:
            try:
                inner = json.loads(payload)
                if isinstance(inner, dict):
                    inner.setdefault("event_id", data.get("event_id", ""))
                    inner.setdefault("event_type", data.get("event_type", ""))
                    inner.setdefault("trace_id", data.get("trace_id", ""))
                    inner.setdefault("org_id", data.get("org_id", ""))
                    inner.setdefault("workspace_id", data.get("workspace_id", ""))
                    inner.setdefault("retry_count", data.get("retry_count", "0"))
                    return inner
            except json.JSONDecodeError:
                pass
        return data

    async def _refresh_stream_metrics(self, redis: Any, *, primary: str, retry: str, dlq: str) -> None:
        try:
            EVENT_STREAM_QUEUE_DEPTH.labels(stream=self.stream.value, queue_type="primary").set(await redis.xlen(primary))
            EVENT_STREAM_QUEUE_DEPTH.labels(stream=self.stream.value, queue_type="retry").set(await redis.xlen(retry))
            EVENT_STREAM_QUEUE_DEPTH.labels(stream=self.stream.value, queue_type="dlq").set(await redis.xlen(dlq))
            try:
                pending = await redis.xpending(primary, self.consumer_group)
                EVENT_STREAM_CONSUMER_LAG.labels(stream=self.stream.value).set(int(pending.get("pending", 0)))
            except Exception:
                EVENT_STREAM_CONSUMER_LAG.labels(stream=self.stream.value).set(0)
        except Exception:
            return

    async def ensure_db(self) -> async_sessionmaker[AsyncSession]:
        if self._db_factory is None:
            engine = create_async_engine(os.environ.get("DATABASE_URL", settings.database_url), pool_size=5, max_overflow=10)
            self._db_factory = async_sessionmaker(engine, expire_on_commit=False)
            async with self._db_factory() as session:
                await session.execute(
                    sql_text(
                        """
                        CREATE TABLE IF NOT EXISTS platform_events (
                            event_id TEXT PRIMARY KEY,
                            stream TEXT NOT NULL,
                            event_type TEXT NOT NULL,
                            org_id TEXT,
                            workspace_id TEXT,
                            trace_id TEXT,
                            payload JSONB NOT NULL,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
                await session.commit()
        return self._db_factory


class PlatformEventStore:
    def __init__(self, *, stream: EventStream) -> None:
        self.stream = stream
        self._db_factory: async_sessionmaker[AsyncSession] | None = None

    async def ensure_db(self) -> async_sessionmaker[AsyncSession]:
        if self._db_factory is None:
            engine = create_async_engine(
                os.environ.get("DATABASE_URL", settings.database_url),
                pool_size=5,
                max_overflow=10,
            )
            self._db_factory = async_sessionmaker(engine, expire_on_commit=False)
            async with self._db_factory() as session:
                await session.execute(
                    sql_text(
                        """
                        CREATE TABLE IF NOT EXISTS platform_events (
                            event_id TEXT PRIMARY KEY,
                            stream TEXT NOT NULL,
                            event_type TEXT NOT NULL,
                            org_id TEXT,
                            workspace_id TEXT,
                            trace_id TEXT,
                            payload JSONB NOT NULL,
                            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                        )
                        """
                    )
                )
                await session.commit()
        return self._db_factory

    async def persist(self, events: list[dict[str, Any]]) -> bool:
        if not events:
            return True
        db_factory = await self.ensure_db()
        async with db_factory() as session:
            await session.execute(
                sql_text(
                    """
                    INSERT INTO platform_events (
                        event_id, stream, event_type, org_id, workspace_id, trace_id, payload
                    ) VALUES (
                        :event_id, :stream, :event_type, :org_id, :workspace_id, :trace_id, CAST(:payload AS JSONB)
                    )
                    ON CONFLICT (event_id) DO NOTHING
                    """
                ),
                [
                    {
                        "event_id": str(event.get("event_id", "")),
                        "stream": self.stream.value,
                        "event_type": str(event.get("event_type", "")),
                        "org_id": str(event.get("org_id", "")),
                        "workspace_id": str(event.get("workspace_id", "")),
                        "trace_id": str(event.get("trace_id", "")),
                        "payload": json.dumps(event),
                    }
                    for event in events
                ],
            )
            await session.commit()
        return True


BASE_BACKOFF = 0.5
