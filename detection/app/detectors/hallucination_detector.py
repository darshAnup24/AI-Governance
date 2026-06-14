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

    # ─── Overconfidence Patterns ────────────────────────────────────────────
    OVERCONFIDENCE_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\b(?:it is (?:a |an )?(?:well-known |established |undeniable |indisputable )?fact that)\b", re.I), 0.85),
        (re.compile(r"\b(?:definitely|certainly|undoubtedly|unquestionably|without (?:a )?doubt)\b", re.I), 0.65),
        (re.compile(r"\b(?:has been (?:conclusively |definitively )?(?:proven|demonstrated|established))\b", re.I), 0.80),
        (re.compile(r"\b(?:everyone knows|it is universally accepted|all experts agree)\b", re.I), 0.90),
        (re.compile(r"\b(?:there is no (?:debate|question|doubt) (?:that|about))\b", re.I), 0.85),
        (re.compile(r"\b(?:the science is (?:clear|settled) on)\b", re.I), 0.75),
        (re.compile(r"\b(?:always|never) (?:results? in|leads? to|causes?)\b", re.I), 0.70),
        (re.compile(r"\b(?:this is (?:a |an )?(?:proven|established|undisputed|settled) fact)\b", re.I), 0.85),
        (re.compile(r"\b(?:without (?:a )?shadow of a doubt|indisputably|irrefutably)\b", re.I), 0.80),
        (re.compile(r"\b(?:it(?:'?s| is) (?:impossible|inconceivable|unthinkable) that)\b", re.I), 0.75),
    ]

    # ─── Fabricated Citation Patterns ───────────────────────────────────────
    FAKE_CITATION_PATTERNS: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        # Standard: Author Name (Year)
        (re.compile(r"\b[A-Z][a-z]+(?:\s(?:&|and)\s[A-Z][a-z]+)?\s+(?:et\s+al\.?\s*)?\(\d{4}\)", re.S), 0.75),
        # "According to the YYYY study by Author"
        (re.compile(r"(?:according to|citing)\s+(?:the\s+)?\d{4}\s+(?:study|paper|report)\s+by\s+\w+", re.I), 0.75),
        # "The YYYY [Org] report states that"
        (re.compile(r"the\s+\d{4}\s+\w+\s+(?:report|study|analysis|survey)\s+(?:states|shows|found|indicates|reveals|suggests|confirms)", re.I), 0.70),
        # "As published in [Journal] (YYYY)"
        (re.compile(r"as\s+published\s+in\s+\w[\w\s]*\(\d{4}\)", re.I), 0.75),
        # "A peer-reviewed paper by Author (Year)"
        (re.compile(r"a\s+peer[- ]reviewed\s+(?:paper|study|article)\s+by\s+\w[\w\s]*\(\d{4}\)", re.I), 0.80),
        # Standard citation patterns
        (re.compile(r"(?:according to|as (?:stated|reported|noted) (?:by|in))\s+(?:a |the )?(?:\d{4}\s+)?(?:study|report|research|paper|analysis)\b", re.I), 0.70),
        (re.compile(r"\bpublished in (?:the )?(?:Journal|Proceedings|Annals|Review|IEEE|Nature|Science|The Lancet|JAMA|arXiv)\b", re.I), 0.80),
        (re.compile(r"\b(?:DOI|doi):\s*10\.\d{4,}/[^\s]+", re.I), 0.60),
        # "Multiple studies including Author (Year)"
        (re.compile(r"multiple\s+studies\s+including\s+\w[\w\s]*(?:et\s+al\.?\s*)?\(\d{4}\)", re.I), 0.75),
        # "In the YYYY [Journal], Author found that"
        (re.compile(r"in\s+(?:the\s+)?\d{4}\s+\w+[\w\s]*,\s+\w+\s+(?:found|showed|demonstrated|concluded)", re.I), 0.70),
    ]

    # ─── Unattributed Statistics ────────────────────────────────────────────
    UNATTRIBUTED_STATS: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\b\d{1,3}(?:\.\d+)?%\s+(?:of\s+)?(?:people|users|companies|organizations|studies|experts)\b", re.I), 0.70),
        (re.compile(r"\b(?:approximately|roughly|about|nearly|over|more than)\s+\d+(?:,\d{3})*\s+(?:people|cases|instances)\b", re.I), 0.65),
        (re.compile(r"\b(?:studies|research) (?:show|indicate|suggest|demonstrate|prove|confirm) that \d+", re.I), 0.80),
        (re.compile(r"\b(?:a recent|a \d{4}) (?:study|survey|poll|report) (?:found|showed|revealed|indicated|concluded) that\b", re.I), 0.75),
        (re.compile(r"\b(?:achiev(?:es?|ed)|improv(?:es?|ed|ing))\s+by\s+\d{1,3}(?:\.\d+)?%", re.I), 0.65),
        (re.compile(r"\b(?:has|have)\s+\d{1,3}(?:\.\d+)?%\s+(?:higher|lower|better|worse|more|less|greater|fewer)\b", re.I), 0.65),
        (re.compile(r"\b(?:correlation(?:s)?\s+(?:is|are|was|were))\s+0?\.\d+", re.I), 0.70),
        (re.compile(r"\b(?:statistically significant|p[\s-]*value)\s*(?:[<>=≤≥])\s*0?\.\d+", re.I), 0.60),
    ]

    # ─── Temporal Confusion ─────────────────────────────────────────────────
    TEMPORAL_CONFUSION: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\b(?:as of|since|starting (?:from|in))\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20[2-3]\d\b", re.I), 0.55),
        (re.compile(r"\b(?:was|is)\s+(?:founded|established|created|launched)\s+in\s+\d{4}\b", re.I), 0.50),
        (re.compile(r"\bcurrently\s+(?:has|holds|maintains|operates)\b", re.I), 0.45),
        (re.compile(r"\b(?:as of today|as of now|as of \d{4})\b", re.I), 0.50),
        (re.compile(r"\b(?:up to|until|through)\s+\d{4}\b", re.I), 0.45),
    ]

    # ─── False Certainty About Future ───────────────────────────────────────
    FALSE_FUTURE: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\b(?:will (?:definitely|certainly|inevitably|undoubtedly))\b", re.I), 0.80),
        (re.compile(r"\b(?:is (?:guaranteed|certain|promised) to)\b", re.I), 0.85),
        (re.compile(r"\bby\s+20[2-3]\d[,\s]+(?:we will|it will|this will|they will)\b", re.I), 0.70),
        (re.compile(r"\b(?:predicted|forecasted|projected) to (?:increase|decrease|grow|shrink|reach|exceed) by \d{4}\b", re.I), 0.65),
        (re.compile(r"\b(?:will (?:certainly|inevitably|undoubtedly) (?:happen|occur|take place))\b", re.I), 0.80),
    ]

    # ─── Fabricated Model/Product Claims ────────────────────────────────────
    FABRICATED_CLAIMS: ClassVar[list[tuple[re.Pattern[str], float]]] = [
        (re.compile(r"\bthe\s+\w[\w\s-]*\s+(?:by|from)\s+\w[\w\s-]*\s+uses?\s+(?:patented|proprietary|revolutionary|groundbreaking)\s+\w+\s+technology\s+that\s+achieves?\b", re.I), 0.80),
        (re.compile(r"(?:based\s+on\s+)?(?:my\s+)?training\s+data\s+(?:up\s+to|until|cutoff|ending)\s+\d{4}", re.I), 0.75),
        (re.compile(r"\b(?:I analyzed|I have analyzed|I've analyzed|I examined|I've examined)\s+\d[\d,]*\s+(?:data points|samples|records|cases)\b", re.I), 0.70),
        (re.compile(r"\b(?:this\s+(?:algorithm|model|system|approach|method))\s+(?:can|will|does)\s+(?:predict|detect|identify|classify|solve)\s+\w+\s+(?:with|using|by)\s+\d{1,3}%\s+(?:accuracy|precision|recall|confidence)\b", re.I), 0.70),
        (re.compile(r"\b(?:exceeds?|outperform(?:s|ed|ing)?)\s+(?:human|all|every|any)\s+(?:performance|capability|ability|benchmark)\b", re.I), 0.75),
        (re.compile(r"\b(?:achieves?|reaches?)\s+(?:near[- ]perfect|perfect|100%|near[- ]human)\s+(?:accuracy|performance|recall|precision)\b", re.I), 0.75),
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
            ("fabricated_claims", self.FABRICATED_CLAIMS),
        ]

        for group_name, patterns in pattern_groups:
            for pattern, confidence in patterns:
                for match in pattern.finditer(text):
                    ctx_start = max(0, match.start() - 60)
                    ctx_end = min(len(text), match.end() + 60)
                    spans.append(DetectedSpan(
                        start=match.start(),
                        end=match.end(),
                        category=DetectionCategory.HALLUCINATION,
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
