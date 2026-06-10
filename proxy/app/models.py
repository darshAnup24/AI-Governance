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
    OLLAMA = "ollama"


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
    SAFE = "SAFE"  # ML classifier: no risk detected


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
    workspace_id: str = ""


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

    model_config = {"extra": "allow"}


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
    workspace_id: str = ""
    user_id: str = ""
    session_id: str = ""
    trace_id: str = ""
    tool_name: str = ""
    llm_provider: str = ""
    prompt_hash: str = ""
    detection_results: dict[str, Any] = {}
    risk_score: int = 0
    action_taken: ActionType = ActionType.ALLOW
    policy_rule_id: str | None = None
    redacted_prompt: str | None = None
    request_duration_ms: float = 0.0
    upstream_status_code: int | None = None


# ─── Airlock Error Codes ─────────────────────────────────

class AirlockErrorCode(str, Enum):
    """Machine-readable error codes returned in RFC7807 responses."""
    SECRET_DETECTED = "SECRET_DETECTED"
    PII_DETECTED = "PII_DETECTED"
    PROMPT_INJECTION_DETECTED = "PROMPT_INJECTION_DETECTED"
    JAILBREAK_DETECTED = "JAILBREAK_DETECTED"
    REGULATORY_VIOLATION = "REGULATORY_VIOLATION"
    SECURITY_VULNERABILITY = "SECURITY_VULNERABILITY"
    BIAS_DETECTED = "BIAS_DETECTED"
    HALLUCINATION_RISK = "HALLUCINATION_RISK"
    CONFIDENTIAL_DATA = "CONFIDENTIAL_DATA"
    POLICY_VIOLATION = "POLICY_VIOLATION"
    RATE_LIMITED = "RATE_LIMITED"
    UPSTREAM_ERROR = "UPSTREAM_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# ─── Airlock Error Detail Models ────────────────────────

class TierResult(BaseModel):
    """Per-tier detection result for diagnostics breakdown."""
    score: float = Field(default=0.0, ge=0.0, le=1.0, description="Detection confidence score 0-1")
    action: ActionType = ActionType.ALLOW
    matched: bool = False
    latency_ms: float = 0.0


class PolicyMatch(BaseModel):
    """Matched policy rule that triggered the block."""
    rule_id: str = ""
    rule_name: str = ""
    action: ActionType = ActionType.BLOCK
    priority: int = 0
    matched_condition: str = ""


class RemediationSuggestion(BaseModel):
    """Actionable guidance for the developer to resolve the block."""
    suggestion: str = ""
    docs_url: str = ""
    similar_safe_examples: list[str] = []


class SpanDiagnostics(BaseModel):
    """Redacted span match diagnostics for developer debugging."""
    start: int = 0
    end: int = 0
    type: str = ""
    matched_text: str = ""  # May be masked in non-verbose mode
    context: str = ""
    checksum_valid: bool | None = None


class AirlockDiagnostics(BaseModel):
    """Rich Airlock metadata block embedded in RFC7807 responses."""
    code: AirlockErrorCode = AirlockErrorCode.POLICY_VIOLATION
    category: DetectionCategory = DetectionCategory.SAFE
    tier: str = ""
    confidence: float = 0.0
    span: SpanDiagnostics | None = None
    policy: PolicyMatch | None = None
    remediation: RemediationSuggestion | None = None
    detection_breakdown: dict[str, TierResult] = {}


# ─── RFC 7807 Problem JSON ───────────────────────────────

class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str = ""
    instance: str = ""
    risk_score: int = 0


