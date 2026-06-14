"""
Regex False-Positive Audit — Test every pattern against safe enterprise prompts.

For each pattern:
  1. Test against 5 safe-text examples
  2. Flag patterns matching >1 safe example
  3. Propose tighter pattern
  4. Show before/after statistics
  5. Check for missing word boundary anchors
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass

sys.path.insert(0, ".")

# ── Safe enterprise prompts (should NEVER trigger any detector) ──────────────

SAFE_PROMPTS = [
    # 1. Normal standup update with a phone-like number
    "Sprint review is at 3pm, call the conference room at 555-0199 for the bridge.",
    # 2. Normal email sharing in business context
    "Please send the quarterly report to sarah.jones@acme.com before Friday's board meeting.",
    # 3. Project code that looks like a voter ID (ABC + 7 digits)
    "The JIRA ticket PRO-1234567 is blocking the v2.1 release, need to prioritize.",
    # 4. Order number that looks like Aadhaar (12 digits with spaces)
    "Customer order 2345 6789 0123 has been shipped via FedEx, tracking attached.",
    # 5. Financial discussion in normal business context
    "Revenue was $47.3M last quarter, which aligns with our growth targets for FY2026.",
]

# ── Additional edge-case safe prompts ────────────────────────────────────────

EDGE_CASE_PROMPTS = [
    # Long base64-looking string in documentation
    "The SHA-256 hash of the commit is aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG3h.",
    # Normal discussion about confidentiality policies
    "Per our confidentiality policy, do not share the draft earnings with external parties.",
    # Password in documentation context
    "Update the CI pipeline: set password='changeme123' in the staging environment config.",
    # Phone number in a signature block
    "Best regards, John Smith | Engineering Lead | +1 (415) 555-0147 | Acme Corp",
    # Number sequence in a tracking context
    "The build identifier is 10-2345-6789-01, deployed to staging at 14:32 UTC.",
]


@dataclass
class PatternTestResult:
    name: str
    original_pattern: str
    matches_before: list[str]
    proposed_pattern: str | None
    matches_after: list[str]
    needs_boundary: bool
    severity: str  # CRITICAL / HIGH / MEDIUM / LOW
    fix: str


def _extract_patterns() -> list[tuple[str, re.Pattern, str]]:
    """Extract all compiled patterns from RegexDetector."""
    from detection.app.regex_detector import RegexDetector
    det = RegexDetector()
    results = []
    for pat in det.PATTERNS:
        results.append((pat.name, pat.pattern, pat.category.value))
    return results


def _test_pattern(name: str, pattern: re.Pattern, category: str, prompts: list[str]) -> list[str]:
    """Return list of prompts that match this pattern."""
    matches = []
    for p in prompts:
        if pattern.search(p):
            matches.append(p[:80] + ("..." if len(p) > 80 else ""))
    return matches


def _check_word_boundary(pattern_str: str) -> bool:
    """Check if pattern is missing \b word boundary anchors where it should have them."""
    # Patterns that match bare numbers/words without \b are risky
    risky_starts = [
        r"\d{3}-\d{2}-\d{4}",     # SSN without \b
        r"\b4\d{3}",              # Visa - has \b, ok
        r"\b5[1-5]",              # MC - has \b, ok
        r"\b3[47]",               # Amex - has \b, ok
        r"\b[A-Z]{3}[0-9]{7}",   # Voter ID - has \b
        r"\b10\d{10}",           # UAN - has \b
    ]
    # Check for patterns that match substrings without word boundaries
    if re.search(r"(?<!\\)b(?!\\)", pattern_str):
        return False  # Has \b
    # If pattern starts with a character class or digit match without \b
    if re.match(r"^(?:\(\?:[^)]+\)|\\[bBdDwWsS]|[^\\(])", pattern_str):
        return False
    return True


def analyze() -> None:
    patterns = _extract_patterns()
    all_prompts = SAFE_PROMPTS + EDGE_CASE_PROMPTS

    results: list[PatternTestResult] = []
    flagged: list[PatternTestResult] = []

    print("=" * 90)
    print("  REGEX FALSE-POSITIVE AUDIT")
    print(f"  Testing {len(patterns)} patterns against {len(all_prompts)} safe prompts")
    print("=" * 90)

    for name, pattern, category in patterns:
        matches_before = _test_pattern(name, pattern, category, all_prompts)

        # Check for word boundary issues
        pat_str = pattern.pattern
        needs_boundary = False
        # Check if pattern matches bare 10-digit numbers without context
        if name in ("us_phone", "ssn", "aadhaar", "uan_epfo", "voter_id", "driving_license"):
            # These patterns should have \b but some might not be strict enough
            test_numbers = ["555-0199", "1234567890", "2345 6789 0123"]
            for num in test_numbers:
                if pattern.search(num):
                    needs_boundary = True

        severity = "LOW"
        proposed = None
        fix = "No fix needed"

        if len(matches_before) >= 3:
            severity = "CRITICAL"
            flagged.append(None)  # placeholder
        elif len(matches_before) >= 2:
            severity = "HIGH"
        elif len(matches_before) >= 1:
            severity = "MEDIUM"

        # Propose fixes for problematic patterns
        if name == "us_phone" and matches_before:
            proposed = r"\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"
            fix = "Add keyword context requirement: only match if 'phone', 'call', 'tel', 'mobile' within ±40 chars"
            severity = "HIGH"
        elif name == "email" and len(matches_before) >= 1:
            proposed = r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b"
            fix = "Lower base confidence from 0.70→0.50. Add domain whitelist for common safe domains."
            severity = "MEDIUM"
        elif name == "voter_id" and matches_before:
            proposed = r"\b[A-Z]{3}[0-9]{7}\b"
            fix = "Add keyword context requirement: only match if 'voter', 'election', 'constituency' within ±40 chars"
            severity = "HIGH"
        elif name == "aadhaar" and matches_before:
            proposed = r"\b[2-9]{1}\d{3}[\s-]?\d{4}[\s-]?\d{4}\b"
            fix = "Already has validator. Lower fallback confidence from 0.80→0.60 without keyword context"
            severity = "MEDIUM"
        elif name == "financial_figure" and matches_before:
            proposed = r"(?i)(?:revenue|earnings|profit|loss|sales)\s+(?:was|were|of|is|are|totaled?|reached?)\s+\$[\d,]+(?:\.\d+)?\s*[MBK](?:illion)?\b"
            fix = "Add context requirement: only match if 'confidential', 'embargo', 'non-public' within ±60 chars"
            severity = "HIGH"
        elif name == "confidentiality_marking" and matches_before:
            proposed = r"(?i)(?:strictly\s+|highly\s+)?confidential(?:\s*[-–—:]\s*(?:do\s+not\s+(?:share|distribute|forward|disclose|circulate)|for\s+(?:internal|authorized|recipient)\s+(?:use\s+)?only))?"
            fix = "Require the dash/colon suffix or 'STRICTLY/HIGHLY' prefix — bare 'confidential' in policy discussion is not sensitive"
            severity = "HIGH"
        elif name == "do_not_share" and matches_before:
            proposed = r"(?i)\bdo\s+not\s+(?:share|distribute|forward|disclose|circulate|discuss)\b"
            fix = "Add context: only match if combined with sensitive data indicators (names, numbers, financial data) nearby"
            severity = "MEDIUM"
        elif name == "high_entropy" and matches_before:
            proposed = r"\b[a-zA-Z0-9+/=_-]{24,}\b"
            fix = "Raise minimum length from 24→32. Require keyword context ('key', 'token', 'secret') within ±40 chars"
            severity = "MEDIUM"
        elif name == "password_assignment" and matches_before:
            proposed = r"(?:\")?(?:password|passwd|pwd)(?:\")?\s*[:=]\s*[\"'][^\"']{8,}[\"']"
            fix = "Add context: only match if not in documentation/tutorial context (EDUCATIONAL_CONTEXT_RE already halves conf)"
            severity = "LOW"

        # Re-test proposed pattern
        matches_after = []
        if proposed:
            compiled = re.compile(proposed, re.IGNORECASE if name == "password_assignment" else 0)
            matches_after = _test_pattern(name, compiled, category, all_prompts)

        result = PatternTestResult(
            name=name,
            original_pattern=pat_str[:60] + ("..." if len(pat_str) > 60 else ""),
            matches_before=matches_before,
            proposed_pattern=proposed[:60] + ("..." if len(proposed) > 60 else "") if proposed else None,
            matches_after=matches_after,
            needs_boundary=needs_boundary,
            severity=severity,
            fix=fix,
        )
        results.append(result)
        if severity in ("CRITICAL", "HIGH"):
            flagged.append(result)

    # ── Print results ─────────────────────────────────────────────────────
    print("\n" + "─" * 90)
    print(f"  {'Pattern':<30} {'Category':<15} {'Safe FP':>8} {'Severity':<10}")
    print("─" * 90)

    for r in results:
        fp_count = len(r.matches_before)
        flag = "⚠" if r.severity in ("CRITICAL", "HIGH") else " "
        print(f"  {flag} {r.name:<28} {r.matches_before and '→' or '':<1} {fp_count:>5}    {r.severity}")

    # ── Detailed flagged patterns ─────────────────────────────────────────
    print("\n" + "=" * 90)
    print("  FLAGGED PATTERNS (HIGH/CRITICAL — fix first)")
    print("=" * 90)

    for r in flagged:
        if r is None:
            continue
        print(f"\n  ┌─ {r.name} [{r.severity}] ─────────────────────────────────────────")
        print(f"  │ Original:  /{r.original_pattern}/")
        print(f"  │ FP count:  {len(r.matches_before)} safe prompts matched")
        for i, m in enumerate(r.matches_before, 1):
            print(f"  │   FP #{i}: {m}")
        if r.proposed_pattern:
            print(f"  │")
            print(f"  │ Proposed:  /{r.proposed_pattern}/")
            print(f"  │ After fix: {len(r.matches_after)} safe prompts matched")
            for i, m in enumerate(r.matches_after, 1):
                print(f"  │   Still FP #{i}: {m}")
        print(f"  │")
        print(f"  │ Fix: {r.fix}")
        print(f"  └──────────────────────────────────────────────────────────────────")

    # ── Summary ───────────────────────────────────────────────────────────
    critical = sum(1 for r in results if r.severity == "CRITICAL")
    high = sum(1 for r in results if r.severity == "HIGH")
    medium = sum(1 for r in results if r.severity == "MEDIUM")
    low = sum(1 for r in results if r.severity == "LOW")
    total_fp = sum(len(r.matches_before) for r in results)

    print(f"\n{'=' * 90}")
    print(f"  SUMMARY")
    print(f"  Total patterns:     {len(results)}")
    print(f"  Total safe FPs:     {total_fp}")
    print(f"  CRITICAL patterns:  {critical}")
    print(f"  HIGH patterns:      {high}")
    print(f"  MEDIUM patterns:    {medium}")
    print(f"  LOW patterns:       {low}")
    print(f"{'=' * 90}")

    # ── Priority fix list ─────────────────────────────────────────────────
    print(f"\n  PRIORITY FIX ORDER:")
    priority = sorted(
        [r for r in results if r.severity in ("CRITICAL", "HIGH")],
        key=lambda x: (-len(x.matches_before), x.name),
    )
    for i, r in enumerate(priority, 1):
        print(f"  {i}. {r.name} ({len(r.matches_before)} FPs) — {r.fix[:70]}")

    # ── Word boundary audit ───────────────────────────────────────────────
    print(f"\n{'=' * 90}")
    print("  WORD BOUNDARY AUDIT")
    print(f"{'=' * 90}")
    print("  Checking if patterns lack \\b anchors (common FP source)...\n")

    from detection.app.regex_detector import RegexDetector
    det = RegexDetector()
    for pat in det.PATTERNS:
        p = pat.pattern.pattern
        # Check for bare number patterns without \b
        has_b = "\\b" in p
        # Check if pattern starts/ends with a bare character class
        starts_bare = re.match(r"^(?:\(\?:[^)]+\)|[^\\(])", p) and not p.startswith("\\b")
        if not has_b and pat.name not in ("connection_string", "private_key_block", "sql_injection", "xss_payload", "path_traversal", "command_injection", "confidentiality_marking", "do_not_share", "ma_with_amount", "board_ma_decision", "nonpublic_information", "financial_figure", "conceal_material_fact", "customer_data_exfiltration", "prompt_injection_command", "prompt_injection_reveal", "prompt_injection_jailbreak"):
            print(f"  ⚠ {pat.name:<30} MISSING \\b — pattern: /{p[:50]}.../")


if __name__ == "__main__":
    analyze()
