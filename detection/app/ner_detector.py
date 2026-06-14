"""
Tier 2 — spaCy NER detector for PII detection.
Uses en_core_web_sm model for named entity recognition with context scoring.
"""

from __future__ import annotations

import re
import time
from typing import Any

from detection.app.chunker import smart_chunk_with_offsets
from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult

# ── Module-level compiled regexes ────────────────────────────────────────────
# Compiled once at import time. Previously these were inside detect() and
# were re-compiled on every single request — measurable hot-path overhead.
_CUSTOMER_TRIGGER_RE = re.compile(
    r'(?i)(customer|user|client|name|email|phone|address|ssn|dob|'
    r'account|aadhaar|pan\s*card|upi|mobile|passport|employee|project|org)'
)

# Custom regex patterns (label, category, confidence) used as backup entity
# detection — also previously re-compiled per call inside _detect_custom_patterns.
_CUSTOM_NER_PATTERNS: list[tuple[re.Pattern[str], str, DetectionCategory, float]] = [
    (re.compile(r"\bEMP-\d{6}\b"),                        "EMPLOYEE_ID",  DetectionCategory.PII,          0.85),
    (re.compile(r"\bPRJ-[A-Z]{2,4}-\d{4}\b"),             "PROJECT_CODE", DetectionCategory.CONFIDENTIAL, 0.80),
    (re.compile(r"\b\d{4}\s\d{4}\s\d{4}\b"),              "AADHAAR",      DetectionCategory.PII,          0.95),
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),               "PAN",          DetectionCategory.PII,          0.95),
    (re.compile(r"[\w.-]+@[a-zA-Z]+"),                    "UPI",          DetectionCategory.PII,          0.90),
    (re.compile(r"(\+91[\-\s]?)?\d{5}[\-\s]?\d{5}"),      "IN_PHONE",     DetectionCategory.PII,          0.85),

    # ── Extended patterns (recall improvement) ──────────────────────────────
    # Partial US phone numbers (7-digit local format: 555-0192, 555.0192)
    (re.compile(r"\b\d{3}[-.]?\d{4}\b"),                  "US_PHONE_7",   DetectionCategory.PII,          0.60),
    # Emails with unusual / modern TLDs
    (re.compile(
        r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?:io|ai|dev|tech|co|app|xyz|me)\b"
    ),                                                     "EMAIL_EXT_TLD", DetectionCategory.PII,         0.75),
    # Indirect name references ("sent to John's account", "forwarded to Sarah's email")
    (re.compile(
        r"(?i)\b(?:sent|forwarded|addressed|delivered|assigned|routed|given)\s+"
        r"(?:to|for)\s+(?:[\w']+(?:'s)?)\s+"
        r"(?:account|email|inbox|address|folder|profile|ticket|request)"
    ),                                                     "INDIRECT_NAME", DetectionCategory.PII,         0.65),
    # Numeric ID patterns: employee, patient, order, ticket IDs
    (re.compile(
        r"\b(?:EMP|PAT|ORD|TKT|USR|CST|REF|INV|WO)[-_]?\d{4,10}\b", re.IGNORECASE
    ),                                                     "GENERIC_ID",   DetectionCategory.PII,          0.80),
    # Obfuscated email addresses: j.smith[at]company[dot]com
    (re.compile(
        r"\b[\w.-]+\s*\[at\]\s*[\w.-]+\s*\[dot\]\s*[\w.-]+\b", re.IGNORECASE
    ),                                                     "OBFUSCATED_EMAIL", DetectionCategory.PII,      0.85),
]


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
        "AADHAAR": DetectionCategory.PII,
        "PAN": DetectionCategory.PII,
        "UPI": DetectionCategory.PII,
        "IN_PHONE": DetectionCategory.PII,
        "US_PHONE_7": DetectionCategory.PII,
        "EMAIL_EXT_TLD": DetectionCategory.PII,
        "INDIRECT_NAME": DetectionCategory.PII,
        "GENERIC_ID": DetectionCategory.PII,
        "OBFUSCATED_EMAIL": DetectionCategory.PII,
    }

    BASE_CONFIDENCE = {
        "PERSON": 0.70,
        "ORG": 0.40,
        "GPE": 0.35,
        "EMPLOYEE_ID": 0.80,
        "PROJECT_CODE": 0.75,
        "AADHAAR": 0.95,
        "PAN": 0.95,
        "UPI": 0.90,
        "IN_PHONE": 0.85,
        "US_PHONE_7": 0.60,
        "EMAIL_EXT_TLD": 0.75,
        "INDIRECT_NAME": 0.65,
        "GENERIC_ID": 0.80,
        "OBFUSCATED_EMAIL": 0.85,
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
            {"label": "AADHAAR", "pattern": [{"TEXT": {"REGEX": r"\b\d{4}\s\d{4}\s\d{4}\b"}}]},
            {"label": "PAN", "pattern": [{"TEXT": {"REGEX": r"\b[A-Z]{5}\d{4}[A-Z]\b"}}]},
            {"label": "UPI", "pattern": [{"TEXT": {"REGEX": r"[\w.-]+@[a-zA-Z]+"}}]},
            {"label": "IN_PHONE", "pattern": [{"TEXT": {"REGEX": r"(\+91[\-\s]?)?\d{5}[\-\s]?\d{5}"}}]},
            {"label": "US_PHONE_7", "pattern": [{"TEXT": {"REGEX": r"\b\d{3}[-.]?\d{4}\b"}}]},
            {"label": "EMAIL_EXT_TLD", "pattern": [{"TEXT": {"REGEX": r"\b[\w.-]+@[\w.-]+\.(?:io|ai|dev|tech|co|app|xyz|me)\b"}}]},
            {"label": "GENERIC_ID", "pattern": [{"TEXT": {"REGEX": r"\b(?:EMP|PAT|ORD|TKT|USR|CST|REF|INV|WO)[-_]?\d{4,10}\b"}}]},
            {"label": "OBFUSCATED_EMAIL", "pattern": [{"TEXT": {"REGEX": r"\b[\w.-]+\s*\[at\]\s*[\w.-]+\s*\[dot\]\s*[\w.-]+\b"}}]},
        ]

    def _load_model(self) -> None:
        """Load spaCy model. Tries transformer, falls back to small, then blank."""
        if self._load_failed:
            return
        try:
            import spacy
            try:
                self._nlp = spacy.load("en_core_web_trf")
            except OSError:
                try:
                    self._nlp = spacy.load("en_core_web_sm")
                except OSError:
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
            # Phase 3 Optimization: Fast regex gate. Only run heavy NER if PII keywords exist.
            # Pattern is compiled once at module load (see _CUSTOMER_TRIGGER_RE).
            if _CUSTOMER_TRIGGER_RE.search(text):
                try:
                    raw_spans = []
                    # Disable tagger/parser to save ~40% compute
                    with self._nlp.select_pipes(enable=["entity_ruler", "ner"]):
                        for offset, chunk in smart_chunk_with_offsets(text):
                            doc = self._nlp(chunk)

                            for ent in doc.ents:
                                if ent.label_ not in self.ENTITY_CATEGORIES:
                                    continue

                                category = self.ENTITY_CATEGORIES[ent.label_]
                                base_conf = self.BASE_CONFIDENCE.get(ent.label_, 0.5)

                                # Map entity offsets back to the global text
                                abs_start = ent.start_char + offset
                                abs_end = ent.end_char + offset

                                # Get context window (±50 chars) using the global text
                                ctx_start = max(0, abs_start - 50)
                                ctx_end = min(len(text), abs_end + 50)
                                context = text[ctx_start:ctx_end]

                                # Apply context scoring
                                multiplier = self._context_scorer.score(ent.label_, ent.text, context)
                                confidence = min(1.0, base_conf * multiplier)

                                # Skip low-confidence detections
                                if confidence < 0.3:
                                    continue

                                raw_spans.append(DetectedSpan(
                                    start=abs_start,
                                    end=abs_end,
                                    category=category,
                                    confidence=confidence,
                                    matched_text=ent.text,
                                    detector="spacy_ner",
                                    context=context,
                                ))

                    # Deduplicate spans from overlapping chunks
                    seen_ranges: set[tuple[int, int]] = set()
                    for span in raw_spans:
                        span_range = (span.start, span.end)
                        if span_range not in seen_ranges:
                            seen_ranges.add(span_range)
                            spans.append(span)

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
        """Run custom regex patterns as backup entity detection.

        Patterns are compiled once at module load (see _CUSTOM_NER_PATTERNS).
        """
        existing_ranges = {(s.start, s.end) for s in spans}

        for pattern, label, category, confidence in _CUSTOM_NER_PATTERNS:
            for match in pattern.finditer(text):
                if (match.start(), match.end()) in existing_ranges:
                    continue
                ctx_start = max(0, match.start() - 50)
                ctx_end = min(len(text), match.end() + 50)

                # For INDIRECT_NAME, extract just the person name from the match
                matched_text = match.group()
                if label == "INDIRECT_NAME":
                    name = self._extract_indirect_name(match.group())
                    if name:
                        matched_text = name
                    else:
                        continue  # skip if we can't extract a name

                spans.append(DetectedSpan(
                    start=match.start(),
                    end=match.end(),
                    category=category,
                    confidence=confidence,
                    matched_text=matched_text,
                    detector="spacy_ner_custom",
                    context=text[ctx_start:ctx_end],
                ))

    @staticmethod
    def _extract_indirect_name(phrase: str) -> str | None:
        """Extract person name from indirect reference phrase.

        e.g. "sent to John's account" → "John"
             "forwarded to Sarah's email" → "Sarah"
        """
        m = re.search(
            r"(?:sent|forwarded|addressed|delivered|assigned|routed|given)\s+"
            r"to\s+([\w']+?)(?:'s)?\s+"
            r"(?:account|email|inbox|address|folder|profile|ticket|request)",
            phrase, re.IGNORECASE,
        )
        if m:
            name = m.group(1).strip()
            # Skip common false positives (pronouns, articles)
            if name.lower() in {"the", "a", "an", "this", "that", "it", "my", "your", "his", "her", "their"}:
                return None
            return name
        return None

