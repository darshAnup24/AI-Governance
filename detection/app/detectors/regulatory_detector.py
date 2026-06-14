"""
Regulatory Detector — Detects regulatory non-compliance signals.
Covers GDPR, HIPAA, EU AI Act, financial advice, medical advice, COPPA, and confidentiality.
"""

from __future__ import annotations

import re
import time
from typing import ClassVar

from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult


class RegulatoryDetector:
    """Detect regulatory compliance violations in AI content."""

    # ─── GDPR Violations ────────────────────────────────────────────────────
    GDPR_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:process(?:ing)?|collect(?:ing)?|stor(?:ing|e))\b.*\b(?:personal data|personal information|PII)\b.*\b(?:without|no)\s+(?:\w+\s+)?(?:consent|permission|authorization)\b", re.I | re.S),
         0.90, "GDPR Art. 6 — Processing without lawful basis"),
        (re.compile(r"\b(?:share|transfer|send|transmit)\b.*\b(?:personal data|user data|customer data)\b.*\b(?:third[- ]party|external|partner|vendor)\b", re.I | re.S),
         0.75, "GDPR Art. 28 — Data processor obligations"),
        (re.compile(r"\b(?:retain|store|keep)\b.*(?:(?:indefinitely|forever|permanently).*(?:data|records?|information)|(?:data|records?|information).*(?:indefinitely|forever|permanently))\b", re.I | re.S),
         0.80, "GDPR Art. 5(1)(e) — Storage limitation principle"),
        (re.compile(r"\b(?:track(?:ing)?|monitor(?:ing)?|profil(?:ing|e))\b.*\b(?:user|customer|employee|individual)\b.*\b(?:without|no)\s+(?:notice|inform|consent)\b", re.I | re.S),
         0.85, "GDPR Art. 22 — Automated individual decision-making"),
        # Short-form GDPR markers
        (re.compile(r"\bGDPR\s+(?:breach|violation|non-?compliance|filing|requirement|mandate|obligation)\b", re.I), 0.85, "GDPR compliance reference"),
        (re.compile(r"\b(?:subject\s+access\s+request|right\s+to\s+(?:erasure|portability|rectification|object|restrict))\b", re.I), 0.88, "GDPR data subject rights"),
        (re.compile(r"\b(?:data\s+(?:breach|incident|exposure|leak))\b.*\b(?:personal|user|customer)\b", re.I | re.S), 0.85, "GDPR Art. 33 — Breach notification"),
        (re.compile(r"\b(?:cross[- ]border|international)\s+(?:data\s+)?transfer\b", re.I), 0.80, "GDPR Chapter V — Cross-border data transfers"),
        (re.compile(r"\b(?:data\s+processing\s+agreement|DPA)\b", re.I), 0.80, "GDPR Art. 28 — DPA requirement"),
        (re.compile(r"\b(?:standard\s+contractual\s+clauses|SCCs?)\b", re.I), 0.75, "GDPR Chapter V — Transfer mechanisms"),
        (re.compile(r"\b(?:consent\s+(?:was\s+)?not\s+(?:obtained|given|provided|collected))\b", re.I), 0.85, "GDPR Art. 6 — Consent requirement"),
        (re.compile(r"\b(?:delete\s+(?:all\s+)?(?:my|the|user|customer)\s+(?:personal\s+)?data)\b", re.I), 0.80, "GDPR Art. 17 — Right to erasure request"),
    ]

    # ─── HIPAA Patterns ─────────────────────────────────────────────────────
    HIPAA_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:patient|medical)\s+(?:name|record|history|diagnosis|treatment|prescription)s?\b.*\b(?:share|disclose|reveal|expose|log)\w*\b", re.I | re.S),
         0.85, "HIPAA §164.502 — PHI disclosure restrictions"),
        (re.compile(r"\b(?:diagnos(?:is|ed)|prescri(?:be|ption|bed)|treat(?:ment|ed))\b.*\b(?:Mr\.|Mrs\.|Ms\.|Dr\.)\s+[A-Z][a-z]+", re.I | re.S),
         0.90, "HIPAA §164.514 — PHI with identifiable patient info"),
        (re.compile(r"\b(?:health|medical)\s+(?:insurance|plan|coverage|provider)\b.*\b(?:SSN|social security|date of birth|DOB|address)\b", re.I | re.S),
         0.88, "HIPAA §164.514 — PHI identifier combination"),
        # Short-form HIPAA markers
        (re.compile(r"\bHIPAA\s+(?:breach|violation|non-?compliance|requirement|mandate)\b", re.I), 0.85, "HIPAA compliance reference"),
        (re.compile(r"\bPHI\s+(?:disclosure|breach|exposure|leak|incident)\b", re.I), 0.85, "PHI breach reference"),
        (re.compile(r"\b(?:protected\s+health\s+information|individually\s+identifiable\s+health\s+information)\b", re.I), 0.80, "HIPAA — PHI definition"),
        (re.compile(r"\b(?:patient|medical)\s+record\s+number\b", re.I), 0.75, "HIPAA — Patient identifier"),
        (re.compile(r"\b(?:MRN[- ]?\d+|medical\s+record\s+(?:number|no\.?|#)\s*:?\s*\d+)\b", re.I), 0.80, "HIPAA — Medical record number"),
        (re.compile(r"\b(?:HIPAA\s+violation|breach\s+of\s+medical)\b", re.I), 0.88, "HIPAA violation reference"),
    ]

    # ─── EU AI Act ──────────────────────────────────────────────────────────
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
        # Short-form EU AI Act markers
        (re.compile(r"\bEU\s+AI\s+Act\s+(?:compliance|assessment|requirement|mandate|regulation)\b", re.I), 0.85, "EU AI Act compliance reference"),
        (re.compile(r"\b(?:high[- ]risk\s+AI\s+system|high[- ]risk\s+artificial\s+intelligence)\b", re.I), 0.80, "EU AI Act — High-risk classification"),
        (re.compile(r"\b(?:conformity\s+assessment|CE\s+marking\s+for\s+AI)\b", re.I), 0.80, "EU AI Act — Conformity assessment"),
        (re.compile(r"\b(?:human\s+oversight\s+mechanism|human[- ]in[- ]the[- ]loop)\b", re.I), 0.75, "EU AI Act — Human oversight requirement"),
        (re.compile(r"\b(?:training\s+data\s+(?:must|should|shall)\s+(?:be|undergo|comply))\b", re.I | re.S), 0.75, "EU AI Act Art. 10 — Data governance"),
    ]

    # ─── Financial Advice ───────────────────────────────────────────────────
    FINANCIAL_ADVICE: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:you should|I recommend|you must)\s+(?:invest|buy|sell|trade)\b.*\b(?:stock|shares|crypto|bond|ETF|fund)\b", re.I | re.S),
         0.80, "SEC/FCA — Financial advice requires disclaimer and qualification"),
        (re.compile(r"\b(?:guaranteed return|risk[- ]free|no[- ]risk investment|can't lose)\b", re.I),
         0.90, "SEC — Misleading investment claims"),
        # Short-form financial markers
        (re.compile(r"\b(?:buy|sell|hold)\s+\$\w+\s+(?:calls?|puts?|options?|shares?|stock)\b", re.I), 0.70, "Financial recommendation without disclaimer"),
        (re.compile(r"\b(?:not\s+(?:financial|investment)\s+(?:advice|recommendation|suggestion))\b", re.I), 0.60, "Financial disclaimer (may still be risky)"),
        (re.compile(r"\b(?:this\s+(?:is\s+)?(?:guaranteed|certain|promised)\s+to\s+(?:increase|grow|rise|double|triple))\b", re.I), 0.85, "SEC — Guaranteed return claim"),
    ]

    # ─── Medical Advice ─────────────────────────────────────────────────────
    MEDICAL_ADVICE: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:you should|I recommend|you must)\s+(?:take|stop taking|increase|decrease)\b.*\b(?:medication|medicine|drug|dose|dosage)\b", re.I | re.S),
         0.88, "FDA — Medical advice requires professional qualification"),
        (re.compile(r"\b(?:you (?:have|likely have|probably have)|this is (?:a |likely ))\b.*\b(?:disease|disorder|syndrome|condition|cancer|diabetes)\b", re.I | re.S),
         0.85, "FDA — AI should not make medical diagnoses"),
        # Short-form medical markers
        (re.compile(r"\b(?:take|stop taking|reduce|increase)\s+\w+\s+\d+\s*(?:mg|mcg|ml|tablets?|pills?|capsules?)\b", re.I), 0.70, "Specific medication dosage recommendation"),
        (re.compile(r"\b(?:I am a doctor|as a medical professional|I diagnose)\b", re.I), 0.80, "False medical authority claim"),
    ]

    # ─── COPPA Patterns ─────────────────────────────────────────────────────
    COPPA_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:child(?:ren)?|kid|minor|under (?:13|twelve|thirteen))\b.*\b(?:collect|gather|track|store)\b.*\b(?:data|information|email|name|location)\b", re.I | re.S),
         0.88, "COPPA §312.3 — Collection of children's personal information"),
        (re.compile(r"\bCOPPA\s+(?:violation|non-?compliance|requirement)\b", re.I), 0.80, "COPPA compliance reference"),
        (re.compile(r"\b(?:child(?:ren)?\s+(?:online|internet|digital)\s+(?:privacy|protection|safety))\b", re.I), 0.75, "COPPA-related reference"),
    ]

    # ─── RBI Data Localization ──────────────────────────────────────────────
    RBI_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:store|transfer|host|process)\b.*\b(?:payment|transaction|card|banking)\s+(?:data|information|records)\b.*\b(?:outside\s+India|foreign\s+server|overseas|us-east|eu-central|abroad|external)\b", re.I | re.S),
         0.88, "RBI — Payment data localization mandate violation"),
        (re.compile(r"\bRBI\s+(?:compliance|violation|mandate|requirement|circular)\b", re.I), 0.80, "RBI compliance reference"),
    ]

    # ─── Confidentiality Markings ───────────────────────────────────────────
    CONFIDENTIALITY_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float, str]]] = [
        (re.compile(r"\b(?:STRICTLY\s+)?CONFIDENTIAL(?:\s*[-–—:]\s*do\s+not\s+(?:share|distribute|disclose))?\b", re.I), 0.88, "Confidentiality classification"),
        (re.compile(r"\b(?:EYES\s+ONLY|TRADE\s+SECRET|PRIVILEGED\s+AND\s+CONFIDENTIAL)\b", re.I), 0.85, "Restricted access classification"),
        (re.compile(r"\b(?:attorney[- ]client\s+privilege|legal\s+privilege)\b", re.I), 0.88, "Legal privilege marking"),
        (re.compile(r"\b(?:CONFIDENTIAL|DO NOT DISTRIBUTE|FOR INTERNAL USE ONLY)\b", re.I), 0.80, "Confidentiality marking"),
        (re.compile(r"\b(?:this\s+document\s+is\s+)?(?:privileged|confidential)\b", re.I), 0.75, "Confidentiality reference"),
        (re.compile(r"\b(?:do\s+not\s+share|do\s+not\s+distribute|do\s+not\s+forward)\b.*\b(?:external|outside|public)\b", re.I | re.S), 0.80, "Distribution restriction"),
        (re.compile(r"\b(?:material\s+non[- ]public\s+information|MNPI)\b", re.I), 0.90, "SEC Rule 10b-5 — MNPI"),
        (re.compile(r"\b(?:insider\s+trading|tipping)\b", re.I), 0.85, "SEC — Insider trading reference"),
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
            ("rbi", self.RBI_PATTERNS),
            ("confidentiality", self.CONFIDENTIALITY_PATTERNS),
        ]

        for group_name, patterns in pattern_groups:
            for pattern, confidence, reference in patterns:
                for match in pattern.finditer(text):
                    ctx_start = max(0, match.start() - 60)
                    ctx_end = min(len(text), match.end() + 60)
                    spans.append(DetectedSpan(
                        start=match.start(),
                        end=match.end(),
                        category=DetectionCategory.REGULATORY,
                        confidence=confidence,
                        matched_text=match.group()[:80],
                        detector=f"regulatory_{group_name}",
                        context=f"{reference} | {text[ctx_start:ctx_end]}",
                    ))

        duration_ms = (time.perf_counter() - start) * 1000
        max_conf = max((s.confidence for s in spans), default=0.0)

        return DetectionResult(
            detector_name="regulatory",
            spans=spans,
            risk_score=max_conf * 100 if spans else 0,
            processing_time_ms=round(duration_ms, 2),
        )
