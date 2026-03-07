"""
Audit event emitter — non-blocking, fire-and-forget publishing to Redis Streams.
"""

from __future__ import annotations

import json
import structlog
from typing import Any

from proxy.app.models import AuditEvent

log = structlog.get_logger()


class AuditEmitter:
    """Publishes audit events to Redis Streams. Never raises exceptions to calling code."""

    STREAM_KEY = "audit:events"

    def __init__(self) -> None:
        self._fallback_file = "/tmp/audit_fallback.jsonl"

    async def emit(self, redis: Any, event: AuditEvent) -> None:
        """
        Emit an audit event to Redis Streams.
        Non-blocking, fire-and-forget. Falls back to file on Redis failure.
        """
        try:
            if redis is None:
                self._write_fallback(event)
                return

            data = {
                "event_id": event.event_id,
                "timestamp": event.timestamp.isoformat(),
                "org_id": event.org_id,
                "user_id": event.user_id,
                "session_id": event.session_id,
                "tool_name": event.tool_name,
                "llm_provider": event.llm_provider,
                "prompt_hash": event.prompt_hash,
                "detection_results": json.dumps(event.detection_results),
                "risk_score": str(event.risk_score),
                "action_taken": event.action_taken.value,
                "policy_rule_id": event.policy_rule_id or "",
                "request_duration_ms": str(event.request_duration_ms),
                "upstream_status_code": str(event.upstream_status_code or 0),
            }

            await redis.xadd(self.STREAM_KEY, data, maxlen=100_000)
            log.debug("audit.emitted", event_id=event.event_id)

        except Exception as e:
            log.warning("audit.emit_failed", error=str(e), event_id=event.event_id)
            self._write_fallback(event)

    def _write_fallback(self, event: AuditEvent) -> None:
        """Write event to local file as fallback when Redis is unavailable."""
        try:
            with open(self._fallback_file, "a") as f:
                f.write(event.model_dump_json() + "\n")
        except Exception as e:
            log.error("audit.fallback_write_failed", error=str(e))


audit_emitter = AuditEmitter()
