from __future__ import annotations

import asyncio
import logging
import os
import sys
import statistics
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("LOG_LEVEL", "WARNING")
logging.disable(logging.CRITICAL)

from proxy.app.config import get_settings
from proxy.app.events.publisher import EventBus
from proxy.app.events.schema import EventStream, build_event_envelope

settings = get_settings()


class FakeRedis:
    def __init__(self) -> None:
        self.count = 0

    async def xadd(self, stream: str, fields: dict[str, str], **_: Any) -> str:
        del stream, fields
        self.count += 1
        return f"{self.count}-0"


async def _benchmark_publish(redis: Any, iterations: int) -> dict[str, float]:
    bus = EventBus()
    samples_ms: list[float] = []
    started_at = time.perf_counter()

    for index in range(iterations):
        event = build_event_envelope(
            stream=EventStream.AUDIT_EVENTS,
            event_type="AuditEventCreated",
            org_id="benchmark-org",
            workspace_id="benchmark-ws",
            trace_id=f"trace-{index}",
            payload={"sequence": index},
        )
        publish_started = time.perf_counter()
        await bus.publish(redis=redis, event=event)
        samples_ms.append((time.perf_counter() - publish_started) * 1000)

    elapsed = time.perf_counter() - started_at
    sorted_samples = sorted(samples_ms)
    return {
        "count": float(iterations),
        "throughput_eps": iterations / elapsed if elapsed else 0.0,
        "p50_ms": statistics.median(sorted_samples),
        "p95_ms": sorted_samples[min(iterations - 1, int(iterations * 0.95))],
        "p99_ms": sorted_samples[min(iterations - 1, int(iterations * 0.99))],
    }


async def main() -> None:
    iterations = int(os.environ.get("BENCH_ITERATIONS", "1000"))
    redis_url = os.environ.get("REDIS_URL", settings.redis_url)

    print(f"Benchmark iterations: {iterations}")
    print("Synthetic publisher benchmark:")
    fake_result = await _benchmark_publish(FakeRedis(), iterations)
    print(fake_result)

    try:
        import redis.asyncio as aioredis

        redis = aioredis.from_url(redis_url, decode_responses=True)
        await redis.ping()
    except Exception as exc:
        print(f"Real Redis benchmark skipped: {exc}")
        return

    try:
        print(f"Real Redis benchmark against {redis_url}:")
        real_result = await _benchmark_publish(redis, iterations)
        print(real_result)
    finally:
        await redis.aclose()


if __name__ == "__main__":
    asyncio.run(main())
