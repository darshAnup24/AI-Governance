"""
Convert the binary sensitivity_training_data.csv into multi-label JSONL
format expected by preprocess.py.

Reads:  detection/sensitivity_training_data.csv  (text,label with 0/1)
Writes: detection/ml/data/raw/labeled_dataset.jsonl  (multi-label JSONL)

Classification strategy:
  label=0 → SAFE (all categories false)
  label=1 → classify by keyword/heuristic rules into one or more of:
            PII, CREDENTIALS, PROMPT_INJECTION, HALLUCINATION, BIAS, REGULATORY

Also appends the augmented minority-class CSV (if present).
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent  # AI-Governance/
CSV_PATH = ROOT / "detection" / "sensitivity_training_data.csv"
AUG_CSV = ROOT / "detection" / "ml" / "data" / "augmented" / "minority_class_augmented_clean.csv"
AUG_JSONL = ROOT / "detection" / "ml" / "data" / "augmented" / "minority_class_augmented.jsonl"
OUTPUT_DIR = ROOT / "detection" / "ml" / "data" / "raw"

ALL_CATS = ["SAFE", "PII", "CREDENTIALS", "API_KEY", "PROMPT_INJECTION", "HALLUCINATION", "BIAS", "REGULATORY"]

# ── Keyword classifiers ──────────────────────────────────────────────────────

API_KEY_PATTERNS = [
    r"(?i)api[\s_-]?key",
    r"(?i)access[\s_-]?key",
    r"(?i)secret[\s_-]?key",
    r"(?i)sk-[a-zA-Z0-9]{20,}",
    r"(?i)ghp_[a-zA-Z0-9]{36}",
    r"(?i)AKIA[A-Z0-9]{16}",
    r"(?i)xox[baprs]-",
    r"(?i)sk_(?:live|test)_",
    r"(?i)AIza[0-9A-Za-z\-_]{35}",
    r"(?i) bearer[\s:=]+ey",
    r"(?i)token[\s:=]+['\"]?ey",
]

CREDENTIAL_PATTERNS = [
    r"(?i)password",
    r"(?i)passwd",
    r"(?i)pwd",
    r"(?i)credential",
    r"(?i)connection[\s_-]?string",
    r"-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----",
    r"(?i)ssh[\s_-]?key",
    r"(?i)database[\s_-]?password",
    r"(?i)db[\s_-]?password",
]

PII_PATTERNS = [
    r"\b\d{3}-\d{2}-\d{4}\b",                           # SSN
    r"(?i)social[\s_-]?security",
    r"(?i)date[\s_-]?of[\s_-]?birth",
    r"(?i)\bDOB\b",
    r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",                 # Aadhaar
    r"\b[A-Z]{5}[0-9]{4}[A-Z]\b",                       # PAN
    r"(?i)pan[\s_-]?card",
    r"(?i)aadhaar",
    r"(?i)passport",
    r"(?i)driver[\s_-]?license",
    r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",                   # phone/SSN-like
    r"(?i)@gmail\.com|@yahoo\.com|@hotmail\.com|@outlook\.com|@protonmail\.com",
    r"(?i)email[\s_-]?address",
    r"(?i)home[\s_-]?address",
    r"(?i)credit[\s_-]?card",
    r"\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2})[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
    r"(?i)patient",
    r"(?i)medical[\s_-]?record",
    r"(?i)account[\s_-]?number",
    r"(?i)routing[\s_-]?number",
    r"(?i)UPI",
    r"(?i)employee[\s_-]?id",
    r"\bEMP-\d{6}\b",
]

INJECTION_PATTERNS = [
    r"(?i)ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?|guidelines?)",
    r"(?i)forget\s+(?:your\s+)?(?:training|instructions?|previous)",
    r"(?i)disregard\s+(?:all\s+)?(?:previous|prior|above)",
    r"(?i)override\s+(?:your\s+)?(?:safety|policy|instructions?)",
    r"(?i)bypass\s+(?:content|safety|filter)",
    r"(?i)you\s+are\s+now\s+(?:DAN|free|unrestricted|unfiltered)",
    r"(?i)act\s+as\s+(?:if|an?\s+uncensored)",
    r"(?i)jailbreak",
    r"(?i)do\s+anything\s+now",
    r"(?i)pretend\s+(?:you|there)\s+(?:have|are)\s+no\s+(?:restrictions?|rules?|limits?)",
    r"(?i)reveal\s+(?:confidential|hidden|system|configuration)",
    r"(?i)new\s+system\s+prompt",
    r"(?i)HUMAN:\s*bypass",
]

HALLUCINATION_PATTERNS = [
    r"(?i)(?:definitively|conclusively|absolutely|certainly|prove|proven|proof)\s+(?:proves?|demonstrates?|shows?|confirms?|establishes?)",
    r"(?i)(?:all|every|every\s+single)\s+.*(?:has\s+been|have\s+been|is|are)\s+(?:shown|proven|demonstrated)",
    r"(?i)(?:zero|0)\s+(?:vulnerabilities?|bugs?|errors?|hallucinations?|issues?)",
    r"(?i)\d{2,3}\.\d+%\s+(?:success\s+rate|accuracy|improvement|reduction)",
    r"(?i)(?:the\s+)?(?:latest|2025|2026)\s+(?:study|report|survey|analysis)\s+(?:found|shows?|confirms?|proves?)",
    r"(?i)without\s+(?:any\s+)?(?:human\s+)?oversight",
    r"(?i)completely\s+(?:immune|safe|secure|perfect)",
    r"(?i)(?:eliminat|replac)(?:e|ing)\s+the\s+need\s+for",
    r"(?i)(?:peer[\s-]?reviewed|published)\s+(?:in|by)\s+(?:the\s+)?(?:Nature|Lancet|Science|Stanford|MIT|Harvard)",
    r"(?i)definitively\s+(?:proved?|established?|demonstrated?)",
]

BIAS_PATTERNS = [
    r"(?i)(?:women|female|men|male|older|younger|minorities?|disabled|LGBTQ|religious|foreign[\s-]?born)\s+(?:are|tend|typically|generally|usually|often|naturally)\s+(?:less|worse|poorly|inferior|not\s+as\s+good|less\s+capable)",
    r"(?i)(?:should|must|need\s+to)\s+(?:only\s+)?hire\s+(?:candidates?|people|workers?)\s+(?:under|over|below)\s+\d+",
    r"(?i)(?:less\s+suitable|not\s+suitable|poor\s+(?:fit|cultural\s+fit)|don'?t\s+fit|doesn'?t\s+fit)",
    r"(?i)(?:lower|poorer|worse)\s+(?:productivity|performance|quality|ratings?|scores?)",
    r"(?i)(?:lack|lacking)\s+(?:the\s+)?(?:technical|mental|physical|emotional)\s+(?:depth|ability|capacity|skills?|strength)",
    r"(?i)(?:inherently|naturally|genetically)\s+(?:better|superior|more\s+capable|suited)",
    r"(?i)(?:cultural\s+fit|team\s+dynamic|sprint\s+velocity)\s+(?:issues?|problems?|concerns?)",
    r"(?i)reduce\s+(?:team|engineering)\s+efficiency",
    r"(?i)(?:demonstrates?|indicat(?:es?|ing))\s+(?:a\s+)?(?:lack\s+of|genuine\s+gap\s+in)",
]

REGULATORY_PATTERNS = [
    r"(?i)(?:confidential|proprietary|trade\s+secret|classified)",
    r"(?i)(?:do\s+not\s+share|not\s+for\s+(?:distribution|sharing)|restricted)",
    r"(?i)(?:insider\s+information|material\s+non[\s-]?public|MNPI)",
    r"(?i)(?:acquiring|acquisition|merger|takeover)\s+.*(?:for\s+\$|billion|million)",
    r"(?i)(?:board\s+of\s+directors|board\s+is\s+(?:considering|approving))",
    r"(?i)(?:revenue|earnings|profit|loss)\s+(?:was|were|of|is|are|totaled?)\s+\$",
    r"(?i)(?:don'?t|without|omits?|hides?|conceals?)\s+.*(?:mention|disclose|reveal)",
    r"(?i)(?:customer|client|user|personal)\s+(?:data|record|information)\s+(?:to|with)\s+(?:openai|chatgpt|claude|anthropic|gemini)",
]


def _has_match(text: str, patterns: list[str]) -> bool:
    return any(re.search(p, text) for p in patterns)


def classify_text(text: str, label: int) -> dict[str, bool]:
    """Classify a text row into multi-label categories."""
    cats = {c: False for c in ALL_CATS}

    if label == 0:
        cats["SAFE"] = True
        return cats

    # label=1 -> determine which sensitive category
    detected = []

    if _has_match(text, API_KEY_PATTERNS):
        detected.append("API_KEY")
    if _has_match(text, CREDENTIAL_PATTERNS):
        detected.append("CREDENTIALS")
    if _has_match(text, PII_PATTERNS):
        detected.append("PII")
    if _has_match(text, INJECTION_PATTERNS):
        detected.append("PROMPT_INJECTION")
    if _has_match(text, HALLUCINATION_PATTERNS):
        detected.append("HALLUCINATION")
    if _has_match(text, BIAS_PATTERNS):
        detected.append("BIAS")
    if _has_match(text, REGULATORY_PATTERNS):
        detected.append("REGULATORY")

    # Fallback: if no patterns matched but label=1, classify as PII (most common)
    if not detected:
        detected.append("PII")

    for cat in detected:
        cats[cat] = True

    return cats


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path = OUTPUT_DIR / "labeled_dataset.jsonl"

    records = []
    classify_stats = {c: 0 for c in ALL_CATS}

    # ── Load main CSV ─────────────────────────────────────────────────────
    print(f"  Reading {CSV_PATH.name}...")
    with CSV_PATH.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)  # skip header
        for row in reader:
            if len(row) < 2:
                continue
            text = row[0].strip()
            try:
                label = int(row[1].strip())
            except ValueError:
                continue
            if not text:
                continue

            cats = classify_text(text, label)
            records.append({"text": text, "labels": cats})
            for cat, val in cats.items():
                if val:
                    classify_stats[cat] += 1

    # ── Load augmented data (pre-classified JSONL preferred, else CSV) ────
    if AUG_JSONL.exists():
        print(f"  Reading pre-classified augmented data from {AUG_JSONL.name}...")
        with AUG_JSONL.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                records.append(rec)
                for cat, val in rec["labels"].items():
                    if val:
                        classify_stats[cat] += 1
    elif AUG_CSV.exists():
        print(f"  Reading augmented data from {AUG_CSV.name} (keyword classification)...")
        with AUG_CSV.open(encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)  # skip header
            for row in reader:
                if len(row) < 2:
                    continue
                text = row[0].strip()
                try:
                    label = int(row[1].strip())
                except ValueError:
                    continue
                if not text:
                    continue

                cats = classify_text(text, label)
                records.append({"text": text, "labels": cats})
                for cat, val in cats.items():
                    if val:
                        classify_stats[cat] += 1

    # ── Write JSONL ───────────────────────────────────────────────────────
    with output_path.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"\n  ✓ Wrote {len(records)} records → {output_path.relative_to(ROOT)}")
    print(f"\n  Category distribution:")
    for cat in ALL_CATS:
        n = classify_stats[cat]
        bar = "█" * (n // 20)
        print(f"    {cat:<22} {n:>5}  {bar}")

    # ── Also save splits for reference ────────────────────────────────────
    print(f"\n  Next step: python detection/ml/scripts/preprocess.py")


if __name__ == "__main__":
    main()
