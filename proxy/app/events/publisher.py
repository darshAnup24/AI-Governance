from __future__ import annotations

import json
from typing import Any

import structlog

from proxy.app.config import get_settings
from proxy.app.events.schema import EventEnvelope, EventStream
from proxy.app.events.streams import get_primary_stream
from proxy.app.metrics import EVENT_STREAM_EVENTS_EMITTED

log = structlog.get_logger()
settings = get_settings()


class RedisStreamPublisher:
    def __init__(self, *, maxlen: int | None = None) -> None:
        self._maxlen = maxlen or settings.audit_stream_maxlen

    async def publish(self, redis: Any, envelope: EventEnvelope) -> str:
        if redis is None:
            raise RuntimeError("Redis is unavailable for event publishing")

        fields = {
            "event_id": envelope.event_id,
            "event_type": envelope.event_type,
            "version": envelope.version,
            "timestamp": envelope.timestamp.isoformat(),
            "org_id": envelope.org_id,
            "workspace_id": envelope.workspace_id,
            "trace_id": envelope.trace_id,
            "idempotency_key": envelope.idempotency_key,
            "stream": envelope.stream.value,
            "payload": json.dumps(envelope.payload),
            "retry_count": "0",
        }
        return await redis.xadd(
            get_primary_stream(envelope.stream),
            fields,
            maxlen=self._maxlen,
            approximate=True,
        )


class EventBus:
    def __init__(self, publisher: RedisStreamPublisher | None = None) -> None:
        self._publisher = publisher or RedisStreamPublisher()

    async def publish(self, *, redis: Any, event: EventEnvelope) -> str:
        msg_id = await self._publisher.publish(redis, event)
        EVENT_STREAM_EVENTS_EMITTED.labels(stream=event.stream.value, event_type=event.event_type).inc()
        log.debug(
            "event_bus.published",
            stream=event.stream.value,
            event_type=event.event_type,
            event_id=event.event_id,
            trace_id=event.trace_id,
        )
        return msg_id
