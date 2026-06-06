from __future__ import annotations

from proxy.app.events.schema import EventStream, build_event_envelope


def test_event_envelope_smoke_generation_under_loop() -> None:
    events = [
        build_event_envelope(
            stream=EventStream.AUDIT_EVENTS,
            event_type="AuditEventCreated",
            org_id="org-1",
            workspace_id="ws-1",
            trace_id=f"trace-{idx}",
            payload={"idx": idx},
        )
        for idx in range(1000)
    ]

    assert len(events) == 1000
    assert len({event.event_id for event in events}) == 1000
