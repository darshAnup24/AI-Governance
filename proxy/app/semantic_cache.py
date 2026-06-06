"""
Sprint 1 — Semantic Detection Cache
Caches detection results in Redis keyed by a normalized SHA-256 hash of the prompt.
For repeat or near-identical prompts this eliminates the entire detection pipeline call,
dropping latency from ~100 ms → <5 ms.

Key design:
  - Normalization: lowercase + collapse whitespace → same cache entry for minor variations
  - TTL: 60 s (configurable via SEMANTIC_CACHE_TTL env)
  - Namespace: "airlock:dcache:" to avoid collisions with other Redis keys
  - Fail-open: any Redis error is logged and silently ignored — detection still runs
"""

from __future__ import annotations

import hashlib
import json
import os
from typing import Any

import structlog

log = structlog.get_logger()

CACHE_TTL: int = 15  # seconds — short TTL so policy changes clear stale decisions quickly
CACHE_NS = "airlock:dcache:"

def _cache_key(prompt: str) -> str:
    # Hash the exact prompt. No skeleton normalization.
    h = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    return f"{CACHE_NS}{h}"

async def get_cached_detection(redis: Any, prompt: str) -> dict[str, Any] | None:
    """Return cached detection result or None on miss / Redis failure."""
    if redis is None:
        return None
    key = _cache_key(prompt)
    try:
        raw = await redis.get(key)
        if raw:
            result = json.loads(raw)
            log.info("semantic_cache.hit", key=key[:24])
            return result
    except Exception as exc:
        log.warning("semantic_cache.get_error", error=str(exc))
    return None

async def set_cached_detection(redis: Any, prompt: str, result: dict[str, Any]) -> None:
    """Store detection result in Redis with configured TTL. Strips sensitive content."""
    if redis is None:
        return
    key = _cache_key(prompt)
    
    # Strip prompt content (matched_text, segments, etc.) to prevent Redis data leaks
    safe_result = {
        "action": result.get("action", "ALLOW"),
        "risk_score": result.get("risk_score", 0),
        "detected_spans": []
    }
    
    for span in result.get("detected_spans", []):
        safe_span = {
            "start": span.get("start"),
            "end": span.get("end"),
            "category": span.get("category"),
            "confidence": span.get("confidence"),
            "detector": span.get("detector")
            # CRITICAL: DO NOT cache matched_text or context
        }
        safe_result["detected_spans"].append(safe_span)

    try:
        await redis.setex(key, CACHE_TTL, json.dumps(safe_result))
        log.debug("semantic_cache.stored", key=key[:24], ttl=CACHE_TTL)
    except Exception as exc:
        log.warning("semantic_cache.set_error", error=str(exc))
