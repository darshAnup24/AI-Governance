from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DetectedSpan:
    start: int = 0
    end: int = 0
    type: str = ""
    matched_text: str = ""
    context: str = ""
    checksum_valid: bool = False


@dataclass
class PolicyInfo:
    rule_id: str = ""
    rule_name: str = ""
    action: str = ""
    priority: int = 0
    matched_condition: str = ""


@dataclass
class RemediationInfo:
    suggestion: str = ""
    docs_url: str = ""
    similar_safe_examples: list[str] = field(default_factory=list)


@dataclass
class DetectionBreakdown:
    tier: str = ""
    score: float = 0.0
    action: str = "ALLOW"
    matched: bool = False
    latency_ms: float = 0.0


@dataclass
class AirlockErrorBody:
    code: str = ""
    category: str = ""
    tier: str = ""
    confidence: float = 0.0
    span: DetectedSpan | None = None
    policy: PolicyInfo | None = None
    remediation: RemediationInfo | None = None
    detection_breakdown: list[DetectionBreakdown] | None = None
    raw: dict[str, Any] | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AirlockErrorBody:
        airlock = data.get("airlock", data)
        span_raw = airlock.get("span")
        span = DetectedSpan(**span_raw) if span_raw and isinstance(span_raw, dict) else None
        policy_raw = airlock.get("policy")
        policy = PolicyInfo(**policy_raw) if policy_raw and isinstance(policy_raw, dict) else None
        remediation_raw = airlock.get("remediation")
        remediation = (
            RemediationInfo(**remediation_raw) if remediation_raw and isinstance(remediation_raw, dict) else None
        )
        breakdown_raw = airlock.get("detection_breakdown")
        detection_breakdown = None
        if breakdown_raw and isinstance(breakdown_raw, dict):
            detection_breakdown = [
                DetectionBreakdown(tier=t, **v) for t, v in breakdown_raw.items()
            ]
        return cls(
            code=airlock.get("code", ""),
            category=airlock.get("category", ""),
            tier=airlock.get("tier", ""),
            confidence=float(airlock.get("confidence", 0.0)),
            span=span,
            policy=policy,
            remediation=remediation,
            detection_breakdown=detection_breakdown,
            raw=data,
        )
