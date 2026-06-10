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
    trace_id: str | None,
    request_id: str | None,
    incident_id: str | None,
    org_id: str | None,
    workspace_id: str | None,
    session_id: str | None,
    stream_health: dict[str, Any],
) -> dict[str, Any]:
    return {
        "type": "event",
        "event_id": str(record.event_id),
        "timestamp": record.timestamp.isoformat() if record.timestamp else None,
        "sequence": sequence,
        "trace_id": trace_id,
        "request_id": request_id,
        "incident_id": incident_id,
        "org_id": org_id,
        "workspace_id": workspace_id,
        "session_id": session_id,
        "user_id": str(record.user_id),
        "risk_score": record.risk_score,
        "action_taken": record.action_taken,
        "llm_provider": record.llm_provider,
        "tool_name": record.tool_name,
        "prompt_hash": record.prompt_hash,
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