class AirlockErrorDetail(ProblemDetail):
    """
    Extended RFC7807 ProblemDetail with Airlock diagnostics.

    Returns rich, structured error responses with:
    - trace_id for request correlation
    - airlock metadata block with detection breakdown, policy match, remediation
    - machine-readable error codes
    - type-safe, versioned schema
    """
    trace_id: str = ""
    airlock: AirlockDiagnostics = Field(default_factory=AirlockDiagnostics)

    @classmethod
    def from_detection(
        cls,
        *,
        status: int = 403,
        title: str = "Request Blocked by Security Policy",
        detail: str = "",
        instance: str = "",
        trace_id: str = "",
        detection_result: dict[str, Any] | None = None,
        policy_decision: PolicyDecision | None = None,
        verbose: bool = False,
    ) -> AirlockErrorDetail:
        """
        Build a AirlockErrorDetail from detection results and policy decisions.
        Automatically extracts tier breakdowns, span diagnostics, and remediation.
        """
        diag = AirlockDiagnostics()

        if detection_result:
            detected_spans = detection_result.get("detected_spans", [])
            detection_results = detection_result.get("detection_results", [])

            # Build tier breakdown from detection results
            tier_map = _build_tier_breakdown(detection_results)
            diag.detection_breakdown = tier_map

            # Determine primary category and tier from spans
            if detected_spans:
                top_span = detected_spans[0]
                cat = top_span.get("category", "SAFE")
                try:
                    diag.category = DetectionCategory(cat)
                except ValueError:
                    diag.category = DetectionCategory.SAFE

                # Map category to error code
                diag.code = _category_to_error_code(diag.category)

                # Build span diagnostics (redacted in non-verbose mode)
                diag.span = SpanDiagnostics(
                    start=top_span.get("start", 0),
                    end=top_span.get("end", 0),
                    type=cat,
                    matched_text=_redact_span_text(
                        top_span.get("matched_text", ""),
                        mask=not verbose,
                    ),
                    context=top_span.get("context", ""),
                    checksum_valid=top_span.get("checksum_valid"),
                )

                # Determine triggering tier and confidence
                primary_detector = top_span.get("detector", "")
                tier_key = _detector_to_tier(primary_detector)
                diag.tier = tier_key
                diag.confidence = top_span.get("confidence", 0.0)

                # Set detail message
                if not detail:
                    detail = _build_detail_message(diag.category, top_span.get("matched_text", ""))

            # Build remediation
            diag.remediation = _build_remediation(diag.category, diag.tier, verbose)

            # Set title based on action
            if not title:
                title = _build_title(diag.category)

        # Attach policy match
        if policy_decision and policy_decision.matched_rule_id:
            diag.policy = PolicyMatch(
                rule_id=policy_decision.matched_rule_id,
                rule_name=policy_decision.reason,
                action=policy_decision.action,
                priority=0,
                matched_condition=f"Risk score >= {detection_result.get('risk_score', 0)}" if detection_result else "",
            )

        return cls(
            type=f"https://airlock.dev/errors/{diag.code.value}",
            title=title,
            status=status,
            detail=detail,
            instance=instance,
            trace_id=trace_id,
            risk_score=detection_result.get("risk_score", 0) if detection_result else 0,
            airlock=diag,
        )

    def to_safe(self) -> AirlockErrorDetail:
        """Return a sanitized version safe for production client consumption."""
        safe = self.model_copy(deep=True)
        if safe.airlock.span:
            safe.airlock.span.matched_text = _redact_span_text(
                safe.airlock.span.matched_text, mask=True
            )
        if safe.airlock.detection_breakdown:
            safe.airlock.detection_breakdown = {}
        return safe


# ─── Error Code Helpers ──────────────────────────────────

def _category_to_error_code(category: DetectionCategory) -> AirlockErrorCode:
    mapping = {
        DetectionCategory.API_KEY: AirlockErrorCode.SECRET_DETECTED,
        DetectionCategory.CREDENTIALS: AirlockErrorCode.SECRET_DETECTED,
        DetectionCategory.PII: AirlockErrorCode.PII_DETECTED,
        DetectionCategory.PROMPT_INJECTION: AirlockErrorCode.PROMPT_INJECTION_DETECTED,
        DetectionCategory.SECURITY_VULN: AirlockErrorCode.SECURITY_VULNERABILITY,
        DetectionCategory.REGULATORY: AirlockErrorCode.REGULATORY_VIOLATION,
        DetectionCategory.BIAS: AirlockErrorCode.BIAS_DETECTED,
        DetectionCategory.HALLUCINATION: AirlockErrorCode.HALLUCINATION_RISK,
        DetectionCategory.CONFIDENTIAL: AirlockErrorCode.CONFIDENTIAL_DATA,
        DetectionCategory.SOURCE_CODE: AirlockErrorCode.CONFIDENTIAL_DATA,
    }
    return mapping.get(category, AirlockErrorCode.POLICY_VIOLATION)


