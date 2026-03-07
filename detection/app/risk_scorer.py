"""
Risk scoring aggregator — combines results from all detection tiers
into a final risk score with recommended action.
"""

from __future__ import annotations

from proxy.app.models import (
    ActionType,
    DetectedSpan,
    DetectionCategory,
    DetectionResult,
    FinalRiskScore,
)


# ─── Configuration (overridable via org policy in Phase 4) ─

DETECTOR_WEIGHTS: dict[str, float] = {
    "API_KEY": 1.0,
    "CREDENTIALS": 1.0,
    "PII": 0.9,
    "SOURCE_CODE": 0.8,
    "CONFIDENTIAL": 0.7,
    # New ShieldAI detectors
    "HALLUCINATION": 0.85,
    "BIAS": 0.80,
    "SECURITY_VULN": 0.95,
    "REGULATORY": 1.0,
    "PROMPT_INJECTION": 1.0,
}

SEVERITY_MULTIPLIERS: dict[str, float] = {
    "critical": 2.0,
    "high": 1.5,
    "medium": 1.0,
    "low": 0.5,
}

# Category → severity mapping
CATEGORY_SEVERITY: dict[str, str] = {
    "API_KEY": "critical",
    "CREDENTIALS": "critical",
    "PII": "high",
    "SOURCE_CODE": "medium",
    "CONFIDENTIAL": "medium",
    # New categories
    "HALLUCINATION": "medium",
    "BIAS": "high",
    "SECURITY_VULN": "critical",
    "REGULATORY": "critical",
    "PROMPT_INJECTION": "critical",
}

# Score → Action thresholds
ACTION_THRESHOLDS: list[tuple[int, ActionType]] = [
    (90, ActionType.BLOCK),
    (80, ActionType.REDACT),
    (60, ActionType.WARN),
    (30, ActionType.LOG),
    (0, ActionType.ALLOW),
]

# Roles with reduced sensitivity
REDUCED_SENSITIVITY_ROLES = {"security", "admin", "ciso"}


class RiskScoreAggregator:
    """Combines detection results from multiple tiers into a final risk score."""

    def aggregate(
        self,
        results: list[DetectionResult],
        user_role: str = "",
    ) -> FinalRiskScore:
        """
        Score formula:
          base_score = Σ(detector_weight × max_confidence × severity_multiplier)
          final_score = min(100, base_score × context_modifier)
        """
        all_spans: list[DetectedSpan] = []
        breakdown: dict[str, dict] = {}
        base_score = 0.0

        for result in results:
            if not result.spans:
                continue

            for span in result.spans:
                all_spans.append(span)
                category_key = span.category.value

                # Get weights and multipliers
                weight = DETECTOR_WEIGHTS.get(category_key, 0.7)
                severity = CATEGORY_SEVERITY.get(category_key, "medium")
                severity_mult = SEVERITY_MULTIPLIERS.get(severity, 1.0)

                # Calculate contribution
                contribution = weight * span.confidence * severity_mult * 30
                base_score += contribution

                # Track breakdown
                if category_key not in breakdown:
                    breakdown[category_key] = {
                        "count": 0,
                        "max_confidence": 0,
                        "total_contribution": 0,
                        "severity": severity,
                    }
                breakdown[category_key]["count"] += 1
                breakdown[category_key]["max_confidence"] = max(
                    breakdown[category_key]["max_confidence"], span.confidence
                )
                breakdown[category_key]["total_contribution"] += contribution

        # Apply context modifier for privileged roles
        context_modifier = 0.5 if user_role.lower() in REDUCED_SENSITIVITY_ROLES else 1.0
        final_score = min(100, int(base_score * context_modifier))

        # Determine action
        recommended_action = ActionType.ALLOW
        for threshold, action in ACTION_THRESHOLDS:
            if final_score >= threshold:
                recommended_action = action
                break

        # Compute EU AI Act risk level from score
        if final_score >= 90:
            eu_ai_act_level = "UNACCEPTABLE"
        elif final_score >= 70:
            eu_ai_act_level = "HIGH"
        elif final_score >= 40:
            eu_ai_act_level = "LIMITED"
        else:
            eu_ai_act_level = "MINIMAL"

        # Collect regulatory flags from detector names
        regulatory_flags = []
        for span in all_spans:
            if span.detector and span.detector.startswith("regulatory_"):
                regulatory_flags.append({
                    "regulation": span.detector.replace("regulatory_", "").upper(),
                    "confidence": span.confidence,
                    "context": span.context or "",
                })

        # Top 5 remediation priorities
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


def redact_prompt(prompt: str, detected_spans: list[DetectedSpan]) -> str:
    """
    Replace detected spans with [REDACTED:CATEGORY] tokens.
    Handles overlapping spans by processing from end to start.
    """
    if not detected_spans:
        return prompt

    # Sort spans by start position descending to avoid offset issues
    sorted_spans = sorted(detected_spans, key=lambda s: s.start, reverse=True)

    # Merge overlapping spans (keep the one with higher confidence)
    merged: list[DetectedSpan] = []
    for span in sorted_spans:
        if merged and span.end > merged[-1].start:
            # Overlapping — keep the higher confidence one
            if span.confidence > merged[-1].confidence:
                merged[-1] = span
            continue
        merged.append(span)

    # Apply redactions
    result = prompt
    for span in merged:
        replacement = f"[REDACTED:{span.category.value}]"
        result = result[:span.start] + replacement + result[span.end:]

    return result
