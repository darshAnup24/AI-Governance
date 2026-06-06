from __future__ import annotations

import json

import pytest

from proxy.app.events.publisher import EventBus
from proxy.app.events.schema import EventStream, build_event_envelope


class FakeRedis:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str]]] = []

    async def xadd(self, stream: str, fields: dict[str, str], **_: object) -> str:
        self.calls.append((stream, fields))
        return "1-0"


@pytest.mark.asyncio
async def test_event_bus_publishes_versioned_envelope() -> None:
    redis = FakeRedis()
    bus = EventBus()
    event = build_event_envelope(
        stream=EventStream.AUDIT_EVENTS,
        event_type="AuditEventCreated",
        org_id="org-1",
        workspace_id="ws-1",
        trace_id="trace-1",
        payload={"hello": "world"},
        event_id="evt-1",
    )

    msg_id = await bus.publish(redis=redis, event=event)

    assert msg_id == "1-0"
    assert redis.calls[0][0] == "audit_events"
    assert redis.calls[0][1]["event_type"] == "AuditEventCreated"
    assert json.loads(redis.calls[0][1]["payload"]) == {"hello": "world"}
