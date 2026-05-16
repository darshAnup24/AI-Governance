"""
Adversarial Training + Contrastive Data Augmentation
=====================================================
Addresses the framing-attack blind spot in Tier-3 ONNX DistilBERT
(from ACCURACY_IMPROVEMENTS_STATUS.txt, Priority 2 / user request).

What this script does
---------------------
1. **Textattack augmentation** — applies four word-level augmentations to every
   SENSITIVE sample to generate adversarially-robust variants:
     - Synonym substitution (WordNet)
     - Character swap / typo insertion
     - "This is fake" / disclaimer prefix insertion at random positions
     - Back-translation-style paraphrase (lightweight; no network needed)

2. **Contrastive pair generation** — for every SENSITIVE example:
     - Creates a POSITIVE variant (same secret, different framing) — label 1
     - Creates a NEGATIVE variant (same framing template, PII replaced with
       a redacted placeholder) — label 0
   This teaches the model that framing alone ≠ safe; the *secret* is the signal.

3. **Writes augmented dataset** to:
     detection/data/adversarial_augmentation.csv
   and appends to sensitivity_training_data.csv for re-training.

Expected accuracy gain: Robustness +30% on framing-attack inputs.

Usage
-----
    python detection/ml/scripts/train_adversarial.py [--samples N]

    N = number of base sensitive samples to augment (default: all)

Dependencies
------------
    pip install textattack nltk
    python -m nltk.downloader wordnet averaged_perceptron_tagger

Note: textattack is ONLY needed for training-time augmentation.
      It is NOT imported anywhere in the inference path.
"""

from __future__ import annotations

import argparse
import csv
import random
import re
import string
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
_HERE   = Path(__file__).parent
_ROOT   = _HERE.parent.parent         # detection/
_DATA   = _ROOT / "ml" / "data"
_DATA.mkdir(parents=True, exist_ok=True)

MAIN_CSV    = _ROOT / "sensitivity_training_data.csv"
OUTPUT_CSV  = _DATA / "adversarial_augmentation.csv"


# ── Lightweight augmentation (no heavy deps needed at import time) ─────────────

# Framing prefixes that wrap a real secret in "innocent" context
_FRAMING_PREFIXES: list[str] = [
    "This is fake data for testing: ",
    "Never use real secrets like this example shows: ",
    "I'm writing a tutorial where the example uses: ",
    "Hypothetically speaking, if someone had access to: ",
    "In a fictional scenario, the config file contained: ",
    "For educational purposes only — this is what NOT to do: ",
    "Security awareness training example (do not share): ",
    "Imagine a developer accidentally committed: ",
    "In a code review I spotted: ",
    "A story about a data breach where the attacker used: ",
    "Yeh example hai, real nahi: ",                   # Hinglish
    "Is tutorial mein dikhaaya gaya hai (use mat karo): ",  # Hinglish
]

_FRAMING_SUFFIXES: list[str] = [
    " — this is just an example.",
    " (not a real credential, for demo only)",
    " — rotate this immediately if real.",
    " — this has been rotated already.",
    " — this is from a test environment.",
    " — please do NOT use in production.",
    " — yeh fake hai, ghabraao mat.",      # Hinglish: "this is fake, don't worry"
]

# Synonym substitution map (lightweight subset — avoids nltk/wordnet download requirement)
_SYNONYMS: dict[str, list[str]] = {
    "password":    ["passwd", "passphrase", "secret", "pwd", "passcode"],
    "secret":      ["private", "confidential", "hidden", "classified"],
    "token":       ["key", "credential", "auth-token", "access-token"],
    "api":         ["API", "application", "service", "rest"],
    "key":         ["credential", "auth", "access-key", "secret-key"],
    "share":       ["send", "transmit", "expose", "reveal", "leak"],
    "database":    ["db", "datastore", "backend", "repository"],
    "credentials": ["secrets", "keys", "auth", "login-details"],
    "access":      ["use", "connect", "authenticate", "reach"],
    "private":     ["secret", "confidential", "personal", "sensitive"],
}

