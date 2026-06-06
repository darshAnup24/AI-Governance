"""
Replay tooling for dead-lettered audit events.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

import structlog

from proxy.app.config import get_settings
from proxy.app.events.replay import replay_stream

log = structlog.get_logger()
settings = get_settings()


async def replay_dead_letters(
    redis: Any,
    *,
    limit: int = 100,
    source_stream: str | None = None,
    destination_stream: str | None = None,
) -> int:
    source = source_stream or settings.audit_dead_letter_stream_key
    destination = destination_stream or settings.audit_retry_stream_key
    replayed = await replay_stream(
        redis,
        source_stream=source,
        destination_stream=destination,
        limit=limit,
    )
    log.info("audit_replay.completed", source=source, destination=destination, replayed=replayed)
    return replayed


async def main() -> None:
    import redis.asyncio as aioredis

    redis_url = os.environ.get("REDIS_URL", settings.redis_url)
    redis = aioredis.from_url(redis_url, decode_responses=True)
    try:
        replayed = await replay_dead_letters(redis)
        print(f"Replayed {replayed} dead-letter audit events")
    finally:
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
