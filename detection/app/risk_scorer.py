"""
Risk scoring aggregator — combines results from all detection tiers
into a final risk score with recommended action.

Scoring model: Weighted Confidence Fusion with Veto Power
---------------------------------------------------------
Replaces the previous max-escalation approach (max of all spans) which caused
false-positive cascades — e.g. a noisy regex flagging AKIAIOSFODNN7EXAMPLE at
0.99 would block a legitimate documentation prompt even when the calibrated
transformer said 0.05 SAFE.

New approach (based on architectural recommendation):
  1. Group spans by detector tier (regex / transformer / context)
  2. Compute tier-level confidence as weighted mean of its spans
  3. Apply veto rules:
       - Transformer veto: if transformer_conf > 0.90 and regex_conf < 0.30
         → trust transformer (documentation / educational context)
       - Regex override: if regex_conf > 0.95 and span has structural validation
         → trust regex (real secret, ignore transformer softening)
  4. Fuse with learned weights: regex=0.60, transformer=0.90, context=0.70
  5. Normalise to [0, 100]

Detector-to-tier mapping
------------------------
  regex tier  : "regex"
  transformer : "onnx_micro_model", "ml_classifier", "spacy_ner", "spacy_ner_custom"
  context tier: "hallucination", "bias", "security_code", "regulatory",
                "prompt_injection", "length_guard"
"""

from __future__ import annotations

import re

import structlog

from proxy.app.models import (
    ActionType,
    DetectedSpan,
    DetectionCategory,
    DetectionResult,
    FinalRiskScore,
)


# ─── Configuration ──────────────────────────────────────────────────────────────

DETECTOR_WEIGHTS: dict[str, float] = {
    "API_KEY":         1.0,
    "CREDENTIALS":     1.0,
    "PII":             0.9,
    "SOURCE_CODE":     0.8,
    "CONFIDENTIAL":    0.7,
    "HALLUCINATION":   0.85,
    "BIAS":            0.80,
    "SECURITY_VULN":   0.95,
    "REGULATORY":      1.0,
    "PROMPT_INJECTION": 1.0,
}

SEVERITY_MULTIPLIERS: dict[str, float] = {
    "critical": 2.0,
    "high":     1.5,
    "medium":   1.0,
    "low":      0.5,
}

CATEGORY_SEVERITY: dict[str, str] = {
    "API_KEY":         "critical",
    "CREDENTIALS":     "critical",
    "PII":             "high",
    "SOURCE_CODE":     "medium",
    "CONFIDENTIAL":    "medium",
    "HALLUCINATION":   "medium",
    "BIAS":            "high",
    "SECURITY_VULN":   "critical",
    "REGULATORY":      "critical",
    "PROMPT_INJECTION": "critical",
}

ACTION_THRESHOLDS: list[tuple[int, ActionType]] = [
    (93, ActionType.BLOCK),
    (80, ActionType.REDACT),
    (60, ActionType.WARN),
    (30, ActionType.LOG),
    (0,  ActionType.ALLOW),
]

# ─── Load category-specific thresholds from config ────────────────────────────
try:
    from detection.config import CATEGORY_THRESHOLDS as _CAT_THRESHOLDS
except ImportError:
    _CAT_THRESHOLDS: dict[str, dict[str, int]] = {}


def _category_action_thresholds(category: str) -> list[tuple[int, ActionType]]:
    """Return action thresholds for a specific category.

    Falls back to global ACTION_THRESHOLDS if no category-specific override exists.
    """
    if category in _CAT_THRESHOLDS:
        cat = _CAT_THRESHOLDS[category]
        return [
            (cat.get("block", 93), ActionType.BLOCK),
            (cat.get("redact", 80), ActionType.REDACT),
            (cat.get("warn", 60), ActionType.WARN),
            (30, ActionType.LOG),
            (0,  ActionType.ALLOW),
        ]
    return ACTION_THRESHOLDS

REDUCED_SENSITIVITY_ROLES = {"security", "admin", "ciso"}

# Categories that are inherently expressed in natural language.
# The 0.85× NL context modifier must NOT apply to them: a prompt injection
# is ALWAYS written in plain prose, so penalising it for being "natural
# language" causes confirmed attacks to land at WARN instead of BLOCK.
_NL_ATTACK_CATEGORIES: frozenset[DetectionCategory] = frozenset({
    DetectionCategory.PROMPT_INJECTION,
    DetectionCategory.SECURITY_VULN,
})

