from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum


class QueuePriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    DEFAULT = "default"
    LOW = "low"
    BACKGROUND = "background"


@dataclass(frozen=True)
class QueueSnapshot:
    stream: str
    queue_type: str
    depth: int
    lag: int
    measured_at: str


def priority_stream(stream: str, priority: QueuePriority) -> str:
    return f"{stream}:{priority.value}"


def build_queue_snapshots(
    stream: str,
    *,
    primary_depth: int,
    retry_depth: int,
    dlq_depth: int,
    lag: int,
) -> list[QueueSnapshot]:
    measured_at = datetime.now(timezone.utc).isoformat()
    return [
        QueueSnapshot(
            stream=stream,
            queue_type="primary",
            depth=primary_depth,
            lag=lag,
            measured_at=measured_at,
        ),
        QueueSnapshot(
            stream=stream,
            queue_type="retry",
            depth=retry_depth,
            lag=0,
            measured_at=measured_at,
        ),
        QueueSnapshot(
            stream=stream,
            queue_type="dlq",
            depth=dlq_depth,
            lag=0,
            measured_at=measured_at,
        ),
    ]


def worker_lease_key(stream: str, consumer_group: str, consumer_name: str) -> str:
    return f"worker-lease:{stream}:{consumer_group}:{consumer_name}"
