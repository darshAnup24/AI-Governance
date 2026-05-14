"""
Tier 1 — Regex-based detector for API keys, PII, and credentials.
High-precision patterns, target <5ms execution.
"""

from __future__ import annotations

import base64
import json
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
    span_group: int = 0  # re match group index for start/end (0 = full match)


# RFC 4648 base32 alphabet — AWS key body decodes as base32 (see TruffleHog GetAccountNumFromAWSID).
_AWS_KEY_ID_SUFFIX_CHARS = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")
_JWT_BLOB_RE = re.compile(r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}")


class RegexDetector:
    """
    High-precision regex detector for structured sensitive data.
    Targets <5ms for typical enterprise prompts.
    """

    PATTERNS: ClassVar[list[RegexPattern]] = [
        # ─── API Keys ─────────────────────────────────────
        RegexPattern("openai_key", re.compile(r"sk-[a-zA-Z0-9]{20,}"), DetectionCategory.API_KEY, 0.98),
        # IAM-style IDs: base32 body + keyword proximity + optional anchored assignment (high precision).
        RegexPattern(
            "aws_access_key",
            re.compile(r"\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b"),
            DetectionCategory.API_KEY,
            0.97,
            "validate_aws_access_key_id",
        ),
        RegexPattern("aws_secret_key", re.compile(r"(?:aws_secret_access_key|secret_key)\s*[:=]\s*[A-Za-z0-9/+=]{40}"), DetectionCategory.API_KEY, 0.95, "validate_aws_secret_assignment"),
        RegexPattern("github_pat", re.compile(r"gh[pso]_[a-zA-Z0-9]{36}"), DetectionCategory.API_KEY, 0.98),
        RegexPattern("github_fine_grained", re.compile(r"github_pat_[a-zA-Z0-9_]{22,}"), DetectionCategory.API_KEY, 0.97),
        RegexPattern(
            "jwt_token",
            _JWT_BLOB_RE,
            DetectionCategory.API_KEY,
            0.90,
            "validate_jwt_structure",
        ),
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

        # ─── PII: Indian Patterns (B5) ─────────────────────
        RegexPattern("aadhaar", re.compile(r"\b[2-9]{1}\d{3}[\s-]?\d{4}[\s-]?\d{4}\b"), DetectionCategory.PII, 0.85, "validate_aadhaar"),
        RegexPattern("pan_card", re.compile(r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b"), DetectionCategory.PII, 0.90, "validate_pan"),
        RegexPattern("gstin", re.compile(r"\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b"), DetectionCategory.REGULATORY, 0.95),
        RegexPattern("voter_id", re.compile(r"\b[A-Z]{3}[0-9]{7}\b"), DetectionCategory.PII, 0.80),
        RegexPattern("indian_passport", re.compile(r"\b[A-PR-WY][1-9]\d[\s-]?[0-9]{4}[1-9]\b", re.IGNORECASE), DetectionCategory.PII, 0.80),
        RegexPattern("driving_license", re.compile(r"\b[A-Z]{2}[0-9]{2}[\s-]?[0-9]{11}\b", re.IGNORECASE), DetectionCategory.PII, 0.85),
        RegexPattern("uan_epfo", re.compile(r"\b10\d{10}\b"), DetectionCategory.PII, 0.90),

        # ─── High-Entropy Strings ─────────────────────────
        RegexPattern("high_entropy", re.compile(r"\b[a-zA-Z0-9+/=_-]{24,}\b"), DetectionCategory.API_KEY, 0.50, "validate_entropy"),
    ]

    # Keyword proximity for secrets (chars each side of span). Slightly wider than ±10 so
    # typical assignments like AWS_ACCESS_KEY_ID=... still anchor without hurting latency.
    SECRET_KEYWORD_WINDOW = 40
    SECRET_KEYWORD_RE = re.compile(
        r"(?i)(?:api[\s_.-]*key|access[\s_.-]*key(?:[\s_.-]*id)?|accesskeyid|"
        r"secret(?:[\s_.-]*access)?(?:[\s_.-]*key)?|password|passwd|pwd|token|"
        r"jwt|id[\s_.-]*token|"
        r"auth|bearer|credential|aws|account|session[\s_.-]*token)",
    )

    PLACEHOLDER_HINT_RE = re.compile(
        r"(?i)(?:\b(?:dummy|fake|sample|placeholder|changeme)\b|"
        r"123456789|your[_-]?key|insert[_-]?here|lorem|ipsum|"
        r"AKIAIOSFODNN7EXAMPLE)",
    )

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
                gi = pat.span_group
                try:
                    matched_text = match.group(gi)
                except IndexError:
                    continue
                if not matched_text:
                    continue
                span_start = match.start(gi)
                span_end = match.end(gi)
                confidence = pat.confidence

                # Run post-match validators
                if pat.validator:
                    validator_fn = getattr(self, pat.validator, None)
                    if validator_fn:
                        valid, adjusted_confidence = validator_fn(matched_text, text, span_start)
                        if not valid:
                            continue
                        confidence = adjusted_confidence

                # Get context (±40 chars)
                ctx_start = max(0, span_start - 40)
                ctx_end = min(len(text), span_end + 40)
                context = text[ctx_start:ctx_end]

                spans.append(DetectedSpan(
                    start=span_start,
                    end=span_end,
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

    @staticmethod
    def _slice_window(text: str, pos: int, span_end: int, window: int) -> str:
        a = max(0, pos - window)
        b = min(len(text), span_end + window)
        return text[a:b]

    @staticmethod
    def _b64url_decode(segment: str) -> bytes | None:
        """Decode a JWT segment (base64url, no newline)."""
        s = segment.strip()
        pad = "=" * ((4 - len(s) % 4) % 4)
        try:
            return base64.urlsafe_b64decode(s + pad)
        except (ValueError, TypeError):
            return None

    def validate_aws_access_key_id(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """
        Structural gate for IAM-style access key IDs: suffix must be valid base32
        (same construction AWS uses; see TruffleHog GetAccountNumFromAWSID / base32 body).
        Requires credential-related keywords within SECRET_KEYWORD_WINDOW chars.
        """
        raw = matched.strip()
        if len(raw) != 20:
            return False, 0
        prefix = raw[:4]
        if prefix not in ("AKIA", "ASIA", "ABIA", "ACCA"):
            return False, 0
        suffix = raw[4:]
        if any(c not in _AWS_KEY_ID_SUFFIX_CHARS for c in suffix):
            return False, 0
        try:
            decoded = base64.b32decode(suffix)
        except Exception:
            return False, 0
        if len(decoded) < 6:
            return False, 0
        if self.PLACEHOLDER_HINT_RE.search(raw):
            return False, 0
        span_end = pos + len(raw)
        win = self._slice_window(text, pos, span_end, self.SECRET_KEYWORD_WINDOW)
        if self.PLACEHOLDER_HINT_RE.search(win):
            return False, 0
        if not self.SECRET_KEYWORD_RE.search(win):
            return False, 0
        return True, 0.97

    def validate_aws_secret_assignment(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Drop 40-char hex blobs that match AWS secret shape but are usually git SHAs."""
        m = re.search(r"[:=]\s*([A-Za-z0-9/+=]{40})", matched)
        if not m:
            return True, 0.95
        secret = m.group(1)
        if re.fullmatch(r"[0-9a-fA-F]{40}", secret):
            return False, 0
        if self.PLACEHOLDER_HINT_RE.search(matched) or self.PLACEHOLDER_HINT_RE.search(
            self._slice_window(text, pos, pos + len(matched), self.SECRET_KEYWORD_WINDOW),
        ):
            return False, 0
        return True, 0.95

    def validate_jwt_structure(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Require a decodable header object with alg (reduces random dotted base64 strings)."""
        parts = matched.split(".")
        if len(parts) != 3:
            return False, 0
        if not parts[0].startswith("eyJ"):
            return False, 0
        header_raw = self._b64url_decode(parts[0])
        if not header_raw:
            return False, 0
        try:
            header = json.loads(header_raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, TypeError):
            return False, 0
        if not isinstance(header, dict) or "alg" not in header:
            return False, 0
        if self.PLACEHOLDER_HINT_RE.search(matched):
            return False, 0
        win = self._slice_window(text, pos, pos + len(matched), self.SECRET_KEYWORD_WINDOW)
        if self.PLACEHOLDER_HINT_RE.search(win):
            return False, 0
        if not self.SECRET_KEYWORD_RE.search(win):
            return False, 0
        return True, 0.92

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

        if self.CODE_CONTEXT_PATTERNS.search(context):
            return True, 0.40

        example_domains = ["example.com", "test.com", "localhost", "company.com"]
        if any(matched.endswith(f"@{d}") for d in example_domains):
            return True, 0.30

        return True, 0.75

    def validate_aadhaar(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Validate Aadhaar with context heuristics."""
        ctx_start = max(0, pos - 30)
        context = text[ctx_start:pos + len(matched) + 30].lower()
        if any(w in context for w in ["aadhaar", "uidai", "aadhar", "vid"]):
            return True, 0.95
        return True, 0.80

    def validate_pan(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Validate PAN context and structure."""
        # 4th character describes status (P=Person, C=Company, etc.)
        status_char = matched[3].upper()
        if status_char not in ['P', 'C', 'H', 'A', 'B', 'G', 'J', 'L', 'F', 'T']:
            return False, 0
        ctx_start = max(0, pos - 30)
        context = text[ctx_start:pos + len(matched) + 30].lower()
        if any(w in context for w in ["pan", "income tax", "pancard"]):
            return True, 0.95
        return True, 0.85

    def validate_entropy(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Validate high-entropy strings using Shannon entropy."""
        if self.PLACEHOLDER_HINT_RE.search(matched):
            return False, 0
        span_end = pos + len(matched)
        if self.PLACEHOLDER_HINT_RE.search(self._slice_window(text, pos, span_end, 48)):
            return False, 0

        # Do not double-count JWT segments as generic high-entropy blobs.
        lo = max(0, pos - 80)
        hi = min(len(text), span_end + 400)
        chunk = text[lo:hi]
        for jm in _JWT_BLOB_RE.finditer(chunk):
            j_abs_start = lo + jm.start()
            j_abs_end = lo + jm.end()
            if j_abs_start <= pos and j_abs_end >= span_end:
                return False, 0

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
