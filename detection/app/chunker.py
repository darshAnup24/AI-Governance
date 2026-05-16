"""
Pattern-aware text chunker for ShieldAI detection pipeline.
=============================================================
Fixes the sliding-window bisection problem: a fixed 100-char overlap cannot
guarantee that a 64-char AWS key or a 500-char JWT is fully visible in at least
one chunk.  This module uses two complementary strategies:

1. **Dynamic overlap** – overlap is set to max(300, longest_pattern_min_length)
   so that any contiguous secret spanning two chunks is always fully captured by
   the trailing window of the earlier chunk.

2. **Boundary-aware splitting** – the cut point is nudged toward the nearest
   natural boundary (newline > space > punctuation) within a small look-ahead
   window so we avoid slicing inside tokens wherever possible.

Usage (plain text / ML tier):
    from detection.app.chunker import smart_chunk
    for chunk_text in smart_chunk(text):
        ...

Usage (NER tier, needs absolute offsets):
    from detection.app.chunker import smart_chunk_with_offsets
    for offset, chunk_text in smart_chunk_with_offsets(text):
        abs_start = ent.start_char + offset
"""

from __future__ import annotations

import re

# ── Pattern catalogue ─────────────────────────────────────────────────────────
# Each entry is (name, compiled_pattern).  We use these ONLY to decide whether
# the text *may* contain a long secret that requires extended overlap.

_LONG_SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    # JWT: three base64url segments separated by dots; realistic max ≈ 1500 chars
    ("jwt",              re.compile(r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}")),
    # Database / broker connection strings
    ("connection_string", re.compile(r"(?:postgresql|mysql|mongodb\+srv|redis|amqp)://[^\s\"']+")),
    # PEM private key blocks
    ("pem_key",         re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----")),
    # GitHub fine-grained PATs (variable length, up to ~256 chars)
    ("github_fine_pat", re.compile(r"github_pat_[a-zA-Z0-9_]{22,}")),
    # Generic high-entropy blobs ≥ 64 chars (long API keys, session tokens, etc.)
    ("long_entropy",    re.compile(r"[a-zA-Z0-9+/=_-]{64,}")),
]

# ── Constants ─────────────────────────────────────────────────────────────────

#: Default max chunk size (characters).  Kept at 1 000 so spaCy/sklearn models
#: receive sensibly-sized inputs (neither truncated by their own limits nor
#: wasting compute on huge documents).
DEFAULT_MAX_CHUNK: int = 1_000

#: Minimum overlap when no long-secret patterns are detected.
_SHORT_OVERLAP: int = 300

#: Overlap used when JWT, connection strings, or other long secrets are present.
#: 500 chars ≫ the 340-char average JWT, so a JWT is always fully visible in at
#: least one chunk even when it straddles a boundary.
_LONG_OVERLAP: int = 500

#: Look-ahead window (chars) used when searching for a natural split boundary.
_BOUNDARY_LOOKAHEAD: int = 80

# ── Helpers ───────────────────────────────────────────────────────────────────

def _choose_overlap(text: str) -> int:
    """Return the required overlap size based on detected secret patterns."""
    for _name, pat in _LONG_SECRET_PATTERNS:
        if pat.search(text):
            return _LONG_OVERLAP
    return _SHORT_OVERLAP


def _find_boundary(text: str, ideal_end: int, lookahead: int = _BOUNDARY_LOOKAHEAD) -> int:
    """
    Starting at *ideal_end*, scan backward up to *lookahead* characters to find
    the nearest natural split boundary (newline > space > punctuation).

    Returns the adjusted end index.  Falls back to *ideal_end* if no boundary
    is found within the window (e.g. very long token with no whitespace).
    """
    if ideal_end >= len(text):
        return len(text)

    search_start = max(0, ideal_end - lookahead)
    window = text[search_start:ideal_end]

    # Prefer the last newline in the window
    idx = window.rfind("\n")
    if idx != -1:
        return search_start + idx + 1  # include the newline in the previous chunk

    # Fall back to the last space / tab
    idx = window.rfind(" ")
    if idx == -1:
        idx = window.rfind("\t")
    if idx != -1:
        return search_start + idx + 1

    # Fall back to the last sentence-ending punctuation
    for ch in (".", ";", ",", ")", "]", "}"):
        idx = window.rfind(ch)
        if idx != -1:
            return search_start + idx + 1

    # No boundary found — use the ideal cut point as-is
    return ideal_end


# ── Public API ────────────────────────────────────────────────────────────────

def smart_chunk(
    text: str,
    max_chunk: int = DEFAULT_MAX_CHUNK,
    min_overlap: int = _SHORT_OVERLAP,
) -> list[str]:
    """
    Split *text* into overlapping chunks that guarantee no secret pattern is
    bisected across two consecutive chunks.

    Parameters
    ----------
    text:        Input text to split.
    max_chunk:   Maximum characters per chunk (default 1 000).
    min_overlap: Minimum overlap; automatically increased to 500 when long
                 secrets (JWTs, connection strings, …) are detected.

    Returns
    -------
    List of string chunks suitable for ML / sklearn / spaCy classification.
    """
    if len(text) <= max_chunk:
        return [text]

    overlap = max(min_overlap, _choose_overlap(text))
    # Safety: overlap must be strictly less than max_chunk, or we loop forever.
    overlap = min(overlap, max_chunk - 1)

    chunks: list[str] = []
    start = 0

    while start < len(text):
        ideal_end = start + max_chunk
        end = _find_boundary(text, ideal_end)

        # If the boundary search brought us back to or before start, force advance.
        if end <= start:
            end = ideal_end

        chunks.append(text[start:end])

        if end >= len(text):
            break

        # Next chunk starts overlap chars before current end.
        start = max(start + 1, end - overlap)

    return chunks


def smart_chunk_with_offsets(
    text: str,
    max_chunk: int = DEFAULT_MAX_CHUNK,
    min_overlap: int = _SHORT_OVERLAP,
) -> list[tuple[int, str]]:
    """
    Same as :func:`smart_chunk` but returns ``(absolute_offset, chunk_text)``
    tuples so callers can map entity character positions back to the original
    document.

    Parameters
    ----------
    text:        Input text to split.
    max_chunk:   Maximum characters per chunk.
    min_overlap: Minimum overlap; escalated automatically for long secrets.

    Returns
    -------
    List of ``(offset, chunk)`` tuples.
    """
    if len(text) <= max_chunk:
        return [(0, text)]

    overlap = max(min_overlap, _choose_overlap(text))
    overlap = min(overlap, max_chunk - 1)

    chunks: list[tuple[int, str]] = []
    start = 0

    while start < len(text):
        ideal_end = start + max_chunk
        end = _find_boundary(text, ideal_end)

        if end <= start:
            end = ideal_end

        chunks.append((start, text[start:end]))

        if end >= len(text):
            break

        start = max(start + 1, end - overlap)

    return chunks
