from __future__ import annotations

from proxy.app.events.orchestrator import (
    QueuePriority,
    build_queue_snapshots,
    priority_stream,
    worker_lease_key,
)


def test_priority_stream_suffixes() -> None:
    assert priority_stream("telemetry_events", QueuePriority.HIGH) == "telemetry_events:high"


def test_queue_snapshots_include_all_queues() -> None:
    snapshots = build_queue_snapshots(
        "policy_events",
        primary_depth=12,
        retry_depth=3,
        dlq_depth=1,
        lag=4,
    )

    assert [snapshot.queue_type for snapshot in snapshots] == ["primary", "retry", "dlq"]
    assert snapshots[0].lag == 4
    assert snapshots[2].depth == 1


def test_worker_lease_key_is_stable() -> None:
    assert (
        worker_lease_key("incident_events", "incident-workers", "incident-a")
        == "worker-lease:incident_events:incident-workers:incident-a"
    )