# After blending, these categories with high-confidence regex matches escalate
# directly to BLOCK regardless of fused score (catches blending underflow).
_BLOCK_ESCALATION_CATEGORIES: frozenset[DetectionCategory] = frozenset({
    DetectionCategory.PROMPT_INJECTION,
    DetectionCategory.SECURITY_VULN,
})
_BLOCK_ESCALATION_CONF = 0.85   # minimum regex confidence to trigger escalation

log = structlog.get_logger()

# ─── Tier membership ─────────────────────────────────────────────────────────

_REGEX_DETECTORS        = {"regex"}
_TRANSFORMER_DETECTORS  = {"onnx_micro_model", "ml_classifier", "spacy_ner", "spacy_ner_custom"}
_CONTEXT_DETECTORS      = {
    "hallucination", "bias", "security_code", "regulatory",
    "prompt_injection", "length_guard",
}

# Fusion weights by tier
_TIER_WEIGHTS = {"regex": 0.60, "transformer": 0.90, "context": 0.70}

# Veto / override thresholds
_TRANSFORMER_VETO_THRESHOLD   = 0.90   # transformer confidence above which it vetoes noisy regex
_REGEX_VETO_LOW               = 0.30   # regex confidence below which it can be overridden
_REGEX_OVERRIDE_THRESHOLD     = 0.95   # regex confidence above which it overrides soft transformer


# ─── Structural validation flag ───────────────────────────────────────────────
# Spans with these categories AND confidence ≥ 0.95 are considered structurally
# validated (checksum / Luhn / base32 passed) and activate the regex override.
_STRUCTURALLY_VALIDATED = {
    DetectionCategory.API_KEY,
    DetectionCategory.CREDENTIALS,
}


def _is_structurally_validated(span: DetectedSpan) -> bool:
    return (
        span.category in _STRUCTURALLY_VALIDATED
        and span.confidence >= _REGEX_OVERRIDE_THRESHOLD
    )


# ─── Weighted confidence fusion ───────────────────────────────────────────────

def _tier_of(detector_name: str) -> str:
    if detector_name in _REGEX_DETECTORS:
        return "regex"
    if detector_name in _TRANSFORMER_DETECTORS:
        return "transformer"
    return "context"


def _weighted_tier_confidence(
    tier_spans: dict[str, list[DetectedSpan]],
) -> dict[str, float]:
    """
    For each tier, compute weighted mean confidence across its spans.
    Weights span confidence by category severity weight.
    Returns {tier: mean_confidence} only for tiers that have at least one span.
    """
    result: dict[str, float] = {}
    for tier, spans in tier_spans.items():
        if not spans:
            continue
        weighted_sum = 0.0
        weight_total = 0.0
        for span in spans:
            cat_w = DETECTOR_WEIGHTS.get(span.category.value, 0.7)
            weighted_sum  += span.confidence * cat_w
            weight_total  += cat_w
        result[tier] = weighted_sum / weight_total if weight_total > 0 else 0.0
    return result


def _dynamic_fusion(
    tier_confidences: dict[str, float],
    regex_has_structural: bool,
) -> float:
    """
    Fuse tier-level confidences into a single score using weighted fusion
    with veto / override logic.

    Returns raw score in [0, 1] before normalisation to [0, 100].
    """
    regex_conf       = tier_confidences.get("regex",       0.0)
    transformer_conf = tier_confidences.get("transformer", 0.0)
    context_conf     = tier_confidences.get("context",     0.0)

    # ── Veto: calibrated transformer overrides noisy regex ──────────────────
    # Case: transformer is very confident this is SAFE but regex fired weakly.
    # e.g. AWS example key AKIAIOSFODNN7EXAMPLE in documentation.
    # Action: zero-out the regex contribution; trust the transformer.
    if (transformer_conf > 0 and
            (1.0 - transformer_conf) > _TRANSFORMER_VETO_THRESHOLD and
            regex_conf < _REGEX_VETO_LOW):
        # transformer_conf here = P(sensitive). If 1-P > 0.9 it's very SAFE.
        regex_conf = 0.0

    # ── Override: structurally-validated secret trumps soft transformer ─────
    # Case: regex passed AWS checksum + Luhn/base32 validation (confidence ≥ 0.95).
    # Even if transformer is soft, we trust the structural match.
    if regex_conf >= _REGEX_OVERRIDE_THRESHOLD and regex_has_structural:
        transformer_conf = max(transformer_conf, regex_conf * 0.85)

    # ── Weighted fusion ──────────────────────────────────────────────────────
    tier_w = _TIER_WEIGHTS
    total_weight = 0.0
    weighted_sum = 0.0

    for tier, conf in [
        ("regex",       regex_conf),
        ("transformer", transformer_conf),
        ("context",     context_conf),
    ]:
        if conf > 0:
            w = tier_w[tier]
            weighted_sum  += conf * w
            total_weight  += w

    return weighted_sum / total_weight if total_weight > 0 else 0.0


