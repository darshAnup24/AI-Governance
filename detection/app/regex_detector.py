"""
Tier 1 — Regex-based detector for API keys, PII, and credentials.
High-precision patterns, target <5ms execution.
"""

from __future__ import annotations

import base64
import json
import math
import re
import time
from collections import Counter
from dataclasses import dataclass
from typing import Any, ClassVar

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
        RegexPattern("openai_key", re.compile(r"sk-[a-zA-Z0-9]{20,}"), DetectionCategory.API_KEY, 0.98, "validate_entropy"),
        # IAM-style IDs: base32 body + keyword proximity + optional anchored assignment (high precision).
        RegexPattern(
            "aws_access_key",
            re.compile(r"\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b"),
            DetectionCategory.API_KEY,
            0.97,
            "validate_aws_access_key_id",
        ),
        RegexPattern("aws_secret_key", re.compile(r"(?:aws_secret_access_key|secret_key)\s*[:=]\s*[A-Za-z0-9/+=]{40}"), DetectionCategory.API_KEY, 0.95, "validate_aws_secret_assignment"),
        RegexPattern("github_pat", re.compile(r"gh[pso]_[a-zA-Z0-9]{36}"), DetectionCategory.API_KEY, 0.98, "validate_github_token"),
        RegexPattern("github_fine_grained", re.compile(r"github_pat_[a-zA-Z0-9_]{22,}"), DetectionCategory.API_KEY, 0.97, "validate_github_token"),
        RegexPattern(
            "jwt_token",
            _JWT_BLOB_RE,
            DetectionCategory.API_KEY,
            0.90,
            "validate_jwt_structure",
        ),
        RegexPattern("slack_token", re.compile(r"xox[baprs]-[a-zA-Z0-9-]{10,}"), DetectionCategory.API_KEY, 0.95, "validate_entropy"),
        RegexPattern("stripe_key", re.compile(r"[sr]k_(live|test)_[a-zA-Z0-9]{20,}"), DetectionCategory.API_KEY, 0.97, None),
        RegexPattern("google_api_key", re.compile(r"AIza[0-9A-Za-z\-_]{35}"), DetectionCategory.API_KEY, 0.95, "validate_entropy"),

        # ─── Credentials / Connection Strings ─────────────
        RegexPattern("connection_string", re.compile(r"(?:postgresql|mysql|mongodb\+srv|redis|amqp)://[^\s\"']+"), DetectionCategory.CREDENTIALS, 0.95),
        RegexPattern("private_key_block", re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"), DetectionCategory.CREDENTIALS, 0.99),
        RegexPattern("password_assignment", re.compile(r"(?:\")?(?:password|passwd|pwd)(?:\")?\s*[:=]\s*[\"'][^\"']{8,}[\"']", re.IGNORECASE), DetectionCategory.CREDENTIALS, 0.85, "validate_password_assignment"),

        # ─── PII: SSN ─────────────────────────────────────
        RegexPattern("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), DetectionCategory.PII, 0.80, "validate_ssn"),
        # Spaced / loosely-formatted SSN — requires keyword context to limit FPs
        RegexPattern("ssn_spaced", re.compile(
            r"(?i)(?:social\s+security|\bssn\b|ss#|ss\s+#)\s*[:# ]*(?:\d\s*){3}[-\s]+(?:\d\s*){2}[-\s]+(?:\d\s*){4}"
        ), DetectionCategory.PII, 0.82),

        # ─── PII: Credit Cards ────────────────────────────
        RegexPattern("credit_card_visa", re.compile(r"\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), DetectionCategory.PII, 0.85, "validate_luhn"),
        RegexPattern("credit_card_mc", re.compile(r"\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), DetectionCategory.PII, 0.85, "validate_luhn"),
        RegexPattern("credit_card_amex", re.compile(r"\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b"), DetectionCategory.PII, 0.85, "validate_luhn"),

        # ─── PII: Email ───────────────────────────────────
        RegexPattern("email", re.compile(r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b"), DetectionCategory.PII, 0.50, "validate_email_context"),

        # ─── PII: Phone Numbers ───────────────────────────
        RegexPattern("us_phone", re.compile(r"\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), DetectionCategory.PII, 0.65, "validate_us_phone"),

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

        # ─── Security Vulnerabilities ────────────────────
        # Pattern 1: SQL injection payloads
        RegexPattern(
            "sql_injection",
            re.compile(
                r"(?i)(?:"
                r"'\s*(?:OR|AND)\s*'[^']{0,30}'\s*=\s*'[^']{0,30}'|"  # tautology
                r"'\s*(?:OR|AND)\s*\d+\s*=\s*\d+|"  # numeric tautology
                r"\bUNION\s+(?:ALL\s+)?SELECT\b|"  # UNION SELECT
                r"\b(?:DROP|TRUNCATE)\s+TABLE\b|"  # destructive DDL
                r"';\s*(?:DROP|INSERT|UPDATE|DELETE|CREATE|ALTER)\b|"  # stacked queries
                r"\bEXEC(?:UTE)?\s*(?:SP|XP)_"  # stored proc execution
                r")"
            ),
            DetectionCategory.SECURITY_VULN,
            0.92,
        ),
        # Pattern 2: XSS (cross-site scripting) payloads
        RegexPattern(
            "xss_payload",
            re.compile(
                r"(?i)(?:"
                r"<\s*script[\s>]|</\s*script\s*>|"  # script tags
                r"javascript\s*:\s*(?:alert|eval|void|location|document)|"  # JS URI
                r"on(?:load|error|click|mouseover|focus|blur|submit|change|input)\s*="  # event handlers
                r"\s*[\"']?(?:alert|eval|document|location|this|window)|"  # handler body
                r"<\s*img[^>]{0,80}onerror\s*="  # img onerror
                r")"
            ),
            DetectionCategory.SECURITY_VULN,
            0.93,
        ),
        # Pattern 3: path traversal
        RegexPattern(
            "path_traversal",
            re.compile(
                r"(?:\.\.[/\\]){2,}|"  # ../../ (two or more)
                r"(?:\.\. %2[Ff]){2,}|"  # URL-encoded ../
                r"/etc/(?:passwd|shadow|hosts|sudoers|crontab|ssh)|"  # Linux sensitive
                r"(?:C:|%SystemRoot%)[/\\](?:Windows|System32)[/\\]|"  # Windows paths
                r"/proc/self/(?:environ|cmdline|mem)"  # proc filesystem
            ),
            DetectionCategory.SECURITY_VULN,
            0.90,
        ),
        # Pattern 4: command injection
        RegexPattern(
            "command_injection",
            re.compile(
                r"(?i)(?:"
                r"(?:\b|;|&&|\|\||\|)\s*rm\s+-(?:rf?|fr?)\s+|"  # rm -rf
                r"(?:&&|\|\||\|)\s*(?:curl|wget|nc|bash|sh|python3?|perl|ruby)\s+(?:https?://|-|/)|"  # pipe to shell tool
                r"\$\([^)]{3,60}\)|"  # command substitution $(...)
                r"`[^`]{5,60}`|"  # backtick execution
                r";\s*cat\s+/(?:etc|proc|var)/|"  # cat sensitive dirs
                r">[^>\s]{0,10}/dev/(?:tcp|udp)/[^/\s]+/\d+"  # bash tcp redirect
                r")"
            ),
            DetectionCategory.SECURITY_VULN,
            0.91,
        ),

        # ─── Regulatory / Confidentiality ─────────────────
        # Pattern 1: explicit confidentiality classification marking
        # Covers: "STRICTLY CONFIDENTIAL", "CONFIDENTIAL — do not share", etc.
        RegexPattern(
            "confidentiality_marking",
            re.compile(
                r"(?:strictly\s+|highly\s+)confidential|"
                r"confidential"
                r"\s*[-–—:]\s*(?:do\s+not\s+(?:share|distribute|forward|disclose|circulate)|"
                r"for\s+(?:internal|authorized|recipient)\s+(?:use\s+)?only)",
                re.IGNORECASE,
            ),
            DetectionCategory.REGULATORY,
            0.88,
        ),
        # Pattern 2: explicit do-not-share/distribute instructions
        RegexPattern(
            "do_not_share",
            re.compile(
                r"(?i)\bdo\s+not\s+(?:share|distribute|forward|disclose|circulate|discuss)\b"
            ),
            DetectionCategory.REGULATORY,
            0.85,
            "validate_do_not_share",
        ),
        # Pattern 3: M&A acquisition with monetary amount
        # Covers: "acquiring Nexus AI for $180M", "acquisition of X for $1.2B"
        RegexPattern(
            "ma_with_amount",
            re.compile(
                r"(?i)(?:acquiring|acquisition\s+of|merger\s+with|takeover\s+of|buying)\s+"
                r"[A-Za-z][A-Za-z0-9\s]{1,40}"
                r"for\s+\$[\d,]+(?:\.\d+)?\s*[MBKmb](?:illion|illion)?\b"
            ),
            DetectionCategory.REGULATORY,
            0.93,
        ),
        # Pattern 4: board considering / approving M&A action
        RegexPattern(
            "board_ma_decision",
            re.compile(
                r"(?i)\bboard\s+(?:of\s+directors\s+)?(?:is\s+|are\s+|has\s+been\s+)?"
                r"(?:considering|approving|deliberating|reviewing)\s+"
                r"(?:an?\s+)?(?:acquiring|acquisition|merger|takeover|buyout|purchase)"
            ),
            DetectionCategory.REGULATORY,
            0.90,
        ),
        # Pattern 5: non-public / insider information declarations
        RegexPattern(
            "nonpublic_information",
            re.compile(
                r"(?i)(?:material\s+)?non[- ]public\s+information|"
                r"\binsider\s+(?:information|trading|knowledge)\b|"
                r"\bmnpi\b"
            ),
            DetectionCategory.REGULATORY,
            0.95,
        ),
        # Pattern 6: revenue / earnings figure with dollar + multiplier
        # Covers: "revenue was $47.3M", "Q3 earnings of $1.2B"
        RegexPattern(
            "financial_figure",
            re.compile(
                r"(?i)(?:revenue|earnings|profit|loss|sales)\s+"
                r"(?:was|were|of|is|are|totaled?|reached?)\s+"
                r"\$[\d,]+(?:\.\d+)?\s*[MBK](?:illion)?\b"
            ),
            DetectionCategory.REGULATORY,
            0.82,
            "validate_financial_figure",
        ),
        # Pattern 7: instruction to conceal material facts in communications
        # Covers: "write a press release that doesn't mention the acquisition"
        RegexPattern(
            "conceal_material_fact",
            re.compile(
                r"(?i)(?:write|draft|create|prepare)\s+(?:\w+\s+){0,4}"
                r"(?:press\s+release|announcement|statement|communication|report)"
                r"\s+(?:\w+\s+){0,6}"
                r"(?:don'?t|doesn'?t|without|that\s+(?:omits?|hides?|conceals?|avoids?|skips?|excludes?|doesn'?t\s+mention))"
                r"\s+(?:\w+\s+){0,3}"
                r"(?:acquisition|merger|revenue|earnings|loss|profit|deal|takeover)"
            ),
            DetectionCategory.REGULATORY,
            0.91,
        ),
        RegexPattern(
            "customer_data_exfiltration",
            re.compile(
                r"(?is)\b(?:send|share|upload|export|forward|paste)\b"
                r"(?:\s+\w+){0,6}\s+\b(?:customer|client|user|personal)\s+"
                r"(?:data|record|records|information|details)\b"
                r"(?:\s+\w+){0,6}\s+\b(?:to|with|into)\b"
                r"(?:\s+\w+){0,3}\s+\b(?:openai|chatgpt|claude|anthropic|gemini)\b"
            ),
            DetectionCategory.REGULATORY,
            0.93,
        ),

        # ─── Prompt Injection ─────────────────────────────
        # Pattern 1: command verb targeting safety / system / instruction objects
        # Covers: "Forget your safety guidelines", "Ignore all system instructions",
        #         "Bypass the content safety filter", "disregard previous rules", etc.
        RegexPattern(
            "prompt_injection_command",
            re.compile(
                r"(?i)(?:forget|ignore|disregard|override|bypass)\s+"
                r"(?:your|all|the|previous|above|any|my)?\s*"
                r"(?:\w+\s+){0,2}"
                r"(?:safety\s+(?:guidelines?|rules?|constraints?|policies?|filter|protocols?)"
                r"|system\s+(?:instructions?|prompts?|messages?|rules?)"
                r"|instructions?|guidelines?|rules?|policies|constraints?)"
            ),
            DetectionCategory.PROMPT_INJECTION,
            0.90,
        ),
        # Pattern 2: reveal + confidential / hidden / configuration target
        # Covers: "reveal confidential instructions", "reveal hidden configuration data"
        RegexPattern(
            "prompt_injection_reveal",
            re.compile(
                r"(?i)reveal\s+(?:\w+\s+){0,3}(?:confidential|hidden|system|configuration|instructions?|data|directives?)"
            ),
            DetectionCategory.PROMPT_INJECTION,
            0.88,
        ),
        # Pattern 3: high-signal jailbreak vocabulary
        RegexPattern(
            "prompt_injection_jailbreak",
            re.compile(
                r"(?i)(?:jailbreak|DAN\b|do\s+anything\s+now|"
                r"pretend\s+(?:you\s+have\s+no|there\s+are\s+no)\s+(?:restrictions?|guidelines?|rules?|limits?)|"
                r"you\s+are\s+now\s+(?:DAN|free\s+from|unfiltered|uncensored)|"
                r"act\s+as\s+(?:if\s+you\s+(?:have\s+no|are\s+not)|an?\s+uncensored))"
            ),
            DetectionCategory.PROMPT_INJECTION,
            0.95,
        ),
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

    # Priority 3: Expanded placeholder / whitelist patterns
    # Covers: classic test values, documentation markers, masked placeholders,
    # environment-variable placeholders, common CI/CD dummy secrets.
    PLACEHOLDER_HINT_RE = re.compile(
        r"(?i)(?:"
        # Classic dummy markers
        r"\b(?:dummy|fake|sample|placeholder|changeme|example|mock|test|demo)\b|"
        # Numeric / well-known example values
        r"123456789|000000000|"
        # Template placeholders (angle-bracket and bracket styles)
        r"your[_-]?(?:key|secret|token|password|api[_-]?key)|insert[_-]?here|"
        r"<[A-Z_]{3,}>|\[YOUR[_A-Z]+\]|\{\{[A-Z_]+\}\}|"
        # AWS canonical example key (TruffleHog test fixture)
        r"AKIAIOSFODNN7EXAMPLE|"
        # lorem / ipsum in test docs
        r"lorem|ipsum|"
        # Common CI placeholder patterns
        r"\$\{?[A-Z_]{4,}\}?|%[A-Z_]{4,}%|"
        # Masked / redacted patterns  (e.g. sk-****...  or  ****-1234-5678)
        r"(?:\*{3,}|x{4,}|X{4,})|"
        # Common password123 / password1 / Test1234 dummy passwords
        r"password\d{1,4}|secret\d{1,4}|test\d{1,4}|"
        # Documentation-style labels
        r"not.?real|for.?testing|do.?not.?use"
        r")",
    )

    # Educational context: reduces confidence (not drop) when secrets appear inside
    # documentation / tutorial phrasing WITHOUT a strong adversarial escalation signal.
    # Used in detect() to halve confidence instead of silently dropping the span.
    EDUCATIONAL_CONTEXT_RE = re.compile(
        r"(?i)(?:"
        r"(?:this\s+is|just\s+a)\s+(?:fictional|hypothetical|educational|tutorial|example|test|demo)|"
        r"i(?:'m|\s+am)\s+writing\s+a\s+(?:book|story|tutorial|guide|blog)|"
        r"in\s+a\s+(?:story|novel|game|scenario|simulation)|"
        r"for\s+(?:educational|research|academic|testing)\s+purposes|"
        r"(?:never|don'?t)\s+(?:share|commit|use)\s+(?:your\s+)?(?:secrets?|passwords?|keys?|tokens?)"
        r")"
    )

    # Strong adversarial escalation — overrides educational context
    ADVERSARIAL_ESCALATION_RE = re.compile(
        r"(?i)(?:"
        r"(?:forget|ignore|disregard)\s+(?:your|all|the|previous|above)?\s*(?:\w+\s+){0,2}(?:safety|guidelines?|rules?|instructions?|system\s+(?:instructions?|prompts?))|"        
        r"reveal\s+(?:\w+\s+){0,3}(?:confidential|hidden|configuration|system)|"
        r"ignore\s+(?:previous|above|all)\s+(?:instructions?|rules?|prompts?)|jailbreak|"
        r"bypass\s+(?:content|safety|filter)|override\s+(?:safety|policy)|"
        r"you\s+(?:must|have\s+to)\s+(?:comply|answer|reveal)"
        r")"
    )

    # Context patterns that REDUCE false positives for emails
    CODE_CONTEXT_PATTERNS = re.compile(
        r"(?:import\s|from\s|require\(|#include|//|/\*|def\s|class\s|function\s|var\s|const\s|let\s)",
        re.IGNORECASE,
    )

    def __init__(self) -> None:
        # Pre-resolve validator callables once at construction time.
        # Avoids getattr() + MRO traversal on every single regex match in detect().
        self._validators: dict[str, Any] = {
            pat.validator: getattr(self, pat.validator)
            for pat in self.PATTERNS
            if pat.validator and hasattr(self, pat.validator)
        }

    def detect(self, text: str) -> DetectionResult:
        """Run all regex patterns against the input text."""
        start = time.perf_counter()

        spans: list[DetectedSpan] = []
        text_len = len(text)

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

                # Run post-match validators via pre-resolved callable (O(1) dict lookup)
                if pat.validator:
                    validator_fn = self._validators.get(pat.validator)
                    if validator_fn:
                        valid, adjusted_confidence = validator_fn(matched_text, text, span_start)
                        if not valid:
                            continue
                        confidence = adjusted_confidence

                # Get context (±40 chars)
                ctx_start = max(0, span_start - 40)
                ctx_end = min(text_len, span_end + 40)
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

        # Educational-context penalty: only pay the regex cost when spans actually exist.
        # Safe inputs (spans=[]) no longer waste 2 full-text regex passes.
        if spans:
            is_educational = bool(self.EDUCATIONAL_CONTEXT_RE.search(text))
            is_adversarial = bool(self.ADVERSARIAL_ESCALATION_RE.search(text))
            if is_educational and not is_adversarial:
                for span in spans:
                    span.confidence = round(span.confidence * 0.5, 4)

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

    def validate_github_token(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Validate GitHub tokens: reject placeholder values; accept structurally valid tokens."""
        if self.PLACEHOLDER_HINT_RE.search(matched):
            return False, 0
        span_end = pos + len(matched)
        if self.PLACEHOLDER_HINT_RE.search(self._slice_window(text, pos, span_end, self.SECRET_KEYWORD_WINDOW)):
            return False, 0
        return True, 0.98

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

    def validate_do_not_share(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Only flag 'do not share' when combined with sensitive data indicators."""
        ctx = self._slice_window(text, pos, pos + len(matched), 60).lower()
        sensitive_indicators = ["confidential", "classified", "restricted", "internal only",
                                "proprietary", "trade secret", "sensitive", "private",
                                "embargo", "non-public", "personally identifiable", "pii"]
        if any(ind in ctx for ind in sensitive_indicators):
            return True, 0.90
        return True, 0.40

    def validate_financial_figure(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Only flag financial figures with confidentiality context nearby."""
        ctx = self._slice_window(text, pos, pos + len(matched), 60).lower()
        sensitivity_markers = ["confidential", "embargo", "non-public", "non public",
                               "do not share", "insider", "material", "mnpi", "restricted"]
        if any(mk in ctx for mk in sensitivity_markers):
            return True, 0.90
        return True, 0.30

    def validate_us_phone(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Only flag phone numbers with phone-related keyword context."""
        ctx = self._slice_window(text, pos, pos + len(matched), 40).lower()
        phone_keywords = ["phone", "call", "tel", "mobile", "cell", "fax", "contact"]
        if any(kw in ctx for kw in phone_keywords):
            return True, 0.85
        last_line = text[:pos].split('\n')[-1] if pos > 0 else ""
        if re.search(r"[|]\s*$", last_line):
            return True, 0.30
        return True, 0.50

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

        sensitive_domains = ["protonmail.com", "tutanota.com", "guerrillamail.com",
                             "tempmail.com", "mailinator.com", "yopmail.com"]
        if any(matched.endswith(f"@{d}") for d in sensitive_domains):
            return True, 0.70

        return True, 0.45

    def validate_aadhaar(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """Validate Aadhaar with context heuristics."""
        ctx_start = max(0, pos - 30)
        context = text[ctx_start:pos + len(matched) + 30].lower()
        if any(w in context for w in ["aadhaar", "uidai", "aadhar", "vid"]):
            return True, 0.95
        return True, 0.50

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
        if len(matched) < 32:
            return False, 0

        # Common non-secret high-entropy strings
        if matched.startswith(("http", "data:", "base64")):
            return False, 0

        confidence = min(0.85, 0.5 + (entropy - 4.5) * 0.2)
        return True, confidence

    def validate_password_assignment(self, matched: str, text: str, pos: int) -> tuple[bool, float]:
        """
        Check entropy on the *value* portion only (after the := delimiter and opening quote).
        The keyword 'password' in the full match dilutes entropy below the generic 4.5 threshold,
        causing false negatives for legitimate credentials.  We use a lower floor (3.5) on
        the isolated value, which still rejects dictionary words while passing real secrets.
        """
        m = re.search(r'[:=]\s*["\']([^"\']{8,})["\']', matched)
        value = m.group(1) if m else matched
        if self.PLACEHOLDER_HINT_RE.search(value):
            return False, 0
        span_end = pos + len(matched)
        if self.PLACEHOLDER_HINT_RE.search(self._slice_window(text, pos, span_end, 48)):
            return False, 0
        entropy = self._shannon_entropy(value)
        if entropy < 3.5:
            return False, 0
        confidence = min(0.90, 0.55 + entropy * 0.05)
        return True, confidence

    @staticmethod
    def _shannon_entropy(s: str) -> float:
        """Calculate Shannon entropy of a string."""
        if not s:
            return 0.0
        length = len(s)
        freq = Counter(s)
        return -sum((count / length) * math.log2(count / length) for count in freq.values())