class DebertaNERDetector:
    """
    Tier 2 — DeBERTa-v3-small fine-tuned for PII/Secret NER.
    Replaces spaCy EntityRuler for higher accuracy.
    Requires data labeling to fine-tune; loads a fallback token classification
    pipeline or SpacyNERDetector if the local fine-tuned model isn't available.
    """

    def __init__(self, model_path: str = "microsoft/deberta-v3-small") -> None:
        self._model_path = model_path
        self._pipeline: Any = None
        self._loaded = False
        self._load_failed = False
        self._spacy_fallback = SpacyNERDetector()
        self._context_scorer = ContextScorer()

        self.ENTITY_MAPPING = {
            "LABEL_0": DetectionCategory.PII,  # Update these labels based on fine-tuned model
            "LABEL_1": DetectionCategory.CONFIDENTIAL,
            "B-PER": DetectionCategory.PII,
            "I-PER": DetectionCategory.PII,
            "B-ORG": DetectionCategory.CONFIDENTIAL,
            "I-ORG": DetectionCategory.CONFIDENTIAL,
        }

    def _load_model(self) -> None:
        if self._load_failed:
            return
        try:
            from transformers import pipeline
            # Load the fine-tuned model (or generic fallback)
            self._pipeline = pipeline(
                "token-classification", 
                model=self._model_path, 
                aggregation_strategy="simple"
            )
            self._loaded = True
        except Exception:
            self._load_failed = True
            self._pipeline = None

    def detect(self, text: str) -> DetectionResult:
        start = time.perf_counter()

        if not self._loaded and not self._load_failed:
            self._load_model()

        # If DeBERTa fails to load, fallback to spaCy
        if self._load_failed or self._pipeline is None:
            return self._spacy_fallback.detect(text)

        spans: list[DetectedSpan] = []
        try:
            # Phase 3 Optimization: Fast regex gate (module-level compiled pattern)
            if _CUSTOMER_TRIGGER_RE.search(text):
                # Run DeBERTa on chunks
                for offset, chunk in smart_chunk_with_offsets(text, max_chunk=512):
                    results = self._pipeline(chunk)
                    
                    for ent in results:
                        label = ent.get("entity_group", ent.get("entity", ""))
                        if label not in self.ENTITY_MAPPING:
                            continue
                            
                        category = self.ENTITY_MAPPING[label]
                        base_conf = ent.get("score", 0.5)
                        
                        abs_start = ent["start"] + offset
                        abs_end = ent["end"] + offset
                        
                        ctx_start = max(0, abs_start - 50)
                        ctx_end = min(len(text), abs_end + 50)
                        context = text[ctx_start:ctx_end]
                        
                        multiplier = self._context_scorer.score(label, ent["word"], context)
                        confidence = min(1.0, base_conf * multiplier)
                        
                        if confidence < 0.3:
                            continue
                            
                        spans.append(DetectedSpan(
                            start=abs_start,
                            end=abs_end,
                            category=category,
                            confidence=confidence,
                            matched_text=ent["word"],
                            detector="deberta_ner",
                            context=context,
                        ))

            # Deduplicate
            unique_spans = []
            seen_ranges = set()
            for span in spans:
                if (span.start, span.end) not in seen_ranges:
                    seen_ranges.add((span.start, span.end))
                    unique_spans.append(span)
            spans = unique_spans

        except Exception:
            # On runtime failure, fallback to spaCy
            return self._spacy_fallback.detect(text)

        duration_ms = (time.perf_counter() - start) * 1000
        max_confidence = max((s.confidence for s in spans), default=0.0)

        return DetectionResult(
            detector_name="deberta_ner",
            spans=spans,
            risk_score=max_confidence * 100 if spans else 0,
            processing_time_ms=round(duration_ms, 2),
        )