# ─── Aggregator ──────────────────────────────────────────────────────────────

class RiskScoreAggregator:
    """
    Combines detection results from multiple tiers into a final risk score
    using weighted confidence fusion with veto/override logic.
    """

    def aggregate(
        self,
        results: list[DetectionResult],
        user_role: str = "",
        input_context: str = "unknown",   # "natural_language" | "code" | "mixed" | "unknown"
    ) -> FinalRiskScore:
        """
        Weighted confidence fusion pipeline:
          1. Collect spans per tier
          2. Compute per-tier weighted mean confidence
          3. Apply veto / override rules
          4. Fuse tiers into single score
          5. Apply per-span category severity to get final risk score
          6. Apply role modifier

        Parameters
        ----------
        results:        Detection results from all tiers.
        user_role:      User role for sensitivity modifier.
        input_context:  Tier-0 classification of the input text.
        """
        all_spans:    list[DetectedSpan] = []
        breakdown:    dict[str, dict]    = {}
        tier_spans:   dict[str, list[DetectedSpan]] = {
            "regex": [], "transformer": [], "context": [],
        }

        regex_has_structural = False

        for result in results:
            if not result.spans:
                continue

            for span in result.spans:
                all_spans.append(span)
                tier = _tier_of(result.detector_name)
                tier_spans[tier].append(span)

                # Track whether any regex span passed structural validation
                if tier == "regex" and _is_structurally_validated(span):
                    regex_has_structural = True

                # Build breakdown for remediation priority
                category_key = span.category.value
                if category_key not in breakdown:
                    severity = CATEGORY_SEVERITY.get(category_key, "medium")
                    breakdown[category_key] = {
                        "count":            0,
                        "max_confidence":   0.0,
                        "total_contribution": 0.0,
                        "severity":         severity,
                    }
                breakdown[category_key]["count"] += 1
                breakdown[category_key]["max_confidence"] = max(
                    breakdown[category_key]["max_confidence"], span.confidence
                )
                # Per-category severity-weighted contribution (for remediation sorting)
                cat_w    = DETECTOR_WEIGHTS.get(category_key, 0.7)
                sev_mult = SEVERITY_MULTIPLIERS.get(
                    CATEGORY_SEVERITY.get(category_key, "medium"), 1.0
                )
                contribution = span.confidence * cat_w * sev_mult * 50
                breakdown[category_key]["total_contribution"] = max(
                    breakdown[category_key]["total_contribution"], contribution
                )

        # ── Tier-level confidence fusion ──────────────────────────────────────
        tier_confidences = _weighted_tier_confidence(tier_spans)
        fused_0_1 = _dynamic_fusion(tier_confidences, regex_has_structural)

        # ── Compute per-span severity-weighted max for the final score ────────
        # The fused score gives a direction; the per-span max anchors the scale
        # so that a single critical 100% match still scores 100.
        span_max_score = 0.0
        for span in all_spans:
            cat_w    = DETECTOR_WEIGHTS.get(span.category.value, 0.7)
            sev_mult = SEVERITY_MULTIPLIERS.get(
                CATEGORY_SEVERITY.get(span.category.value, "medium"), 1.0
            )
            span_max_score = max(span_max_score, cat_w * span.confidence * sev_mult * 50)

        # Blend: 60% fusion direction, 40% per-span max anchor
        base_score = 0.60 * (fused_0_1 * 100) + 0.40 * span_max_score

        # ── Context modifier ──────────────────────────────────────────────────
        # code blocks warrant full scrutiny; pure NL gets a small reduction.
        # EXCEPTION: NL attack categories (PROMPT_INJECTION, SECURITY_VULN) are
        # by definition written in prose — the modifier must not penalise them or
        # a 90%-confident injection scores 75 (WARN) instead of BLOCK.
        has_nl_attack = any(s.category in _NL_ATTACK_CATEGORIES for s in all_spans)
        input_context_mod = {
            "code":             1.00,
            "mixed":            0.95,
            "natural_language": 1.00 if has_nl_attack else 0.85,
            "unknown":          1.00,
        }.get(input_context, 1.00)

        role_mod = 0.5 if user_role.lower() in REDUCED_SENSITIVITY_ROLES else 1.0
        final_score = min(100, int(base_score * role_mod * input_context_mod))

        # ── BLOCK escalation for high-confidence confirmed patterns ────────────────
        # The blending formula can underflow for single-tier matches:
        # PROMPT_INJECTION regex 0.90 conf → fused 0.872 → base_score 88 → WARN.
        # A regex-validated critical pattern at ≥ 0.85 confidence must BLOCK.
        for span in all_spans:
            if (
                span.category in _BLOCK_ESCALATION_CATEGORIES
                and span.confidence >= _BLOCK_ESCALATION_CONF
                and span.detector == "regex"
            ):
                final_score = max(final_score, 90)
                break

        # ── Action (per-category thresholds) ──────────────────────────────────
        # Determine dominant category (highest contribution) and use its thresholds.
        dominant_category = ""
        if breakdown:
            dominant_category = max(
                breakdown.items(),
                key=lambda x: x[1]["total_contribution"],
            )[0]

        cat_thresholds = _category_action_thresholds(dominant_category)
        recommended_action = ActionType.ALLOW
        for threshold, action in cat_thresholds:
            if final_score >= threshold:
                recommended_action = action
                break

        # ── EU AI Act level ───────────────────────────────────────────────────
        if final_score >= 90:
            eu_ai_act_level = "UNACCEPTABLE"
        elif final_score >= 70:
            eu_ai_act_level = "HIGH"
        elif final_score >= 40:
            eu_ai_act_level = "LIMITED"
        else:
            eu_ai_act_level = "MINIMAL"

        # ── Regulatory flags ──────────────────────────────────────────────────
        regulatory_flags = [
            {
                "regulation": span.detector.replace("regulatory_", "").upper(),
                "confidence": span.confidence,
                "context":    span.context or "",
            }
            for span in all_spans
            if span.detector and span.detector.startswith("regulatory_")
        ]

        # ── Remediation priority ──────────────────────────────────────────────
        sorted_categories = sorted(
            breakdown.items(),
            key=lambda x: x[1]["total_contribution"],
            reverse=True,
        )
        remediation_priority = [
            f"Address {cat} ({info['count']} finding(s), severity: {info['severity']})"
            for cat, info in sorted_categories[:5]
        ]

        return FinalRiskScore(
            score=final_score,
            breakdown=breakdown,
            recommended_action=recommended_action,
            detected_spans=all_spans,
            eu_ai_act_risk_level=eu_ai_act_level,
            regulatory_flags=regulatory_flags,
            remediation_priority=remediation_priority,
        )


