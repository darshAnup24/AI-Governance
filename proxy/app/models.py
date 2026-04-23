"""
Shared data models used across the proxy service.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────

class ActionType(str, Enum):
    ALLOW = "ALLOW"
    LOG = "LOG"
    WARN = "WARN"
    REDACT = "REDACT"
    BLOCK = "BLOCK"


class LLMProvider(str, Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE_OPENAI = "azure_openai"
    COHERE = "cohere"


class DetectionCategory(str, Enum):
    API_KEY = "API_KEY"
    PII = "PII"
    SOURCE_CODE = "SOURCE_CODE"
    CREDENTIALS = "CREDENTIALS"
    CONFIDENTIAL = "CONFIDENTIAL"
    HALLUCINATION = "HALLUCINATION"
    BIAS = "BIAS"
    SECURITY_VULN = "SECURITY_VULN"
    REGULATORY = "REGULATORY"
    PROMPT_INJECTION = "PROMPT_INJECTION"


# ─── Detection Models ────────────────────────────────────

class DetectedSpan(BaseModel):
    start: int
    end: int
    category: DetectionCategory
    confidence: float = Field(ge=0.0, le=1.0)
    matched_text: str = ""
    detector: str = ""
    context: str = ""


class DetectionResult(BaseModel):
    detector_name: str
    spans: list[DetectedSpan] = []
    risk_score: float = 0.0
    processing_time_ms: float = 0.0


class FinalRiskScore(BaseModel):
    score: int = Field(ge=0, le=100)
    breakdown: dict[str, Any] = {}
    recommended_action: ActionType = ActionType.ALLOW
    detected_spans: list[DetectedSpan] = []
    eu_ai_act_risk_level: str = "MINIMAL"
    regulatory_flags: list[dict[str, Any]] = []
    remediation_priority: list[str] = []


# ─── Request / Response ─────────────────────────────────

class UserContext(BaseModel):
    user_id: str
    email: str = ""
    department: str = ""
    role: str = ""
    permissions: list[str] = []
    org_id: str = ""


class ChatMessage(BaseModel):
    role: str
    content: str | None = None


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    temperature: float | None = None
    max_tokens: int | None = None
    stream: bool = False
    top_p: float | None = None
    n: int | None = None
    stop: str | list[str] | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    user: str | None = None

    class Config:
        extra = "allow"


class PolicyDecision(BaseModel):
    action: ActionType
    matched_rule_id: str | None = None
    reason: str = ""
    risk_score: int = 0


# ─── Audit ────────────────────────────────────────────────

class AuditEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    org_id: str = ""
    user_id: str = ""
    session_id: str = ""
    tool_name: str = ""
    llm_provider: str = ""
    prompt_hash: str = ""
    encrypted_prompt_hash: str | None = None
    detection_results: dict[str, Any] = {}
    encrypted_detected_spans: str | None = None
    risk_score: int = 0
    action_taken: ActionType = ActionType.ALLOW
    policy_rule_id: str | None = None
    redacted_prompt: str | None = None
    request_duration_ms: float = 0.0
    upstream_status_code: int | None = None


# ─── RFC 7807 Problem JSON ───────────────────────────────

class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str = ""
    instance: str = ""
