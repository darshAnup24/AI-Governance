"""
Bias Detector — Detects bias patterns in AI-generated content.
Covers gender, racial/ethnic, age, confirmation, and geographic bias.
"""

from __future__ import annotations

import re
import time
from typing import ClassVar

from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult


class BiasDetector:
    """Detect bias patterns in AI-generated text."""

    # Gender bias in professional descriptions
    GENDER_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:chairman|manpower|mankind|fireman|policeman|businessman|salesman|mailman|foreman)\b", re.I), 0.70, "Use gender-neutral alternatives (e.g., chairperson, workforce, humanity)"),
        (re.compile(r"\b(?:she|her)\s+(?:is|was)\s+(?:emotional|nurturing|supportive|caring|gentle)\b", re.I), 0.75, "Gender stereotype: associating femininity with emotional traits"),
        (re.compile(r"\b(?:he|his)\s+(?:is|was)\s+(?:strong|decisive|aggressive|assertive|dominant|rational)\b", re.I), 0.70, "Gender stereotype: associating masculinity with strength/authority"),
        (re.compile(r"\b(?:female|woman|girl)\s+(?:engineer|developer|programmer|scientist|doctor|CEO|executive)\b", re.I), 0.65, "Unnecessarily gendering professional roles implies it's unusual"),
        (re.compile(r"\b(?:male|man)\s+(?:nurse|teacher|secretary|receptionist|caregiver)\b", re.I), 0.65, "Unnecessarily gendering professional roles implies it's unusual"),
        (re.compile(r"\bworking (?:mother|mom|mum)\b", re.I), 0.60, "The term 'working mother' implies motherhood is the default, not work"),
    ]

    # Racial/ethnic stereotyping
    RACIAL_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:articulate|well-spoken)\b.*\b(?:Black|African|minority)\b", re.I), 0.85, "Describing minority individuals as 'articulate' implies surprise"),
        (re.compile(r"\b(?:exotic|oriental|primitive|savage|uncivilized)\b", re.I), 0.80, "Using antiquated or dehumanizing racial descriptors"),
        (re.compile(r"\b(?:inner[- ]city|urban)\b.*\b(?:crime|violence|danger|poverty)\b", re.I), 0.75, "Coded language associating urban areas with negative stereotypes"),
        (re.compile(r"\b(?:illegal (?:alien|immigrant))\b", re.I), 0.80, "Use 'undocumented immigrant' or 'unauthorized migrant' instead"),
        (re.compile(r"\b(?:third[- ]world|backward)\s+(?:country|nation|people)\b", re.I), 0.75, "Use 'developing nation' or 'Global South' instead"),
    ]

    # Age discrimination
    AGE_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:too old|over the hill|past (?:their|his|her) prime)\b", re.I), 0.85, "Age-discriminatory language"),
        (re.compile(r"\b(?:digital native|tech-savvy)\b.*\b(?:young|millennial|gen ?z)\b", re.I), 0.60, "Assuming technology skills correlate with age"),
        (re.compile(r"\b(?:senior|older)\s+(?:worker|employee|candidate)\b.*\b(?:slow|resist|outdated|inflexible)\b", re.I), 0.80, "Age stereotyping in employment context"),
        (re.compile(r"\b(?:young|junior)\s+(?:and|but)\s+(?:inexperienced|immature|unreliable)\b", re.I), 0.70, "Age-based generalization about capability"),
    ]

    # Confirmation bias in analysis
    CONFIRMATION_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:obviously|clearly|of course|naturally|as expected)\b", re.I), 0.50, "Presenting conclusions as self-evident may indicate confirmation bias"),
        (re.compile(r"\b(?:this (?:proves|confirms|validates) (?:that|what))\b", re.I), 0.65, "Claiming single evidence 'proves' a conclusion"),
        (re.compile(r"\b(?:the only (?:explanation|reason|conclusion))\b", re.I), 0.70, "Presenting one viewpoint as the only possibility"),
        (re.compile(r"\b(?:anyone (?:can see|would agree|knows))\b", re.I), 0.60, "Universalizing a particular perspective"),
    ]

    # Geographic/cultural bias
    GEOGRAPHIC_BIAS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:in (?:the )?(?:West|Western (?:world|countries|nations)))\b.*\b(?:better|superior|advanced|civilized)\b", re.I), 0.75, "Western-centric bias implying cultural superiority"),
        (re.compile(r"\b(?:normal|standard|typical)\b.*\b(?:American|Western|European)\b", re.I), 0.65, "Treating one culture as the universal standard"),
    ]

    def detect(self, text: str) -> DetectionResult:
        """Run all bias pattern checks against input text."""
        start = time.perf_counter()
        spans: list[DetectedSpan] = []

        pattern_groups = [
            ("gender", self.GENDER_BIAS),
            ("racial", self.RACIAL_BIAS),
            ("age", self.AGE_BIAS),
            ("confirmation", self.CONFIRMATION_BIAS),
            ("geographic", self.GEOGRAPHIC_BIAS),
        ]

        for group_name, patterns in pattern_groups:
            for pattern, confidence, recommendation in patterns:
                for match in pattern.finditer(text):
                    ctx_start = max(0, match.start() - 60)
                    ctx_end = min(len(text), match.end() + 60)
                    spans.append(DetectedSpan(
                        start=match.start(),
                        end=match.end(),
                        category=DetectionCategory.CONFIDENTIAL,
                        confidence=confidence,
                        matched_text=match.group()[:80],
                        detector=f"bias_{group_name}",
                        context=text[ctx_start:ctx_end],
                    ))

        duration_ms = (time.perf_counter() - start) * 1000
        max_conf = max((s.confidence for s in spans), default=0.0)

        return DetectionResult(
            detector_name="bias",
            spans=spans,
            risk_score=max_conf * 100 if spans else 0,
            processing_time_ms=round(duration_ms, 2),
        )
