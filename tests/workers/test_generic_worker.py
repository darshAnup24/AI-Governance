from __future__ import annotations

from proxy.app.events.worker import GenericStreamWorker
from proxy.app.events.schema import EventStream


async def _noop(_: list[dict]) -> bool:
    return True


def test_generic_worker_normalizes_envelope_payload() -> None:
    worker = GenericStreamWorker(
        stream=EventStream.TELEMETRY_EVENTS,
        consumer_group="telemetry-workers",
        consumer_prefix="telemetry",
        batch_handler=_noop,
    )

    payload = worker._normalize(
        {
            "event_id": "evt-1",
            "event_type": "TelemetryEventCreated",
            "org_id": "org-1",
            "workspace_id": "ws-1",
            "trace_id": "trace-1",
            "retry_count": "0",
            "payload": '{"metric":"latency","value":12}',
        }
    )

    assert payload["event_id"] == "evt-1"
    assert payload["metric"] == "latency"
    assert payload["workspace_id"] == "ws-1"
