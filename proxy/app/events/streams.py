from __future__ import annotations

from proxy.app.config import get_settings
from proxy.app.events.schema import EventStream

settings = get_settings()

STREAM_CONFIG: dict[EventStream, dict[str, str]] = {
    EventStream.AUDIT_EVENTS: {
        "primary": settings.audit_stream_key,
        "retry": settings.audit_retry_stream_key,
        "dlq": settings.audit_dead_letter_stream_key,
    },
    EventStream.INCIDENT_EVENTS: {
        "primary": "incident_events",
        "retry": "incident_events_retry",
        "dlq": "incident_events_dlq",
    },
    EventStream.TELEMETRY_EVENTS: {
        "primary": "telemetry_events",
        "retry": "telemetry_events_retry",
        "dlq": "telemetry_events_dlq",
    },
    EventStream.POLICY_EVENTS: {
        "primary": "policy_events",
        "retry": "policy_events_retry",
        "dlq": "policy_events_dlq",
    },
    EventStream.DETECTION_EVENTS: {
        "primary": "detection_events",
        "retry": "detection_events_retry",
        "dlq": "detection_events_dlq",
    },
}


def get_primary_stream(stream: EventStream) -> str:
    return STREAM_CONFIG[stream]["primary"]


def get_retry_stream(stream: EventStream) -> str:
    return STREAM_CONFIG[stream]["retry"]


def get_dlq_stream(stream: EventStream) -> str:
    return STREAM_CONFIG[stream]["dlq"]