def _detector_to_tier(detector: str) -> str:
    mapping = {
        "regex": "tier_1_regex",
        "ner": "tier_2_ner",
        "spacy_ner": "tier_2_ner",
        "spacy_ner_custom": "tier_2_ner",
        "ml_classifier": "tier_3_ml",
        "prompt_injection": "tier_3_ml",
        "onnx_micro_model": "tier_4_onnx",
        "hallucination": "tier_3_ml",
        "bias": "tier_3_ml",
        "security_code": "tier_3_ml",
        "regulatory": "tier_3_ml",
        "length_guard": "tier_1_regex",
    }
    return mapping.get(detector, "tier_3_ml")


def _build_tier_breakdown(detection_results: list[dict[str, Any]]) -> dict[str, TierResult]:
    """Convert detection service results into per-tier breakdown."""
    tiers: dict[str, TierResult] = {}
    tier_keys: set[str] = set()

    for dr in detection_results:
        dname = dr.get("detector_name", "")
        tkey = _detector_to_tier(dname)
        tier_keys.add(tkey)

        spans = dr.get("spans", [])
        score = dr.get("risk_score", 0.0) / 100.0
        has_match = len(spans) > 0
        latency = dr.get("processing_time_ms", 0.0)

        existing = tiers.get(tkey)
        if existing is None or score > existing.score:
            tiers[tkey] = TierResult(
                score=score,
                action=ActionType.BLOCK if has_match and score > 0.5 else ActionType.ALLOW,
                matched=has_match,
                latency_ms=latency,
            )

    # Fill in tiers that didn't produce results
    all_tiers = ["tier_1_regex", "tier_2_ner", "tier_3_ml", "tier_4_onnx"]
    for t in all_tiers:
        if t not in tiers:
            tiers[t] = TierResult()

    return tiers


def _build_detail_message(category: DetectionCategory, matched_text: str = "") -> str:
    messages = {
        DetectionCategory.API_KEY: "An API key or secret was detected in the prompt.",
        DetectionCategory.PII: "Personally identifiable information (PII) was detected.",
        DetectionCategory.PROMPT_INJECTION: "A prompt injection or jailbreak attempt was detected.",
        DetectionCategory.SECURITY_VULN: "A security vulnerability pattern was detected.",
        DetectionCategory.REGULATORY: "A regulatory compliance violation was detected.",
        DetectionCategory.CREDENTIALS: "A credential or secret was detected in the prompt.",
        DetectionCategory.CONFIDENTIAL: "Confidential or proprietary data was detected.",
        DetectionCategory.BIAS: "Potentially biased content was detected.",
        DetectionCategory.HALLUCINATION: "A hallucination risk pattern was detected.",
        DetectionCategory.SOURCE_CODE: "Source code or proprietary logic was detected.",
    }
    base = messages.get(category, "Sensitive content was detected and blocked.")
    if matched_text:
        preview = matched_text[:80].replace("\n", " ")
        base += f" Match preview: \"{_redact_span_text(preview, mask=True)}\""
    return base


def _build_title(category: DetectionCategory) -> str:
    titles = {
        DetectionCategory.API_KEY: "API Key or Secret Detected",
        DetectionCategory.PII: "Personally Identifiable Information Detected",
        DetectionCategory.PROMPT_INJECTION: "Prompt Injection Detected",
        DetectionCategory.SECURITY_VULN: "Security Vulnerability Detected",
        DetectionCategory.REGULATORY: "Regulatory Compliance Violation",
        DetectionCategory.CREDENTIALS: "Credential or Secret Detected",
        DetectionCategory.CONFIDENTIAL: "Confidential Data Detected",
        DetectionCategory.BIAS: "Potentially Biased Content Detected",
        DetectionCategory.HALLUCINATION: "Hallucination Risk Detected",
        DetectionCategory.SOURCE_CODE: "Source Code Detected",
    }
    return titles.get(category, "Request Blocked by Security Policy")


