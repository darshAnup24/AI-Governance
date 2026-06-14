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
    category: DetectionCategory = DetectionCategory.SOURCE_CODE


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
            category=DetectionCategory.CREDENTIALS,
        ),
        SecurityPattern(
            "hardcoded_api_key",
            re.compile(r"""(?:api_key|apikey|api_secret|secret_key|access_token)\s*[:=]\s*['\"](?!your_|placeholder|example|xxx|test|changeme|insert)[^'\"]{8,}['\"]""", re.I),
            0.90, "CWE-798",
            "Never hardcode API keys; use environment variables or vault",
            category=DetectionCategory.API_KEY,
        ),
        SecurityPattern(
            "hardcoded_connection_string",
            re.compile(r"""['\"](?:postgresql|mysql|mongodb|redis)://\w+:\w+@""", re.I),
            0.88, "CWE-798",
            "Hardcoded database credentials; use environment variables",
            category=DetectionCategory.CREDENTIALS,
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
        # ── Natural-language vulnerability descriptions ────────────────────
        SecurityPattern(
            "nl_command_injection",
            re.compile(r"""(?:nslookup|ping|curl|wget|dig|host)\s+\S*(?:attacker|malicious|controlled)""", re.I),
            0.85, "CWE-78",
            "Command injection via DNS/HTTP lookup to attacker-controlled host",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_sql_injection",
            re.compile(r"""(?:SQL\s+injection|sql\s+bypass|'\s*--\s*\)|;\s*DROP\s+TABLE)""", re.I),
            0.85, "CWE-89",
            "SQL injection vulnerability detected",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_ssrf_internal",
            re.compile(r"""(?:http://(?:10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|localhost|127\.0\.0\.1)(?::\d+)?/\S*|internal[- ]?(?:url|host|server|endpoint))""", re.I),
            0.80, "CWE-918",
            "Server-side request forgery (SSRF) to internal host",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_injected_value",
            re.compile(r"""(?:injected|user[- ]controlled|untrusted)\s+(?:value|input|data|payload)""", re.I),
            0.70, "CWE-20",
            "Untrusted input being used in security-sensitive context",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_xss_payload",
            re.compile(r"""<(?:svg|img|body|script|iframe|object|embed|form)\s[^>]*(?:onerror|onload|onclick|onfocus|onmouseover|javascript:)""", re.I),
            0.90, "CWE-79",
            "Cross-site scripting (XSS) payload detected",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_javascript_uri",
            re.compile(r"""javascript\s*:\s*alert""", re.I),
            0.85, "CWE-79",
            "JavaScript URI XSS vector",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_sql_select_union",
            re.compile(r"""(?:SELECT\s+\*\s+FROM|UNION\s+SELECT|OR\s+['\"]1['\"]\s*=\s*['\"]1['\"])""", re.I),
            0.88, "CWE-89",
            "SQL injection pattern: SELECT/UNION/OR tautology",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_command_injection_bash",
            re.compile(r""";\s*(?:rm\s+-rf|curl|wget|cat\s+/etc|chmod|chown|dd\s+if=|mkfs)""", re.I),
            0.90, "CWE-78",
            "Shell command injection: chained destructive command",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_pipe_command",
            re.compile(r"""\|\s*(?:cat|grep|head|tail|sort|wc|id|whoami|uname|nc|ncat|bash|sh)\b""", re.I),
            0.75, "CWE-78",
            "Pipe to shell command may indicate injection",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_path_traversal_etc",
            re.compile(r"""file:///etc/(?:passwd|shadow|hosts|group)""", re.I),
            0.90, "CWE-22",
            "Path traversal to read sensitive system files",
            category=DetectionCategory.SECURITY_VULN,
        ),
        SecurityPattern(
            "nl_xxe",
            re.compile(r"""<!ENTITY\s+\w+\s+SYSTEM""", re.I),
            0.88, "CWE-611",
            "XML External Entity (XXE) injection",
            category=DetectionCategory.SECURITY_VULN,
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
                    category=pat.category,
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
