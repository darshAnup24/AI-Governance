"""
Security Code Detector — Detects security vulnerabilities in AI-generated code.
Covers SQL injection, hardcoded credentials, insecure randomness, path traversal,
command injection, and XSS patterns.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import ClassVar

from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult


@dataclass
class SecurityPattern:
    name: str
    pattern: re.Pattern[str]
    confidence: float
    cwe_id: str
    recommendation: str


class SecurityCodeDetector:
    """Detect security vulnerabilities in AI-generated code."""

    PATTERNS: ClassVar[list[SecurityPattern]] = [
        # SQL Injection
        SecurityPattern(
            "sql_string_concat",
            re.compile(r"""(?:execute|cursor\.execute|query|sql)\s*\([^)]*(?:\+|%\s|\.format|f['\"])[^)]*\)""", re.I),
            0.90, "CWE-89",
            "Use parameterized queries instead of string concatenation",
        ),
        SecurityPattern(
            "sql_fstring",
            re.compile(r"""f['\"](?:SELECT|INSERT|UPDATE|DELETE|DROP)\s[^'\"]*\{[^}]+\}""", re.I),
            0.92, "CWE-89",
            "SQL injection risk: use parameterized queries, not f-strings",
        ),
        SecurityPattern(
            "sql_format",
            re.compile(r"""['\"](?:SELECT|INSERT|UPDATE|DELETE)\s.*['\"]\.format\(""", re.I),
            0.90, "CWE-89",
            "SQL injection risk: use parameterized queries, not .format()",
        ),

        # Hardcoded Credentials
        SecurityPattern(
            "hardcoded_password",
            re.compile(r"""(?:password|passwd|pwd)\s*[:=]\s*['\"][^'\"]{4,}['\"]""", re.I),
            0.88, "CWE-798",
            "Never hardcode passwords; use environment variables or secret managers",
        ),
        SecurityPattern(
            "hardcoded_api_key",
            re.compile(r"""(?:api_key|apikey|api_secret|secret_key|access_token)\s*[:=]\s*['\"][^'\"]{8,}['\"]""", re.I),
            0.90, "CWE-798",
            "Never hardcode API keys; use environment variables or vault",
        ),
        SecurityPattern(
            "hardcoded_connection_string",
            re.compile(r"""['\"](?:postgresql|mysql|mongodb|redis)://\w+:\w+@""", re.I),
            0.88, "CWE-798",
            "Hardcoded database credentials; use environment variables",
        ),

        # Insecure Randomness
        SecurityPattern(
            "math_random_security",
            re.compile(r"""Math\.random\(\)"""),
            0.75, "CWE-330",
            "Math.random() is not cryptographically secure; use crypto.getRandomValues()",
        ),
        SecurityPattern(
            "python_random_security",
            re.compile(r"""(?:import random|random\.(?:random|randint|choice|shuffle))\b.*(?:password|token|secret|key|nonce|salt|otp|code)""", re.I),
            0.80, "CWE-330",
            "Use secrets module for security-sensitive random values",
        ),

        # Path Traversal
        SecurityPattern(
            "path_traversal",
            re.compile(r"""(?:open|read|write|file)\s*\([^)]*(?:\.\./|\.\.\\)""", re.I),
            0.85, "CWE-22",
            "Path traversal risk: validate and sanitize file paths",
        ),
        SecurityPattern(
            "user_controlled_path",
            re.compile(r"""(?:os\.path\.join|Path)\s*\([^)]*(?:request|user_input|params|query)""", re.I),
            0.80, "CWE-22",
            "User-controlled file path: validate against directory traversal",
        ),

        # Command Injection
        SecurityPattern(
            "os_system",
            re.compile(r"""os\.system\s*\([^)]*(?:\+|f['\"]|\.format|%\s)""", re.I),
            0.95, "CWE-78",
            "Command injection risk: use subprocess with shell=False",
        ),
        SecurityPattern(
            "eval_exec",
            re.compile(r"""\b(?:eval|exec)\s*\([^)]*(?:input|request|user|params|query|data)""", re.I),
            0.95, "CWE-94",
            "Code injection risk: never eval/exec user-controlled content",
        ),
        SecurityPattern(
            "subprocess_shell",
            re.compile(r"""subprocess\.(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True""", re.I),
            0.85, "CWE-78",
            "Use shell=False and pass arguments as a list",
        ),

        # XSS
        SecurityPattern(
            "innerhtml",
            re.compile(r"""\.innerHTML\s*=\s*(?!['\"]\s*['\"]\s*;)""", re.I),
            0.80, "CWE-79",
            "XSS risk: use textContent or sanitize before setting innerHTML",
        ),
        SecurityPattern(
            "document_write",
            re.compile(r"""document\.write\s*\("""),
            0.75, "CWE-79",
            "document.write() is an XSS vector; use DOM methods instead",
        ),
        SecurityPattern(
            "dangerously_set_html",
            re.compile(r"""dangerouslySetInnerHTML"""),
            0.70, "CWE-79",
            "Ensure content is sanitized before using dangerouslySetInnerHTML",
        ),

        # Deserialization
        SecurityPattern(
            "pickle_load",
            re.compile(r"""pickle\.(?:load|loads)\s*\("""),
            0.90, "CWE-502",
            "Insecure deserialization: never unpickle untrusted data",
        ),
        SecurityPattern(
            "yaml_unsafe",
            re.compile(r"""yaml\.(?:load|unsafe_load)\s*\([^)]*(?!Loader)"""),
            0.85, "CWE-502",
            "Use yaml.safe_load() instead of yaml.load()",
        ),
    ]

    def detect(self, text: str) -> DetectionResult:
        """Run all security vulnerability patterns against input text."""
        start = time.perf_counter()
        spans: list[DetectedSpan] = []

        for pat in self.PATTERNS:
            for match in pat.pattern.finditer(text):
                ctx_start = max(0, match.start() - 60)
                ctx_end = min(len(text), match.end() + 60)
                spans.append(DetectedSpan(
                    start=match.start(),
                    end=match.end(),
                    category=DetectionCategory.SOURCE_CODE,
                    confidence=pat.confidence,
                    matched_text=match.group()[:80],
                    detector=f"security_{pat.name}",
                    context=text[ctx_start:ctx_end],
                ))

        duration_ms = (time.perf_counter() - start) * 1000
        max_conf = max((s.confidence for s in spans), default=0.0)

        return DetectionResult(
            detector_name="security_code",
            spans=spans,
            risk_score=max_conf * 100 if spans else 0,
            processing_time_ms=round(duration_ms, 2),
        )
