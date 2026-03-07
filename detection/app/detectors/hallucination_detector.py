"""
Hallucination Detector — Detects hallucination risk patterns in AI outputs.
Identifies confident assertions without evidence, fabricated citations,
unattributed statistics, temporal confusion, and false certainty.
"""

from __future__ import annotations

import re
import time
from typing import ClassVar

from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult


class HallucinationDetector:
    """Detect hallucination risk patterns in AI-generated text."""

    # Confident assertions without evidence
    OVERCONFIDENCE_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\b(?:it is (?:a |an )?(?:well-known |established |undeniable |indisputable )?fact that)\b", re.I), 0.85),
        (re.compile(r"\b(?:definitely|certainly|undoubtedly|unquestionably|without (?:a )?doubt)\b", re.I), 0.65),
        (re.compile(r"\b(?:has been (?:conclusively |definitively )?(?:proven|demonstrated|established))\b", re.I), 0.80),
        (re.compile(r"\b(?:everyone knows|it is universally accepted|all experts agree)\b", re.I), 0.90),
        (re.compile(r"\b(?:there is no (?:debate|question|doubt) (?:that|about))\b", re.I), 0.85),
        (re.compile(r"\b(?:the science is (?:clear|settled) on)\b", re.I), 0.75),
        (re.compile(r"\b(?:always|never) (?:results? in|leads? to|causes?)\b", re.I), 0.70),
    ]

    # Fabricated citation patterns
    FAKE_CITATION_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\b[A-Z][a-z]+(?:\s(?:&|and)\s[A-Z][a-z]+)?\s+(?:et\s+al\.?\s*)?\(\d{4}\)", re.S), 0.75),
        (re.compile(r"(?:according to|as (?:stated|reported|noted) (?:by|in))\s+(?:a |the )?(?:\d{4}\s+)?(?:study|report|research|paper|analysis)\b", re.I), 0.70),
        (re.compile(r"\bpublished in (?:the )?(?:Journal|Proceedings|Annals|Review) of\b", re.I), 0.80),
        (re.compile(r"\b(?:DOI|doi):\s*10\.\d{4,}/[^\s]+", re.I), 0.60),
    ]

    # Unattributed specific statistics
    UNATTRIBUTED_STATS: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\b\d{1,3}(?:\.\d+)?%\s+(?:of\s+)?(?:people|users|companies|organizations|studies|experts)\b", re.I), 0.70),
        (re.compile(r"\b(?:approximately|roughly|about|nearly|over|more than)\s+\d+(?:,\d{3})*\s+(?:people|cases|instances)\b", re.I), 0.65),
        (re.compile(r"\b(?:studies|research) (?:show|indicate|suggest|demonstrate|prove) that \d+", re.I), 0.80),
        (re.compile(r"\b(?:a recent|a \d{4}) (?:study|survey|poll|report) (?:found|showed|revealed|indicated) that\b", re.I), 0.75),
    ]

    # Temporal confusion markers
    TEMPORAL_CONFUSION: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\b(?:as of|since|starting (?:from|in))\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20[2-3]\d\b", re.I), 0.55),
        (re.compile(r"\b(?:was|is)\s+(?:founded|established|created|launched)\s+in\s+\d{4}\b", re.I), 0.50),
        (re.compile(r"\bcurrently\s+(?:has|holds|maintains|operates)\b", re.I), 0.45),
    ]

    # False certainty about future
    FALSE_FUTURE: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\b(?:will (?:definitely|certainly|inevitably|undoubtedly))\b", re.I), 0.80),
        (re.compile(r"\b(?:is (?:guaranteed|certain) to)\b", re.I), 0.85),
        (re.compile(r"\bby\s+20[2-3]\d[,\s]+(?:we will|it will|this will|they will)\b", re.I), 0.70),
    ]

    def detect(self, text: str) -> DetectionResult:
        """Run all hallucination pattern checks against input text."""
        start = time.perf_counter()
        spans: list[DetectedSpan] = []

        pattern_groups = [
            ("overconfidence", self.OVERCONFIDENCE_PATTERNS),
            ("fake_citation", self.FAKE_CITATION_PATTERNS),
            ("unattributed_stats", self.UNATTRIBUTED_STATS),
            ("temporal_confusion", self.TEMPORAL_CONFUSION),
            ("false_future", self.FALSE_FUTURE),
        ]

        for group_name, patterns in pattern_groups:
            for pattern, confidence in patterns:
                for match in pattern.finditer(text):
                    ctx_start = max(0, match.start() - 60)
                    ctx_end = min(len(text), match.end() + 60)
                    spans.append(DetectedSpan(
                        start=match.start(),
                        end=match.end(),
                        category=DetectionCategory.CONFIDENTIAL,
                        confidence=confidence,
                        matched_text=match.group()[:80],
                        detector=f"hallucination_{group_name}",
                        context=text[ctx_start:ctx_end],
                    ))

        duration_ms = (time.perf_counter() - start) * 1000
        max_conf = max((s.confidence for s in spans), default=0.0)

        return DetectionResult(
            detector_name="hallucination",
            spans=spans,
            risk_score=max_conf * 100 if spans else 0,
            processing_time_ms=round(duration_ms, 2),
        )
