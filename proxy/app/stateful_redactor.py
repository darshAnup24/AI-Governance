"""
Sprint 3 — Stateful Seamless Redaction Engine
===============================================
Unlike the basic [REDACTED:PII] replacement in routes.py, this module:

1. Assigns stable placeholder IDs per entity within a session:
     "John Doe"  →  [PERSON_1]
     "Jane Smith" →  [PERSON_2]
     "sk-abc123" →  [API_KEY_1]

2. Stores the mapping in Redis with a session-scoped TTL (1 hour).

3. Provides reverse_redact() to swap placeholders back into the LLM's
   response before it reaches the user — so the user sees real names
   in the reply while the LLM never saw them.

This is fundamentally superior to VerifyWise's "block or approve" workflow:
  - Zero developer friction (work continues normally)
  - LLM gets clean, de-identified prompts
  - User receives the response with real values restored

Usage:
  from proxy.app.stateful_redactor import StatefulRedactor
  redactor = StatefulRedactor(redis_client)
  redacted_prompt, session_id = await redactor.redact(prompt, spans, session_id=...)
  ... forward redacted_prompt to LLM ...
  clean_response = await redactor.reverse_redact(llm_response, session_id)
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

import structlog

log = structlog.get_logger()

SESSION_TTL = 3600  # 1 hour
NS = "shield:redact:"


class StatefulRedactor:
    """
    Session-scoped entity ID mapper that replaces sensitive spans with
    stable placeholder tokens and can reverse them on the response path.
    """

    def __init__(self, redis: Any) -> None:
        self.redis = redis

    # ── Private helpers ────────────────────────────────────────────────────

    def _session_key(self, session_id: str) -> str:
        return f"{NS}{session_id}"

    async def _load_map(self, session_id: str) -> dict[str, str]:
        """Load entity→placeholder map from Redis."""
        if self.redis is None:
            return {}
        try:
            raw = await self.redis.get(self._session_key(session_id))
            return json.loads(raw) if raw else {}
        except Exception as exc:
            log.warning("stateful_redactor.load_failed", error=str(exc))
            return {}

    async def _save_map(self, session_id: str, mapping: dict[str, str]) -> None:
        """Persist entity→placeholder map with rolling TTL."""
        if self.redis is None:
            return
        try:
            await self.redis.setex(
                self._session_key(session_id), SESSION_TTL, json.dumps(mapping)
            )
        except Exception as exc:
            log.warning("stateful_redactor.save_failed", error=str(exc))

    # ── Category counters inside the mapping ─────────────────────────────

    @staticmethod
    def _next_placeholder(mapping: dict[str, str], category: str) -> str:
        """
        Pick the next available placeholder for a category.
        e.g. PERSON_1, PERSON_2, API_KEY_1, …
        """
        prefix = category.upper().replace(" ", "_")
        existing = [v for v in mapping.values() if v.startswith(f"[{prefix}_")]
        return f"[{prefix}_{len(existing) + 1}]"

    # ── Public API ─────────────────────────────────────────────────────────

    async def redact(
        self,
        prompt: str,
        spans: list[dict[str, Any]],
        session_id: str | None = None,
    ) -> tuple[str, str]:
        """
        Replace detected spans with stable placeholder tokens.

        Returns:
            (redacted_prompt, session_id)
        """
        if not spans:
            sid = session_id or str(uuid.uuid4())
            return prompt, sid

        sid = session_id or str(uuid.uuid4())
        mapping = await self._load_map(sid)

        # Process spans from end→start to preserve offsets
        sorted_spans = sorted(spans, key=lambda s: s.get("start", 0), reverse=True)
        result = prompt

        for span in sorted_spans:
            start = span.get("start", 0)
            end = span.get("end", 0)
            if start >= end:
                continue
            matched = span.get("matched_text") or prompt[start:end]
            category = span.get("category", "UNKNOWN")

            # Reuse existing placeholder for the same literal value
            if matched in mapping:
                placeholder = mapping[matched]
            else:
                placeholder = self._next_placeholder(mapping, category)
                mapping[matched] = placeholder

            result = result[:start] + placeholder + result[end:]

        await self._save_map(sid, mapping)
        log.info("stateful_redactor.redacted", session=sid, entities=len(mapping))
        return result, sid

    async def reverse_redact(self, text: str, session_id: str) -> str:
        """
        Replace placeholder tokens in the LLM response back to the
        original values before returning to the user.
        """
        mapping = await self._load_map(session_id)
        if not mapping:
            return text

        result = text
        # Sort by placeholder length descending to avoid partial replacements
        for original, placeholder in sorted(mapping.items(), key=lambda x: len(x[1]), reverse=True):
            escaped = re.escape(placeholder)
            result = re.sub(escaped, original, result)

        return result

    async def get_session_map(self, session_id: str) -> dict[str, str]:
        """Return the current entity→placeholder map for a session (for audit)."""
        return await self._load_map(session_id)
