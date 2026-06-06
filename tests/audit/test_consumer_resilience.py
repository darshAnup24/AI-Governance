from __future__ import annotations

import pytest

from proxy.app.audit_consumer import AuditConsumer


@pytest.mark.asyncio
async def test_normalize_event_preserves_backwards_compatible_flat_payload() -> None:
    event = AuditConsumer._normalize_event(
        {
            "event_id": "evt-flat-1",
            "org_id": "org-1",
            "trace_id": "trace-1",
            "retry_count": "1",
            "tool_name": "chatgpt",
        }
    )

    assert event["event_id"] == "evt-flat-1"
    assert event["tool_name"] == "chatgpt"
    assert event["retry_count"] == "1"


@pytest.mark.asyncio
async def test_normalize_event_handles_versioned_envelope_payload() -> None:
    event = AuditConsumer._normalize_event(
        {
            "event_id": "evt-env-1",
            "event_type": "AuditEventCreated",
            "version": "v1",
            "org_id": "org-1",
            "workspace_id": "ws-1",
            "trace_id": "trace-1",
            "retry_count": "0",
            "payload": '{"tool_name":"chatgpt","risk_score":42}',
        }
    )

    assert event["event_id"] == "evt-env-1"
    assert event["tool_name"] == "chatgpt"
    assert event["workspace_id"] == "ws-1"
    assert event["version"] == "v1"


@pytest.mark.asyncio
async def test_write_batch_degrades_cleanly_when_database_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    consumer = AuditConsumer()

    async def no_db() -> None:
        return None

    monkeypatch.setattr(consumer, "_ensure_db", no_db)

    success = await consumer._write_batch([{"event_id": "evt-db-down-1"}])

    assert success is True