def _build_remediation(
    category: DetectionCategory,
    tier: str = "",
    verbose: bool = False,
) -> RemediationSuggestion:
    """Build remediation guidance based on detection category."""
    remediation_map: dict[DetectionCategory, RemediationSuggestion] = {
        DetectionCategory.API_KEY: RemediationSuggestion(
            suggestion="Remove the API key or secret from your prompt. Use environment variables or a secrets manager instead of hardcoding credentials.",
            docs_url="https://airlock.dev/docs/remediation/secrets",
            similar_safe_examples=[
                "How do I configure my AWS SDK?",
                "What is the recommended way to manage secrets?",
                "Show me how to use environment variables for configuration.",
            ],
        ),
        DetectionCategory.PII: RemediationSuggestion(
            suggestion="Remove personally identifiable information (PII) from your prompt. Use placeholder data or synthetic examples instead.",
            docs_url="https://airlock.dev/docs/remediation/pii",
            similar_safe_examples=[
                "Show me a data structure for a user profile.",
                "Generate a mock customer record with placeholder data.",
                "How should I handle user data in my application?",
            ],
        ),
        DetectionCategory.PROMPT_INJECTION: RemediationSuggestion(
            suggestion="Your prompt contains patterns that resemble prompt injection or jailbreak attempts. Rephrase your request without system override or role-play patterns.",
            docs_url="https://airlock.dev/docs/remediation/prompt-injection",
            similar_safe_examples=[
                "Explain how system prompts should be structured.",
                "What are best practices for prompt engineering?",
                "How can I improve my prompt clarity?",
            ],
        ),
        DetectionCategory.SECURITY_VULN: RemediationSuggestion(
            suggestion="Your prompt contains security vulnerability patterns. Remove any exploit code, SQL injection patterns, or command injection attempts.",
            docs_url="https://airlock.dev/docs/remediation/security",
            similar_safe_examples=[
                "How do I write secure SQL queries?",
                "Show me proper input validation examples.",
                "What are common security best practices?",
            ],
        ),
        DetectionCategory.REGULATORY: RemediationSuggestion(
            suggestion="Your prompt may violate regulatory compliance requirements (GDPR, HIPAA, etc.). Ensure you have proper consent and data handling procedures.",
            docs_url="https://airlock.dev/docs/remediation/regulatory",
            similar_safe_examples=[
                "What are GDPR requirements for data processing?",
                "Show me compliant data handling examples.",
                "How should I structure terms of service?",
            ],
        ),
        DetectionCategory.CREDENTIALS: RemediationSuggestion(
            suggestion="Remove the credential or token from your prompt. Use short-lived tokens or environment variables instead.",
            docs_url="https://airlock.dev/docs/remediation/credentials",
            similar_safe_examples=[
                "How do I authenticate with the API?",
                "What is the recommended way to handle tokens?",
                "Show me secure credential management.",
            ],
        ),
        DetectionCategory.CONFIDENTIAL: RemediationSuggestion(
            suggestion="Your prompt may contain confidential or proprietary information. Use anonymized or synthetic data instead.",
            docs_url="https://airlock.dev/docs/remediation/confidential",
            similar_safe_examples=[
                "Show me a template for internal documentation.",
                "Generate a sample report with placeholder data.",
                "How should I structure non-confidential queries?",
            ],
        ),
        DetectionCategory.SOURCE_CODE: RemediationSuggestion(
            suggestion="Your prompt contains source code that may be proprietary. Use pseudocode or simplified examples instead.",
            docs_url="https://airlock.dev/docs/remediation/source-code",
            similar_safe_examples=[
                "Explain the concept behind this algorithm.",
                "Show me a simplified version of this pattern.",
                "How is this feature typically implemented?",
            ],
        ),
    }

    suggestion = remediation_map.get(category)
    if not suggestion:
        suggestion = RemediationSuggestion(
            suggestion="Review your prompt for sensitive content and try again.",
            docs_url="https://airlock.dev/docs/remediation/general",
        )

    if not verbose:
        # In non-verbose mode, remove example text that could be misused
        suggestion.similar_safe_examples = suggestion.similar_safe_examples[:1]

    return suggestion


def _redact_span_text(text: str, mask: bool = True) -> str:
    """Redact sensitive text while preserving enough context for debugging.
    AKIAIOSFODNN7EXAMPLE → AKIA****EXAMPLE"""
    if not mask or not text or len(text) < 8:
        return text
    half = len(text) // 4
    return text[:half] + "*" * (len(text) - 2 * half) + text[-half:] if half > 0 else text
