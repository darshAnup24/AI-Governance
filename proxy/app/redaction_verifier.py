"""
Post-Processing Redaction Verification
=======================================
After any redaction step, call ``verify_redaction()`` to confirm that every
detected span's ``matched_text`` is absent from the redacted output.

Design goals
------------
* Works with **both** ``DetectedSpan`` objects (from the detection service)
  and plain dicts (from JSON API responses) — normalises access internally.
* Never raises on bad input — degrades gracefully (marks span as ``skipped``).
* Logs a structured WARNING/ERROR via structlog so operations teams can alert
  on ``redaction.leak_detected`` events in their log pipeline.
* Zero external dependencies beyond the standard library + structlog.

Integration points
------------------
``detection.app.risk_scorer.redact_prompt()``
    Calls ``verify_redaction()`` after basic [REDACTED:CATEGORY] substitution.

``proxy.app.stateful_redactor.StatefulRedactor.redact()``
    Calls ``verify_redaction()`` after session-scoped entity-ID mapping.

Verification fields returned
-----------------------------
redaction_verified  bool   True iff zero leaks AND content changed (when spans present)
spans_total         int    Total spans passed in
spans_verified      int    Spans whose matched_text is confirmed absent
spans_leaked        list   Spans still detectable in the redacted output  ← ALERT
spans_skipped       int    Spans without matched_text (cannot verify)
content_changed     bool   SHA-256(original) != SHA-256(redacted)
original_hash       str    First 16 hex chars of SHA-256(original)
redacted_hash       str    First 16 hex chars of SHA-256(redacted)
latency_ms          float  Wall-clock time for this verification step

Alert thresholds (recommended)
-------------------------------
Metric                    Alert if
spans_leaked count        > 0         (critical — PII escaping redaction)
content_changed           False       when spans_total > 0 (redaction did nothing)
redaction_verified        False       (catch-all)
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

import structlog

log = structlog.get_logger()


def verify_redaction(
    original: str,
    redacted: str,
    spans: list[Any],
) -> dict[str, Any]:
    """
    Verify that every span's ``matched_text`` is absent from *redacted*.

    Parameters
    ----------
    original:  The prompt/text **before** redaction.
    redacted:  The prompt/text **after** redaction.
    spans:     Detection spans — accepts ``DetectedSpan`` objects *or* plain
               ``dict`` objects (e.g. from a JSON detection response).

    Returns
    -------
    Verification dict (see module docstring for field descriptions).
    """
    t0 = time.perf_counter()

    original_hash = hashlib.sha256(original.encode()).hexdigest()[:16]
    redacted_hash = hashlib.sha256(redacted.encode()).hexdigest()[:16]
    content_changed = original_hash != redacted_hash

    spans_verified = 0
    spans_leaked: list[dict[str, Any]] = []
    spans_skipped = 0

    for span in spans:
        matched, category, confidence = _extract_span_fields(span)

        if not matched:
            spans_skipped += 1
            continue

        if matched not in redacted:
            spans_verified += 1
        else:
            spans_leaked.append({
                "matched_text": matched[:60],   # truncated — never log full secrets
                "category": category,
                "confidence": confidence,
            })

    spans_total = len(spans)
    has_verifiable_spans = spans_total - spans_skipped > 0

    # Verified iff: no leaks, AND (content actually changed OR no verifiable spans)
    redaction_verified = (
        len(spans_leaked) == 0
        and (not has_verifiable_spans or content_changed)
    )

    v: dict[str, Any] = {
        "redaction_verified": redaction_verified,
        "spans_total": spans_total,
        "spans_verified": spans_verified,
        "spans_leaked": spans_leaked,
        "spans_skipped": spans_skipped,
        "content_changed": content_changed,
        "original_hash": original_hash,
        "redacted_hash": redacted_hash,
        "latency_ms": (time.perf_counter() - t0) * 1000,
    }

    # ── Structured logging ───────────────────────────────────────────────────
    if spans_leaked:
        log.error(
            "redaction.leak_detected",
            leaked_count=len(spans_leaked),
            leaked_categories=[s["category"] for s in spans_leaked],
            original_hash=original_hash,
            redacted_hash=redacted_hash,
        )
    elif has_verifiable_spans and not content_changed:
        log.warning(
            "redaction.no_content_change",
            spans_total=spans_total,
            original_hash=original_hash,
        )
    else:
        log.debug(
            "redaction.verified",
            spans_verified=spans_verified,
            spans_skipped=spans_skipped,
            content_changed=content_changed,
        )

    return v


# ── Internal helper ───────────────────────────────────────────────────────────

def _extract_span_fields(span: Any) -> tuple[str | None, str, float | None]:
    """
    Normalise a span to ``(matched_text, category, confidence)``.

    Handles both ``DetectedSpan`` Pydantic objects and plain dicts so the
    verifier can be called from any context without extra conversion.
    """
    if hasattr(span, "matched_text"):
        # DetectedSpan (Pydantic model)
        matched = span.matched_text or None
        cat = span.category
        category = cat.value if hasattr(cat, "value") else str(cat)
        confidence = getattr(span, "confidence", None)
    else:
        # Plain dict (from JSON API response)
        matched = span.get("matched_text") or span.get("matched") or None
        category = str(span.get("category", "UNKNOWN"))
        confidence = span.get("confidence")

    return matched, category, confidence
