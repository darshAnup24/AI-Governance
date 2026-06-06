from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class StreamCursor:
    last_event_id: str | None = None
    last_timestamp: datetime | None = None
    sequence: int = 0


def next_sequence(cursor: StreamCursor) -> int:
    return cursor.sequence + 1


def build_event_payload(
    *,
    record: Any,
    sequence: int,
    categories: list[str],
    stream_health: dict[str, Any],
) -> dict[str, Any]:
    return {
        "type": "event",
        "event_id": str(record.event_id),
        "timestamp": record.timestamp.isoformat() if record.timestamp else None,
        "sequence": sequence,
        "user_id": str(record.user_id),
        "risk_score": record.risk_score,
        "action_taken": record.action_taken,
        "llm_provider": record.llm_provider,
        "categories": categories,
        "stream_health": stream_health,
    }


def heartbeat_payload(*, sequence: int, stream_health: dict[str, Any]) -> str:
    return json.dumps(
        {
            "type": "heartbeat",
            "sequence": sequence,
            "ts": datetime.now(timezone.utc).isoformat(),
            "stream_health": stream_health,
        }
    )
