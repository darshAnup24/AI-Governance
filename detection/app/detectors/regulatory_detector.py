"""
Regulatory Detector — Detects regulatory non-compliance signals.
Covers GDPR, HIPAA, EU AI Act, financial advice, medical advice, and COPPA.
"""

from __future__ import annotations

import re
import time
from typing import ClassVar

from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult


class RegulatoryDetector:
    """Detect regulatory compliance violations in AI content."""

    # GDPR violations
    GDPR_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:process(?:ing)?|collect(?:ing)?|stor(?:ing|e))\b.*\b(?:personal data|personal information|PII)\b.*\b(?:without|no)\s+(?:consent|permission|authorization)\b", re.I | re.S),
         0.90, "GDPR Art. 6 — Processing without lawful basis"),
        (re.compile(r"\b(?:share|transfer|send|transmit)\b.*\b(?:personal data|user data|customer data)\b.*\b(?:third[- ]party|external|partner|vendor)\b", re.I | re.S),
         0.75, "GDPR Art. 28 — Data processor obligations"),
        (re.compile(r"\b(?:retain|store|keep)\b.*\b(?:indefinitely|forever|permanently)\b.*\b(?:data|records|information)\b", re.I | re.S),
         0.80, "GDPR Art. 5(1)(e) — Storage limitation principle"),
        (re.compile(r"\b(?:track(?:ing)?|monitor(?:ing)?|profil(?:ing|e))\b.*\b(?:user|customer|employee|individual)\b.*\b(?:without|no)\s+(?:notice|inform|consent)\b", re.I | re.S),
         0.85, "GDPR Art. 22 — Automated individual decision-making"),
    ]

    # HIPAA patterns
    HIPAA_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:patient|medical)\s+(?:name|record|history|diagnosis|treatment|prescription)\b.*\b(?:share|disclose|reveal|expose|log)\b", re.I | re.S),
         0.85, "HIPAA §164.502 — PHI disclosure restrictions"),
        (re.compile(r"\b(?:diagnos(?:is|ed)|prescri(?:be|ption|bed)|treat(?:ment|ed))\b.*\b(?:Mr\.|Mrs\.|Ms\.|Dr\.)\s+[A-Z][a-z]+", re.S),
         0.90, "HIPAA §164.514 — PHI with identifiable patient info"),
        (re.compile(r"\b(?:health|medical)\s+(?:insurance|plan|coverage|provider)\b.*\b(?:SSN|social security|date of birth|DOB|address)\b", re.I | re.S),
         0.88, "HIPAA §164.514 — PHI identifier combination"),
    ]

    # EU AI Act high-risk indicators
    EU_AI_ACT: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:biometric|facial recognition|emotion detection|gait analysis)\b.*\b(?:identify|classify|categorize|score)\b", re.I | re.S),
         0.92, "EU AI Act Art. 6 — High-risk: biometric identification"),
        (re.compile(r"\b(?:credit scor(?:e|ing)|loan (?:approval|decision)|creditworth(?:y|iness))\b.*\b(?:automat(?:ic|ed)|AI|algorithm)\b", re.I | re.S),
         0.90, "EU AI Act Annex III — High-risk: credit scoring"),
        (re.compile(r"\b(?:hir(?:e|ing)|recruit(?:ment|ing)|employ(?:ment|ee) screening|CV|resume)\s+(?:scor(?:e|ing)|rank(?:ing)?|filter(?:ing)?)\b", re.I),
         0.92, "EU AI Act Annex III — High-risk: employment decisions"),
        (re.compile(r"\b(?:predict(?:ive)? (?:policing|crime)|recidivism|criminal (?:risk|profile))\b", re.I),
         0.95, "EU AI Act Annex III — High-risk: law enforcement"),
        (re.compile(r"\b(?:social[- ]scor(?:e|ing)|citizen[- ]scor(?:e|ing)|trust[- ]scor(?:e|ing))\b", re.I),
         0.98, "EU AI Act Art. 5 — Prohibited: social scoring"),
    ]

    # Financial advice without disclaimer
    FINANCIAL_ADVICE: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:you should|I recommend|you must)\s+(?:invest|buy|sell|trade)\b.*\b(?:stock|shares|crypto|bond|ETF|fund)\b", re.I | re.S),
         0.80, "SEC/FCA — Financial advice requires disclaimer and qualification"),
        (re.compile(r"\b(?:guaranteed return|risk[- ]free|no[- ]risk investment|can't lose)\b", re.I),
         0.90, "SEC — Misleading investment claims"),
    ]

    # Medical advice without disclaimer
    MEDICAL_ADVICE: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:you should|I recommend|you must)\s+(?:take|stop taking|increase|decrease)\b.*\b(?:medication|medicine|drug|dose|dosage)\b", re.I | re.S),
         0.88, "FDA — Medical advice requires professional qualification"),
        (re.compile(r"\b(?:you (?:have|likely have|probably have)|this is (?:a |likely ))\b.*\b(?:disease|disorder|syndrome|condition|cancer|diabetes)\b", re.I | re.S),
         0.85, "FDA — AI should not make medical diagnoses"),
    ]

    # COPPA patterns
    COPPA_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:child(?:ren)?|kid|minor|under (?:13|twelve|thirteen))\b.*\b(?:collect|gather|track|store)\b.*\b(?:data|information|email|name|location)\b", re.I | re.S),
         0.88, "COPPA §312.3 — Collection of children's personal information"),
    ]

    def detect(self, text: str) -> DetectionResult:
        """Run all regulatory pattern checks against input text."""
        start = time.perf_counter()
        spans: list[DetectedSpan] = []

        pattern_groups = [
            ("gdpr", self.GDPR_PATTERNS),
            ("hipaa", self.HIPAA_PATTERNS),
            ("eu_ai_act", self.EU_AI_ACT),
            ("financial", self.FINANCIAL_ADVICE),
            ("medical", self.MEDICAL_ADVICE),
            ("coppa", self.COPPA_PATTERNS),
        ]

        for group_name, patterns in pattern_groups:
            for pattern, confidence, reference in patterns:
                for match in pattern.finditer(text):
                    ctx_start = max(0, match.start() - 60)
                    ctx_end = min(len(text), match.end() + 60)
                    spans.append(DetectedSpan(
                        start=match.start(),
                        end=match.end(),
                        category=DetectionCategory.CONFIDENTIAL,
                        confidence=confidence,
                        matched_text=match.group()[:80],
                        detector=f"regulatory_{group_name}",
                        context=text[ctx_start:ctx_end],
                    ))

        duration_ms = (time.perf_counter() - start) * 1000
        max_conf = max((s.confidence for s in spans), default=0.0)

        return DetectionResult(
            detector_name="regulatory",
            spans=spans,
            risk_score=max_conf * 100 if spans else 0,
            processing_time_ms=round(duration_ms, 2),
        )