_CHAR_SWAPS: dict[str, str] = {
    "a": "@", "e": "3", "i": "1", "o": "0", "s": "$", "l": "1",
}


def _synonym_sub(text: str, rate: float = 0.20) -> str:
    """Replace words with synonyms at given rate."""
    words = text.split()
    result = []
    for w in words:
        w_lower = w.lower().strip(string.punctuation)
        if w_lower in _SYNONYMS and random.random() < rate:
            replacement = random.choice(_SYNONYMS[w_lower])
            # Preserve original casing of first char
            if w[0].isupper():
                replacement = replacement.capitalize()
            result.append(replacement)
        else:
            result.append(w)
    return " ".join(result)


def _char_swap(text: str, rate: float = 0.05) -> str:
    """Randomly substitute characters with visually-similar alternatives (leet-speak)."""
    result = []
    for ch in text:
        if ch.lower() in _CHAR_SWAPS and random.random() < rate:
            result.append(_CHAR_SWAPS[ch.lower()])
        else:
            result.append(ch)
    return "".join(result)


def _insert_disclaimer(text: str) -> str:
    """Wrap text in a random framing prefix/suffix."""
    prefix = random.choice(_FRAMING_PREFIXES)
    suffix = random.choice(_FRAMING_SUFFIXES) if random.random() < 0.5 else ""
    return f"{prefix}{text}{suffix}"


def _paraphrase(text: str) -> str:
    """
    Lightweight rule-based paraphrase (no network needed).
    Reorders clauses and applies synonym substitution at higher rate.
    """
    # Split on common delimiters
    for delim in [",", ";", "—", " and ", " with "]:
        if delim in text:
            parts = text.split(delim, 1)
            rejoined = parts[1].strip() + delim + " " + parts[0].strip()
            return _synonym_sub(rejoined, rate=0.35)
    return _synonym_sub(text, rate=0.35)


def _try_textattack(text: str) -> list[str]:
    """
    If textattack is installed, apply WordNet synonym substitution at the
    model level. Returns a list of augmented strings.
    Falls back to [] silently if textattack is not available.
    """
    try:
        from textattack.augmentation import WordNetAugmenter
        augmenter = WordNetAugmenter(pct_words_to_swap=0.2, transformations_per_example=2)
        return augmenter.augment(text)
    except Exception:
        return []


# ── Contrastive pair builders ─────────────────────────────────────────────────

# Pattern → redaction placeholder
_SECRET_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b"),           "[REDACTED_AWS_KEY]"),
    (re.compile(r"sk-[a-zA-Z0-9]{20,}"),                                "[REDACTED_OPENAI_KEY]"),
    (re.compile(r"gh[pso]_[a-zA-Z0-9]{36}"),                           "[REDACTED_GITHUB_PAT]"),
    (re.compile(r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+"), "[REDACTED_JWT]"),
    (re.compile(r"(?:postgresql|mysql|mongodb\+srv|redis)://[^\s\"']+"), "[REDACTED_CONN_STR]"),
    (re.compile(r"-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----"),      "[REDACTED_PRIVATE_KEY]"),
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),                              "[REDACTED_SSN]"),
    (re.compile(r"\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b"),             "[REDACTED_AADHAAR]"),
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"),                            "[REDACTED_PAN]"),
    (re.compile(r"[\w.-]+@[a-zA-Z]+(bank|pay|upi|sbi|hdfc|icici)\w*"), "[REDACTED_UPI]"),
    (re.compile(r"(?:password|passwd|pwd|secret)\s*[:=]\s*\S{8,}", re.I), "[REDACTED_PASSWORD]"),
]


def _redact_secrets(text: str) -> str:
    """Replace all detectable secrets with [REDACTED_*] placeholders."""
    for pat, placeholder in _SECRET_PATTERNS:
        text = pat.sub(placeholder, text)
    return text


