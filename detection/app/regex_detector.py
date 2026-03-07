"""
Tier 1 — Regex-based detector for API keys, PII, and credentials.
High-precision patterns, target <5ms execution.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import ClassVar

from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult


@dataclass
class RegexPattern:
    """A compiled regex pattern with metadata."""
    name: str
    pattern: re.Pattern[str]
    category: DetectionCategory
    confidence: float
    validator: str | None = None  # Name of optional post-match validation function


class RegexDetector:
    """
    High-precision regex detector for structured sensitive data.
    Targets <5ms for typical enterprise prompts.
    """

    PATTERNS: ClassVar[list[RegexPattern]] = [
        # ─── API Keys ─────────────────────────────────────
        RegexPattern("openai_key", re.compile(r"sk-[a-zA-Z0-9]{20,}"), DetectionCategory.API_KEY, 0.98),
        RegexPattern("aws_access_key", re.compile(r"AKIA[0-9A-Z]{16}"), DetectionCategory.API_KEY, 0.97),
        RegexPattern("aws_secret_key", re.compile(r"(?:aws_secret_access_key|secret_key)\s*[:=]\s*[A-Za-z0-9/+=]{40}"), DetectionCategory.API_KEY, 0.95),
        RegexPattern("github_pat", re.compile(r"gh[pso]_[a-zA-Z0-9]{36}"), DetectionCategory.API_KEY, 0.98),
        RegexPattern("github_fine_grained", re.compile(r"github_pat_[a-zA-Z0-9_]{22,}"), DetectionCategory.API_KEY, 0.97),
        RegexPattern("jwt_token", re.compile(r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}"), DetectionCategory.API_KEY, 0.90),
        RegexPattern("slack_token", re.compile(r"xox[baprs]-[a-zA-Z0-9-]{10,}"), DetectionCategory.API_KEY, 0.95),
        RegexPattern("stripe_key", re.compile(r"[sr]k_(live|test)_[a-zA-Z0-9]{20,}"), DetectionCategory.API_KEY, 0.97),
        RegexPattern("google_api_key", re.compile(r"AIza[0-9A-Za-z\-_]{35}"), DetectionCategory.API_KEY, 0.95),

        # ─── Credentials / Connection Strings ─────────────
        RegexPattern("connection_string", re.compile(r"(?:postgresql|mysql|mongodb\+srv|redis|amqp)://[^\s\"']+"), DetectionCategory.CREDENTIALS, 0.95),
        RegexPattern("private_key_block", re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"), DetectionCategory.CREDENTIALS, 0.99),
        RegexPattern("password_assignment", re.compile(r"(?:password|passwd|pwd)\s*[:=]\s*[\"'][^\"']{8,}[\"']", re.IGNORECASE), DetectionCategory.CREDENTIALS, 0.85),

        # ─── PII: SSN ─────────────────────────────────────
        RegexPattern("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), DetectionCategory.PII, 0.80, "validate_ssn"),

        # ─── PII: Credit Cards ────────────────────────────
        RegexPattern("credit_card_visa", re.compile(r"\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), DetectionCategory.PII, 0.85, "validate_luhn"),
        RegexPattern("credit_card_mc", re.compile(r"\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), DetectionCategory.PII, 0.85, "validate_luhn"),
        RegexPattern("credit_card_amex", re.compile(r"\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b"), DetectionCategory.PII, 0.85, "validate_luhn"),

        # ─── PII: Email ───────────────────────────────────
        RegexPattern("email", re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b"), DetectionCategory.PII, 0.70, "validate_email_context"),

        # ─── PII: Phone Numbers ───────────────────────────
        RegexPattern("us_phone", re.compile(r"\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), DetectionCategory.PII, 0.65),

        # ─── High-Entropy Strings ─────────────────────────
        RegexPattern("high_entropy", re.compile(r"\b[a-zA-Z0-9+/=_-]{24,}\b"), DetectionCategory.API_KEY, 0.50, "validate_entropy"),
    ]

    # Context patterns that REDUCE false positives for emails
    CODE_CONTEXT_PATTERNS = re.compile(
        r"(?:import\s|from\s|require\(|#include|//|/\*|def\s|class\s|function\s|var\s|const\s|let\s)",
        re.IGNORECASE,
    )

    def detect(self, text: str) -> DetectionResult:
        """Run all regex patterns against the input text."""
        import time
        start = time.perf_counter()

        spans: list[DetectedSpan] = []

        for pat in self.PATTERNS:
            for match in pat.pattern.finditer(text):
                matched_text = match.group()
                confidence = pat.confidence

                # Run post-match validators
                if pat.validator:
                    validator_fn = getattr(self, pat.validator, None)
                    if validator_fn:
                        valid, adjusted_confidence = validator_fn(matched_text, text, match.start())
                        if not valid:
                            continue
                        confidence = adjusted_confidence

                # Get context (±40 chars)
                ctx_start = max(0, match.start() - 40)
                ctx_end = min(len(text), match.end() + 40)
                context = text[ctx_start:ctx_end]

                spans.append(DetectedSpan(
                    start=match.start(),
                    end=match.end(),
                    category=pat.category,
                    confidence=confidence,
                    matched_text=matched_text[:50] + "..." if len(matched_text) > 50 else matched_text,
                    detector="regex",
                    context=context,
                ))

        duration_ms = (time.perf_counter() - start) * 1000
        max_confidence = max((s.confidence for s in spans), default=0.0)

        return DetectionResult(
            detector_name="regex",
            spans=spans,
            risk_score=max_confidence * 100 if spans else 0,
            processing_time_ms=round(duration_ms, 2),
        )

    # ─── Validators ───────────────────────────────────────

    def validate_ssn(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Validate SSN: exclude dates and phone-like patterns."""
        digits = matched.replace("-", "")
        area = int(digits[:3])
        group = int(digits[3:5])
        serial = int(digits[5:])

        # SSN rules: area != 000, 666, 9xx; group != 00; serial != 0000
        if area in (0, 666) or area >= 900 or group == 0 or serial == 0:
            return False, 0

        # Check for date context (reduces false positives)
        ctx_start = max(0, pos - 30)
        context = text[ctx_start:pos + len(matched) + 30].lower()
        date_words = ["date", "born", "dob", "birthday", "expire", "issued"]
        if any(w in context for w in date_words):
            return True, 0.90  # Higher confidence with date context (likely real SSN)

        # Check for SSN-specific context
        ssn_words = ["ssn", "social security", "social sec", "ss#", "ss #"]
        if any(w in context for w in ssn_words):
            return True, 0.95

        return True, 0.75

    def validate_luhn(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Validate credit card using Luhn algorithm."""
        digits = [int(d) for d in matched if d.isdigit()]
        if len(digits) < 13:
            return False, 0

        checksum = 0
        for i, d in enumerate(reversed(digits)):
            if i % 2 == 1:
                d *= 2
                if d > 9:
                    d -= 9
            checksum += d

        if checksum % 10 != 0:
            return False, 0

        return True, 0.92

    def validate_email_context(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Reduce confidence for emails in code context."""
        ctx_start = max(0, pos - 80)
        ctx_end = min(len(text), pos + len(matched) + 80)
        context = text[ctx_start:ctx_end]

        # If email appears in code context, lower confidence
        if self.CODE_CONTEXT_PATTERNS.search(context):
            return True, 0.40  # Still detect, but low confidence

        # Common example domains
        example_domains = ["example.com", "test.com", "localhost", "company.com"]
        if any(matched.endswith(f"@{d}") for d in example_domains):
            return True, 0.30

        return True, 0.75

    def validate_entropy(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Validate high-entropy strings using Shannon entropy."""
        entropy = self._shannon_entropy(matched)
        if entropy < 4.5:
            return False, 0
        if len(matched) < 24:
            return False, 0

        # Common non-secret high-entropy strings
        if matched.startswith(("http", "data:", "base64")):
            return False, 0

        confidence = min(0.85, 0.5 + (entropy - 4.5) * 0.2)
        return True, confidence

    @staticmethod
    def _shannon_entropy(s: str) -> float:
        """Calculate Shannon entropy of a string."""
        if not s:
            return 0.0
        length = len(s)
        freq = Counter(s)
        return -sum((count / length) * math.log2(count / length) for count in freq.values())
