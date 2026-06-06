from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import structlog

from proxy.app.config import get_settings

log = structlog.get_logger()
settings = get_settings()


async def inspect_stream(redis: Any, stream: str, *, limit: int = 50) -> list[dict[str, Any]]:
    messages = await redis.xrange(stream, min="-", max="+", count=limit)
    return [
        {"message_id": msg_id, "fields": dict(payload)}
        for msg_id, payload in messages
    ]


async def replay_stream(
    redis: Any,
    *,
    source_stream: str,
    destination_stream: str,
    limit: int = 100,
) -> int:
    messages = await redis.xrange(source_stream, min="-", max="+", count=limit)
    replayed = 0
    for msg_id, payload in messages:
        event = dict(payload)
        event["retry_count"] = "0"
        event["_replayed_from"] = source_stream
        event["_replayed_to"] = destination_stream
        await redis.xadd(destination_stream, event, maxlen=settings.audit_stream_maxlen, approximate=True)
        await redis.xdel(source_stream, msg_id)
        replayed += 1
    log.info("event_stream.replayed", source=source_stream, destination=destination_stream, replayed=replayed)
    return replayed


async def main() -> None:
    import redis.asyncio as aioredis

    source_stream = os.environ.get("SOURCE_STREAM", settings.audit_dead_letter_stream_key)
    destination_stream = os.environ.get("DESTINATION_STREAM", settings.audit_retry_stream_key)
    mode = os.environ.get("EVENT_TOOL_MODE", "inspect")
    redis = aioredis.from_url(os.environ.get("REDIS_URL", settings.redis_url), decode_responses=True)
    try:
        if mode == "replay":
            replayed = await replay_stream(
                redis,
                source_stream=source_stream,
                destination_stream=destination_stream,
            )
            print(f"Replayed {replayed} events from {source_stream} to {destination_stream}")
        else:
            records = await inspect_stream(redis, source_stream)
            print(json.dumps(records, indent=2))
    finally:
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
