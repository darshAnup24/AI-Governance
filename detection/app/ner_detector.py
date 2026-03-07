"""
Tier 2 — spaCy NER detector for PII detection.
Uses en_core_web_sm model for named entity recognition with context scoring.
"""

from __future__ import annotations

import re
import time
from typing import Any

from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult


class ContextScorer:
    """Scores entity detections based on surrounding context for sensitivity."""

    SENSITIVE_CONTEXTS = {
        "medical": ["patient", "diagnosis", "treatment", "prescription", "medical", "hospital", "doctor", "health"],
        "financial": ["account", "balance", "payment", "salary", "income", "bank", "credit", "debit", "wire"],
        "legal": ["lawsuit", "attorney", "confidential", "privileged", "contract", "nda", "settlement"],
        "hr": ["employee", "performance", "termination", "hire", "fired", "review", "compensation"],
        "personal": ["dob", "date of birth", "born", "address", "phone", "ssn", "social security"],
    }

    def score(self, entity_type: str, entity_text: str, surrounding_text: str) -> float:
        """Return a confidence multiplier (0.5-2.0) based on sensitivity context."""
        text_lower = surrounding_text.lower()
        multiplier = 1.0

        # Check for sensitive context keywords
        for context_type, keywords in self.SENSITIVE_CONTEXTS.items():
            matches = sum(1 for kw in keywords if kw in text_lower)
            if matches > 0:
                multiplier += 0.2 * min(matches, 3)

        # Entity-specific adjustments
        if entity_type == "PERSON":
            person_indicators = ["mr.", "mrs.", "ms.", "dr.", "patient", "employee", "user"]
            if any(ind in text_lower for ind in person_indicators):
                multiplier += 0.3

        # PII combination detection: boost if multiple PII types nearby
        pii_signals = [
            bool(re.search(r"\d{3}-\d{2}-\d{4}", surrounding_text)),  # SSN-like
            bool(re.search(r"\b\d{2}/\d{2}/\d{4}\b", surrounding_text)),  # Date
            bool(re.search(r"\b[a-zA-Z0-9._%+-]+@", surrounding_text)),  # Email
        ]
        if sum(pii_signals) >= 2:
            multiplier += 0.5

        return max(0.5, min(2.0, multiplier))


class SpacyNERDetector:
    """
    Named entity recognition using spaCy for PII detection.
    Falls back to rule-based detection if spaCy model is unavailable.
    """

    ENTITY_CATEGORIES = {
        "PERSON": DetectionCategory.PII,
        "ORG": DetectionCategory.CONFIDENTIAL,
        "GPE": DetectionCategory.PII,
        "EMPLOYEE_ID": DetectionCategory.PII,
        "PROJECT_CODE": DetectionCategory.CONFIDENTIAL,
    }

    BASE_CONFIDENCE = {
        "PERSON": 0.70,
        "ORG": 0.40,
        "GPE": 0.35,
        "EMPLOYEE_ID": 0.80,
        "PROJECT_CODE": 0.75,
    }

    def __init__(self) -> None:
        self._nlp: Any = None
        self._context_scorer = ContextScorer()
        self._loaded = False
        self._load_failed = False

        # Custom patterns for entity ruler
        self._custom_patterns = [
            {"label": "EMPLOYEE_ID", "pattern": [{"TEXT": {"REGEX": r"^EMP-\d{6}$"}}]},
            {"label": "PROJECT_CODE", "pattern": [{"TEXT": {"REGEX": r"^PRJ-[A-Z]{2,4}-\d{4}$"}}]},
        ]

    def _load_model(self) -> None:
        """Load spaCy model. Falls back to small model if transformer unavailable."""
        if self._load_failed:
            return
        try:
            import spacy
            try:
                self._nlp = spacy.load("en_core_web_sm")
            except OSError:
                # Model not installed; use blank model with entity ruler
                self._nlp = spacy.blank("en")

            # Add entity ruler for custom patterns
            if self._nlp:
                ruler = self._nlp.add_pipe("entity_ruler", before="ner") if self._nlp.has_pipe("ner") else self._nlp.add_pipe("entity_ruler")
                ruler.add_patterns(self._custom_patterns)

            self._loaded = True
        except Exception:
            self._load_failed = True
            self._nlp = None

    def detect(self, text: str) -> DetectionResult:
        """Run NER on the input text and return detected PII entities."""
        start = time.perf_counter()

        if not self._loaded and not self._load_failed:
            self._load_model()

        spans: list[DetectedSpan] = []

        if self._nlp is not None:
            try:
                # Process text (limit length for performance)
                doc = self._nlp(text[:10000])

                for ent in doc.ents:
                    if ent.label_ not in self.ENTITY_CATEGORIES:
                        continue

                    category = self.ENTITY_CATEGORIES[ent.label_]
                    base_conf = self.BASE_CONFIDENCE.get(ent.label_, 0.5)

                    # Get context window (±50 chars)
                    ctx_start = max(0, ent.start_char - 50)
                    ctx_end = min(len(text), ent.end_char + 50)
                    context = text[ctx_start:ctx_end]

                    # Apply context scoring
                    multiplier = self._context_scorer.score(ent.label_, ent.text, context)
                    confidence = min(1.0, base_conf * multiplier)

                    # Skip low-confidence detections
                    if confidence < 0.3:
                        continue

                    spans.append(DetectedSpan(
                        start=ent.start_char,
                        end=ent.end_char,
                        category=category,
                        confidence=confidence,
                        matched_text=ent.text,
                        detector="spacy_ner",
                        context=context,
                    ))

            except Exception:
                pass  # NER failure shouldn't block the pipeline

        # Also run custom regex patterns (backup for when spaCy model is basic/blank)
        self._detect_custom_patterns(text, spans)

        duration_ms = (time.perf_counter() - start) * 1000
        max_confidence = max((s.confidence for s in spans), default=0.0)

        return DetectionResult(
            detector_name="spacy_ner",
            spans=spans,
            risk_score=max_confidence * 100 if spans else 0,
            processing_time_ms=round(duration_ms, 2),
        )

    def _detect_custom_patterns(self, text: str, spans: list[DetectedSpan]) -> None:
        """Run custom regex patterns as backup entity detection."""
        patterns = [
            (re.compile(r"\bEMP-\d{6}\b"), "EMPLOYEE_ID", DetectionCategory.PII, 0.85),
            (re.compile(r"\bPRJ-[A-Z]{2,4}-\d{4}\b"), "PROJECT_CODE", DetectionCategory.CONFIDENTIAL, 0.80),
        ]

        existing_ranges = {(s.start, s.end) for s in spans}

        for pattern, label, category, confidence in patterns:
            for match in pattern.finditer(text):
                if (match.start(), match.end()) in existing_ranges:
                    continue
                ctx_start = max(0, match.start() - 50)
                ctx_end = min(len(text), match.end() + 50)
                spans.append(DetectedSpan(
                    start=match.start(),
                    end=match.end(),
                    category=category,
                    confidence=confidence,
                    matched_text=match.group(),
                    detector="spacy_ner_custom",
                    context=text[ctx_start:ctx_end],
                ))