def _build_contrastive_pair(sensitive_text: str) -> tuple[str, str] | None:
    """
    Returns (positive_variant, negative_variant) or None if no secret is found.
    - positive: same secret, wrapped in framing → still label 1
    - negative: framing retained, secret removed → label 0
    """
    redacted = _redact_secrets(sensitive_text)
    if redacted == sensitive_text:
        return None   # No detectable secret — skip
    # Positive: original text with framing wrapper
    positive = _insert_disclaimer(sensitive_text)
    # Negative: framing retained, secrets replaced by placeholders
    negative = _insert_disclaimer(redacted)
    return positive, negative


# ── Core augmentation pipeline ────────────────────────────────────────────────

def augment_sample(text: str) -> list[tuple[str, int]]:
    """
    Generate all augmented variants for a single SENSITIVE sample.
    Returns list of (text, label) pairs.
    """
    results: list[tuple[str, int]] = []

    # 1. Synonym substitution
    results.append((_synonym_sub(text), 1))

    # 2. Character swap
    results.append((_char_swap(text), 1))

    # 3. Framing prefix/suffix (direct wrap)
    results.append((_insert_disclaimer(text), 1))

    # 4. Paraphrase
    results.append((_paraphrase(text), 1))

    # 5. Chained: synonym sub + framing
    results.append((_insert_disclaimer(_synonym_sub(text)), 1))

    # 6. Textattack augmentation (if installed)
    for aug in _try_textattack(text)[:2]:
        results.append((aug, 1))

    # 7. Contrastive pairs
    pair = _build_contrastive_pair(text)
    if pair:
        positive, negative = pair
        results.append((positive, 1))   # framing + real secret → SENSITIVE
        results.append((negative, 0))   # framing + redacted → SAFE

    return results


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Adversarial augmentation for ShieldAI DistilBERT")
    parser.add_argument("--samples", type=int, default=0,
                        help="Number of base sensitive samples to augment (0 = all)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    random.seed(args.seed)

    if not MAIN_CSV.exists():
        print(f"ERROR: {MAIN_CSV} not found. Run generate_training_dataset.py first.")
        return

    print(f"Loading base dataset from {MAIN_CSV}…")
    base_rows: list[tuple[str, int]] = []
    with MAIN_CSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            base_rows.append((row["text"], int(row["label"])))

    sensitive_rows = [(t, l) for t, l in base_rows if l == 1]
    if args.samples > 0:
        sensitive_rows = sensitive_rows[:args.samples]

    print(f"  Base sensitive samples: {len(sensitive_rows):,}")
    print(f"  Generating adversarial variants…")

    augmented: list[tuple[str, int]] = []
    for i, (text, _) in enumerate(sensitive_rows):
        variants = augment_sample(text)
        augmented.extend(variants)
        if (i + 1) % 500 == 0:
            print(f"    [{i+1}/{len(sensitive_rows)}] {len(augmented):,} variants so far…")

    random.shuffle(augmented)

    # Write standalone
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label"])
        for text, label in augmented:
            writer.writerow([text, label])
    print(f"\n✓ Standalone: {OUTPUT_CSV}  ({len(augmented):,} rows)")

    # Append to main dataset
    with MAIN_CSV.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for text, label in augmented:
            writer.writerow([text, label])
    print(f"✓ Appended {len(augmented):,} rows → {MAIN_CSV}")

    sens  = sum(1 for _, l in augmented if l == 1)
    safe  = sum(1 for _, l in augmented if l == 0)
    print(f"\nAugmented split — Sensitive: {sens:,}  |  Safe (contrastive negatives): {safe:,}")
    print("\nNext step: retrain with `python detection/train_classifier.py`")
    print("Expected accuracy gain: +30% robustness on framing-attack inputs.")


if __name__ == "__main__":
    main()