# ─── Redaction ────────────────────────────────────────────────────────────────

def redact_prompt(prompt: str, detected_spans: list[DetectedSpan]) -> str:
    """
    Replace detected spans with [REDACTED:CATEGORY] tokens.
    Handles overlapping spans by processing from end to start.

    Post-processing verification is run automatically: if any span's
    ``matched_text`` is still detectable in the output, a structured
    ``redaction.leak_detected`` ERROR is emitted via structlog.
    """
    if not detected_spans:
        return prompt

    sorted_spans = sorted(detected_spans, key=lambda s: s.start, reverse=True)

    merged: list[DetectedSpan] = []
    for span in sorted_spans:
        if merged and span.end > merged[-1].start:
            if span.confidence > merged[-1].confidence:
                merged[-1] = span
            continue
        merged.append(span)

    result = prompt
    for span in merged:
        replacement = f"[REDACTED:{span.category.value}]"
        result = result[:span.start] + replacement + result[span.end:]

    # Post-processing verification — confirm spans are absent from output
    from proxy.app.redaction_verifier import verify_redaction
    _rv = verify_redaction(prompt, result, detected_spans)
    log.debug(
        "redact_prompt.verification",
        redaction_verified=_rv["redaction_verified"],
        spans_verified=_rv["spans_verified"],
        spans_leaked=len(_rv["spans_leaked"]),
        content_changed=_rv["content_changed"],
        latency_ms=round(_rv["latency_ms"], 3),
    )

    return result
