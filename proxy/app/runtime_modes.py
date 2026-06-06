from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import re
from typing import Any

from proxy.app.models import ActionType


class RuntimeSecurityMode(str, Enum):
    STRICT = "STRICT"
    STANDARD = "STANDARD"
    HYBRID = "HYBRID"


@dataclass(frozen=True)
class RuntimeDecision:
    action: ActionType
    mode: RuntimeSecurityMode
    degraded: bool
    reason: str


_SENSITIVE_PATTERNS = [
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    re.compile(r"\b(?:4[0-9]{12}(?:[0-9]{3})?)\b"),
    re.compile(r"\bsk-[A-Za-z0-9]{16,}\b"),
    re.compile(r"\bpassword\b", re.IGNORECASE),
    re.compile(r"\bsecret\b", re.IGNORECASE),
]


def parse_runtime_mode(value: str | None) -> RuntimeSecurityMode:
    if not value:
        return RuntimeSecurityMode.STANDARD
    normalized = value.strip().upper()
    try:
        return RuntimeSecurityMode(normalized)
    except ValueError:
        return RuntimeSecurityMode.STANDARD


def detect_sensitive_prompt(prompt_text: str) -> bool:
    return any(pattern.search(prompt_text) for pattern in _SENSITIVE_PATTERNS)


def resolve_degraded_action(
    *,
    mode: RuntimeSecurityMode,
    prompt_text: str,
    detection_result: dict[str, Any],
) -> RuntimeDecision:
    if not detection_result.get("_degraded"):
        action = ActionType(detection_result.get("action", "ALLOW"))
        return RuntimeDecision(
            action=action,
            mode=mode,
            degraded=False,
            reason="detection_available",
        )

    degraded_reason = str(detection_result.get("_degraded_reason", "detection_unavailable"))
    if mode == RuntimeSecurityMode.STRICT:
        return RuntimeDecision(
            action=ActionType.BLOCK,
            mode=mode,
            degraded=True,
            reason=f"{degraded_reason}:strict_fail_closed",
        )

    if mode == RuntimeSecurityMode.HYBRID and detect_sensitive_prompt(prompt_text):
        return RuntimeDecision(
            action=ActionType.BLOCK,
            mode=mode,
            degraded=True,
            reason=f"{degraded_reason}:hybrid_sensitive_fail_closed",
        )

    return RuntimeDecision(
        action=ActionType.ALLOW,
        mode=mode,
        degraded=True,
        reason=f"{degraded_reason}:availability_preserved",
    )
