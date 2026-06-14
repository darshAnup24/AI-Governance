from __future__ import annotations

from typing import Any

from airlock.models import AirlockErrorBody


class AirlockError(Exception):
    """Base exception for all Airlock SDK errors."""

    def __init__(self, message: str, status_code: int = 0, raw_response: Any = None) -> None:
        self.status_code = status_code
        self.raw_response = raw_response
        super().__init__(message)


class AirlockRejectionError(AirlockError):
    """403 — request blocked by a policy rule."""

    def __init__(self, message: str, status_code: int = 403, raw_response: Any = None) -> None:
        super().__init__(message, status_code, raw_response)
        body = AirlockErrorBody.from_dict(raw_response or {})
        self.code: str = body.code
        self.category: str = body.category
        self.tier: str = body.tier
        self.confidence: float = body.confidence
        self.span = body.span
        self.policy = body.policy
        self.remediation = body.remediation
        self.detection_breakdown = body.detection_breakdown

    def pretty_print(self) -> str:
        lines = [
            "Airlock Rejection",
            f"  Code:       {self.code}",
            f"  Category:   {self.category}",
            f"  Tier:       {self.tier}",
            f"  Confidence: {self.confidence * 100:.0f}%",
        ]
        if self.span:
            lines.append(f'  Match:      "{self.span.matched_text}"')
        if self.policy:
            lines.append(f"  Policy:     {self.policy.rule_name} (rule {self.policy.rule_id})")
        if self.remediation:
            lines.append(f"  Suggestion: {self.remediation.suggestion}")
        return "\n".join(lines)


class AirlockAuthenticationError(AirlockError):
    """401 — invalid or missing API key."""


class AirlockRateLimitError(AirlockError):
    """429 — rate limited."""

    def __init__(self, message: str, status_code: int = 429, raw_response: Any = None, retry_after: float = 0.0) -> None:
        self.retry_after = retry_after
        super().__init__(message, status_code, raw_response)


class AirlockUpstreamError(AirlockError):
    """502/504 — upstream LLM provider failed."""


class AirlockInternalError(AirlockError):
    """5xx — Airlock itself failed."""
