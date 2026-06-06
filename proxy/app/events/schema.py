from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EventStream(str, Enum):
    AUDIT_EVENTS = "audit_events"
    INCIDENT_EVENTS = "incident_events"
    TELEMETRY_EVENTS = "telemetry_events"
    POLICY_EVENTS = "policy_events"
    DETECTION_EVENTS = "detection_events"


class EventEnvelope(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    version: str = "v1"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    org_id: str = ""
    workspace_id: str = ""
    trace_id: str = ""
    idempotency_key: str = ""
    stream: EventStream
    payload: dict[str, Any] = Field(default_factory=dict)


def build_event_envelope(
    *,
    stream: EventStream,
    event_type: str,
    org_id: str = "",
    workspace_id: str = "",
    trace_id: str = "",
    payload: dict[str, Any] | None = None,
    event_id: str | None = None,
    idempotency_key: str | None = None,
) -> EventEnvelope:
    envelope = EventEnvelope(
        event_id=event_id or str(uuid.uuid4()),
        event_type=event_type,
        stream=stream,
        org_id=org_id,
        workspace_id=workspace_id,
        trace_id=trace_id,
        payload=payload or {},
    )
    envelope.idempotency_key = idempotency_key or envelope.event_id
    return envelope
