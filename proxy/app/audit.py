"""
Audit event emitter — non-blocking, fire-and-forget publishing to Redis Streams.
"""

from __future__ import annotations

import asyncio
import json
import os
import structlog
from typing import Any

from proxy.app.config import get_settings
from proxy.app.events import EventBus
from proxy.app.events.schema import EventStream, build_event_envelope
from proxy.app.models import AuditEvent
from proxy.app.metrics import AUDIT_EMIT_FAILURES, AUDIT_EVENTS_EMITTED, AUDIT_FALLBACK_WRITES

log = structlog.get_logger()


class AuditEmitter:
    """Publishes audit events to Redis Streams. Never raises exceptions to calling code."""

    STREAM_KEY = "audit:events"

    def __init__(self) -> None:
        settings = get_settings()
        self._stream_key = os.getenv("AUDIT_STREAM_KEY", settings.audit_stream_key)
        self._stream_maxlen = int(os.getenv("AUDIT_STREAM_MAXLEN", str(settings.audit_stream_maxlen)))
        self._event_bus = EventBus()
        # FIXED (BUG-005): Use a path inside the app directory, not world-readable /tmp
        self._fallback_file = os.getenv("AUDIT_FALLBACK_FILE", settings.audit_fallback_file)

    async def emit(self, redis: Any, event: AuditEvent) -> None:
        """
        Emit an audit event to Redis Streams.
        Non-blocking, fire-and-forget. Falls back to file on Redis failure.
        """
        try:
            if redis is None:
                await self._write_fallback_async(event)
                return

            envelope = build_event_envelope(
                stream=EventStream.AUDIT_EVENTS,
                event_type="AuditEventCreated",
                event_id=event.event_id,
                org_id=event.org_id,
                workspace_id=event.workspace_id,
                trace_id=event.trace_id,
                payload={
                    "timestamp": event.timestamp.isoformat(),
                    "org_id": event.org_id,
                    "workspace_id": event.workspace_id,
                    "user_id": event.user_id,
                    "session_id": event.session_id,
                    "trace_id": event.trace_id,
                    "tool_name": event.tool_name,
                    "llm_provider": event.llm_provider,
                    "prompt_hash": event.prompt_hash,
                    "detection_results": event.detection_results,
                    "risk_score": event.risk_score,
                    "action_taken": event.action_taken.value,
                    "policy_rule_id": event.policy_rule_id or "",
                    "redacted_prompt": event.redacted_prompt,
                    "request_duration_ms": event.request_duration_ms,
                    "upstream_status_code": event.upstream_status_code or 0,
                },
            )
            await self._event_bus.publish(redis=redis, event=envelope)
            AUDIT_EVENTS_EMITTED.inc()
            log.debug("audit.emitted", event_id=event.event_id)

        except Exception as e:
            AUDIT_EMIT_FAILURES.inc()
            log.warning("audit.emit_failed", error=str(e), event_id=event.event_id)
            await self._write_fallback_async(event)

    async def _write_fallback_async(self, event: AuditEvent) -> None:
        """Write event to local file as fallback when Redis is unavailable.
        FIXED (BUG-005): Uses asyncio.to_thread() to avoid blocking the event loop.
        """
        try:
            await asyncio.to_thread(self._write_fallback_sync, event.model_dump_json())
        except Exception as e:
            log.error("audit.fallback_write_failed", error=str(e))

    def _write_fallback_sync(self, json_line: str) -> None:
        """Synchronous file write — called via asyncio.to_thread()."""
        try:
            os.makedirs(os.path.dirname(self._fallback_file), exist_ok=True)
            with open(self._fallback_file, "a") as f:
                f.write(json_line + "\n")
            AUDIT_FALLBACK_WRITES.inc()
        except Exception as e:
            log.error("audit.fallback_sync_write_failed", error=str(e))


audit_emitter = AuditEmitter()
