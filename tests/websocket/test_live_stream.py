from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

from proxy.app.live_stream import build_event_payload, heartbeat_payload


def test_event_payload_contains_sequence_and_health() -> None:
    record = SimpleNamespace(
        event_id="evt-1",
        timestamp=datetime(2026, 1, 1, 0, 0, 0),
        user_id="user-1",
        risk_score=84,
        action_taken="BLOCK",
        llm_provider="openai",
    )

    payload = build_event_payload(
        record=record,
        sequence=3,
        categories=["PII"],
        stream_health={"active_streams": 2, "runtime_mode": "HYBRID"},
    )

    assert payload["sequence"] == 3
    assert payload["categories"] == ["PII"]
    assert payload["stream_health"]["runtime_mode"] == "HYBRID"


def test_heartbeat_payload_marks_event_type() -> None:
    payload = heartbeat_payload(sequence=5, stream_health={"active_streams": 1})

    assert '"type": "heartbeat"' in payload
    assert '"sequence": 5' in payload
