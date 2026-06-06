"""
Short-lived distributed policy cache used by the proxy policy engine.

The routes and policy engine were already wired to a `distributed_policy_cache`
helper, but the module itself was missing. This implementation keeps the
existing architecture intact:
  - in-process fallback cache for tests and degraded mode
  - optional Redis-backed cache for multi-instance consistency
  - short TTL so policy edits propagate quickly
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from proxy.app.config import get_settings


RefreshFn = Callable[[], Awaitable[list[dict[str, Any]]]]


@dataclass
class DistributedPolicyCache:
    ttl_seconds: int = field(default_factory=lambda: get_settings().governance_policy_cache_ttl)
    _memory: dict[str, tuple[float, list[dict[str, Any]]]] = field(default_factory=dict)

    async def get(self, key: str, redis: Any, refresh_fn: RefreshFn) -> list[dict[str, Any]]:
        now = time.monotonic()
        cached = self._memory.get(key)
        if cached and cached[0] > now:
            return cached[1]

        if redis is not None:
            try:
                raw = await redis.get(key)
                if raw:
                    data = json.loads(raw)
                    if isinstance(data, list):
                        self._memory[key] = (now + self.ttl_seconds, data)
                        return data
            except Exception:
                # Degrade cleanly to refresh_fn and in-process cache.
                pass

        data = await refresh_fn()
        await self.set(key, data, redis)
        return data

    async def set(self, key: str, value: list[dict[str, Any]], redis: Any) -> None:
        expires_at = time.monotonic() + self.ttl_seconds
        self._memory[key] = (expires_at, value)

        if redis is not None:
            try:
                await redis.set(key, json.dumps(value), ex=self.ttl_seconds)
            except Exception:
                pass

    async def invalidate(self, key: str, redis: Any) -> None:
        self._memory.pop(key, None)
        if redis is not None:
            try:
                await redis.delete(key)
            except Exception:
                pass


distributed_policy_cache = DistributedPolicyCache()
