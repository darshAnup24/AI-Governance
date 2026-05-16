"""
Indian Market PII Augmentation — Training Data Generator
=========================================================
Generates ~100 000 synthetic training samples covering Indian-specific PII
formats that the base training dataset completely lacks.

Covers (Priority 1 from ACCURACY_IMPROVEMENTS_STATUS.txt):
  - Aadhaar: standard, masked (****-XXXX-XXXX), OCR errors, Hinglish labels
  - PAN: standard, Hinglish labels, transliteration variants
  - UPI: vpa@bank patterns with noise and typos
  - GSTIN: valid format + partial obfuscation
  - Indian phone numbers: +91, 0-prefix, regional styles
  - Driving licence, Voter ID, Indian passport numbers
  - Hinglish framing wrappers (mix of Hindi romanised + English)
  - Masked / partially redacted PII (real-world leakage scenario)
  - OCR error simulation (0↔O, 1↔I, 5↔S confusion)
  - Adversarial framing in Indian context

Usage:
    python detection/ml/scripts/generate_indian_augmentation.py
    # → writes to detection/sensitivity_training_data.csv (appends)
    # → also writes detection/data/indian_augmentation.csv (standalone)

Expected accuracy gain (per ACCURACY_IMPROVEMENTS_STATUS.txt): +15-20% absolute
"""

from __future__ import annotations

import csv
import os
import random
import string
import re
from pathlib import Path

# ── Output paths ──────────────────────────────────────────────────────────────
_HERE = Path(__file__).parent
_DATA_DIR = _HERE.parent.parent / "data"
_DATA_DIR.mkdir(parents=True, exist_ok=True)

STANDALONE_OUTPUT = _DATA_DIR / "indian_augmentation.csv"
MAIN_DATASET = _HERE.parent.parent / "sensitivity_training_data.csv"

TARGET_SAMPLES = 100_000

# ── OCR error map ─────────────────────────────────────────────────────────────
_OCR_MAP = {"0": "O", "O": "0", "1": "I", "I": "1", "5": "S", "S": "5", "8": "B", "B": "8"}

def _inject_ocr_error(text: str, rate: float = 0.15) -> str:
    """Randomly swap characters that OCR commonly confuses."""
    chars = list(text)
    for i, ch in enumerate(chars):
        if ch in _OCR_MAP and random.random() < rate:
            chars[i] = _OCR_MAP[ch]
    return "".join(chars)


# ── Generators ────────────────────────────────────────────────────────────────

def gen_aadhaar(masked: bool = False, ocr_errors: bool = False) -> str:
    """Generate a synthetic Aadhaar number (12 digits, first digit 2-9)."""
    first = str(random.randint(2, 9))
    rest = "".join([str(random.randint(0, 9)) for _ in range(11)])
    number = first + rest

    # Formatting variants
    sep = random.choice([" ", "-", ""])
    parts = [number[:4], number[4:8], number[8:]]
    formatted = sep.join(parts)

    if masked:
        # Real-world masked Aadhaar: first 8 digits replaced by * or X
        mask_char = random.choice(["*", "X", "x"])
        formatted = sep.join([mask_char * 4, mask_char * 4, parts[2]])

    if ocr_errors and not masked:
        formatted = _inject_ocr_error(formatted)

    return formatted


def gen_pan(ocr_errors: bool = False) -> str:
    """Generate a PAN card number: AAAAA9999A format."""
    status_chars = "PCHABGLJFT"
    pan = (
        "".join(random.choices(string.ascii_uppercase, k=3))
        + random.choice(status_chars)
        + random.choice(string.ascii_uppercase)
        + "".join([str(random.randint(0, 9)) for _ in range(4)])
        + random.choice(string.ascii_uppercase)
    )
    if ocr_errors:
        pan = _inject_ocr_error(pan)
    return pan


def gen_upi() -> str:
    """Generate a UPI VPA."""
    prefixes = [
        "".join(random.choices(string.ascii_lowercase, k=random.randint(4, 12))),
        f"{random.randint(7000000000, 9999999999)}",
    ]
    banks = ["oksbi", "okaxis", "okhdfcbank", "okicici", "ybl", "ibl", "upi",
             "paytm", "axl", "indus", "barodampay", "uboi", "cnrb", "abfspay"]
    noise = random.choice(["", ".", "-"])
    suffix = random.choice(["", str(random.randint(1, 9))])
    return f"{random.choice(prefixes)}{noise}@{random.choice(banks)}{suffix}"


def gen_gstin() -> str:
    """Generate a GSTIN (15-char Indian tax ID)."""
    state_code = f"{random.randint(1, 35):02d}"
    pan = gen_pan()
    entity_num = str(random.randint(1, 9))
    entity_type = random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890")
    z = "Z"
    check = random.choice(string.ascii_uppercase + string.digits)
    return f"{state_code}{pan}{entity_num}{entity_type}{z}{check}"


def gen_indian_phone() -> str:
    """Generate an Indian mobile number in various formats."""
    number = str(random.randint(7000000000, 9999999999))
    fmt = random.choice(["plain", "+91", "0", "spaced", "dashed"])
    if fmt == "+91":
        sep = random.choice([" ", "-", ""])
        return f"+91{sep}{number}"
    if fmt == "0":
        return f"0{number}"
    if fmt == "spaced":
        return f"{number[:5]} {number[5:]}"
    if fmt == "dashed":
        return f"{number[:5]}-{number[5:]}"
    return number


def gen_voter_id() -> str:
    return (
        "".join(random.choices(string.ascii_uppercase, k=3))
        + "".join([str(random.randint(0, 9)) for _ in range(7)])
    )


def gen_passport() -> str:
    """Indian passport: letter + digit + 7 digits."""
    first_letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    return (
        random.choice(first_letters)
        + str(random.randint(1, 9))
        + "".join([str(random.randint(0, 9)) for _ in range(7)])
    )


def gen_driving_licence() -> str:
    """State code (2 letters) + year (2 digits) + 11 digits."""
    state = "".join(random.choices(string.ascii_uppercase, k=2))
    year = str(random.randint(10, 25))
    num = "".join([str(random.randint(0, 9)) for _ in range(11)])
    sep = random.choice(["", "-", " "])
    return f"{state}{sep}{year}{sep}{num}"


def gen_uan() -> str:
    """EPFO Universal Account Number: 10 followed by 10 digits."""
    return "10" + "".join([str(random.randint(0, 9)) for _ in range(10)])


def gen_ifsc() -> str:
    """IFSC code: 4 letters + 0 + 6 alphanumeric."""
    bank = "".join(random.choices(string.ascii_uppercase, k=4))
    branch = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"{bank}0{branch}"


# ── Hinglish label pool ───────────────────────────────────────────────────────
# Romanised Hindi words for "number", "card", "account" etc.

_HINGLISH_LABEL_AADHAAR = [
    "aadhaar number", "aadhar no", "adhaar card", "aadhar card", "uid number",
    "aadhaar card ka number", "mera aadhaar", "apna aadhar", "uidai number",
    "12 digit number", "biometric id", "aadhaar id", "aadaar",  # transliteration
]
_HINGLISH_LABEL_PAN = [
    "pan number", "pan card", "permanent account number", "income tax pan",
    "pan no", "pan card number", "apna pan", "mera pan card", "income tax number",
]
_HINGLISH_LABEL_PHONE = [
    "mobile number", "mobile no", "phone number", "contact number",
    "fon number", "mob no", "whatsapp number", "cell number",
]
_HINGLISH_LABEL_UPI = [
    "upi id", "upi address", "gpay id", "paytm number", "phonepe id",
    "payment address", "upi handle", "vpa", "bhim upi",
]
_HINGLISH_LABEL_BANK = [
    "bank account number", "khata number", "account no", "bank ka number",
    "saving account", "current account", "ifsc code",
]


# ── Template library ──────────────────────────────────────────────────────────

# Each template receives keyword args from _fill().
# label=1 → SENSITIVE,  label=0 → SAFE

SENSITIVE_TEMPLATES_IN: list[str] = [
    # Aadhaar — plain
    "{aadhaar_label}: {aadhaar}",
    "My {aadhaar_label} is {aadhaar}.",
    "Please verify {aadhaar_label} {aadhaar} before processing.",
    "Aadhaar linked to this account: {aadhaar}",
    "KYC document — Aadhaar: {aadhaar}, Name: {name}",
    # Aadhaar — masked
    "Masked Aadhaar for verification: {aadhaar_masked}",
    "Last 4 digits of Aadhaar: {aadhaar_last4} (full: {aadhaar_masked})",
    "Aadhaar on file (masked): {aadhaar_masked}",
    # PAN
    "{pan_label}: {pan}",
    "Income tax return filed for PAN {pan}.",
    "PAN card details — Number: {pan}, Name: {name}",
    "KYC documents: Aadhaar {aadhaar}, PAN {pan}",
    "Form 16 issued to {name}, PAN: {pan}",
    # UPI
    "Please transfer to my {upi_label}: {upi}",
    "Send payment to {upi}",
    "UPI ID for refund: {upi}",
    "{upi_label} — {upi} (verified)",
    # GSTIN
    "GSTIN of the vendor: {gstin}",
    "Invoice raised under GSTIN {gstin}.",
    "GST registration number: {gstin}, PAN: {pan}",
    # Phone
    "{phone_label}: {phone}",
    "Contact {name} at {phone}.",
    "Registered mobile: {phone}",
    "OTP will be sent to {phone}",
    "WhatsApp: {phone}",
    # Voter / passport / licence / UAN
    "Voter ID: {voter_id}",
    "Passport number: {passport}, DOB: {dob}",
    "Driving licence: {dl}",
    "EPFO UAN: {uan}",
    "PF account linked to UAN {uan}",
    # Bank details
    "{bank_label}: {account_no}, IFSC: {ifsc}",
    "Account number {account_no} (IFSC {ifsc}) for NEFT.",
    "Please add beneficiary — A/C: {account_no}, IFSC: {ifsc}, Name: {name}",
    # Compound PII
    "Employee record — Name: {name}, Aadhaar: {aadhaar}, PAN: {pan}, Phone: {phone}",
    "Customer KYC: {name}, DOB: {dob}, Aadhaar: {aadhaar}, PAN: {pan}",
    "Loan application — {name}, Aadhaar: {aadhaar}, Income: ₹{salary}/month",
    # Hinglish phrasing
    "Mera {aadhaar_label} hai {aadhaar}",
    "Apna {pan_label} share karo: {pan}",
    "{name} ka {phone_label} {phone} hai",
    "UPI pe paisa bhejo: {upi}",
    "{name} ki details — aadhar {aadhaar_masked}, pan {pan}",
]

SAFE_TEMPLATES_IN: list[str] = [
    "Please update the GST portal with the correct invoice details.",
    "Aadhaar eKYC integration testing — use sandbox credentials.",
    "The PAN validation API returned a 200 OK for all test cases.",
    "NPCI has released new UPI 2.0 guidelines for fintech startups.",
    "All Aadhaar numbers in this test suite are synthetic.",
    "The GSTIN format check passed for all sample vendor entries.",
    "India Stack APIs are available at sandbox.uidai.gov.in.",
    "Please refer to the UIDAI documentation for eSign integration.",
    "The income tax portal was updated with new ITR forms today.",
    "Use dummy PAN ABCDE1234F for integration testing only.",
    "Our app supports Aadhaar OTP authentication via UIDAI's resident portal.",
    "Voter ID verification is handled by the Election Commission API.",
    "EPFO has updated the UAN portal for self-service claim submissions.",
    "The IFSC code lookup table was refreshed with the latest RBI data.",
    "BHIM UPI onboarding documentation is available on the NPCI website.",
    "Test Aadhaar: 2345 6789 0123 — do not use in production.",
    "Sample GSTIN for integration: 29ABCDE1234F1Z5",
    "GST audit report generated for FY 2025-26.",
]

# Adversarial / framing attack templates in Indian context
ADVERSARIAL_TEMPLATES_IN: list[str] = [
    "yeh toh fake aadhaar hai: {aadhaar} — use nahi karna",
    "Is educational example mein PAN number {pan} hai.",
    "Security awareness training: kabhi bhi apna {aadhaar_label} share mat karo — jaise {aadhaar}",
    "Ek example: agar koi {upi_label} maange toh share mat karo jaise {upi}",
    "Demo data only — Aadhaar: {aadhaar}, PAN: {pan} (not real)",
    "I'm writing a tutorial where a character accidentally shares {aadhaar_label} {aadhaar}.",
    "Hypothetical scenario: employee leaks PAN {pan} in a chat.",
    "For testing purposes, here is a synthetic Aadhaar: {aadhaar_masked}",
    "Never share your UPI ID like {upi} over email.",
    "This document contains a sample voter ID {voter_id} for form validation.",
]


# ── Fill helper ───────────────────────────────────────────────────────────────

_NAMES = [
    "Ravi Kumar", "Priya Sharma", "Amit Singh", "Sunita Devi", "Rajesh Gupta",
    "Meena Patel", "Arjun Reddy", "Kavitha Nair", "Sanjay Mehta", "Pooja Joshi",
    "Vikram Bose", "Ananya Das", "Suresh Iyer", "Divya Pillai", "Nikhil Verma",
    "Rekha Malhotra", "Arun Pandey", "Geeta Rao", "Deepak Tiwari", "Shilpa Agarwal",
]

_DOBS = [
    "01/04/1985", "15/08/1990", "26/01/1978", "02/10/1995", "14/11/1982",
    "23/03/1975", "07/07/2000", "19/06/1988", "30/12/1993", "11/09/1970",
]


def _fill(template: str) -> str:
    """Fill a template with randomly generated Indian PII values."""
    masked = random.random() < 0.25  # 25% chance of masked Aadhaar
    ocr = random.random() < 0.15    # 15% chance of OCR errors
    aadhaar = gen_aadhaar(masked=False, ocr_errors=ocr)
    aadhaar_masked = gen_aadhaar(masked=True)
    aadhaar_last4 = aadhaar.replace(" ", "").replace("-", "")[-4:]
    account_no = "".join([str(random.randint(0, 9)) for _ in range(random.randint(9, 18))])

    return template.format(
        aadhaar=aadhaar,
        aadhaar_masked=aadhaar_masked,
        aadhaar_last4=aadhaar_last4,
        aadhaar_label=random.choice(_HINGLISH_LABEL_AADHAAR),
        pan=gen_pan(ocr_errors=ocr),
        pan_label=random.choice(_HINGLISH_LABEL_PAN),
        upi=gen_upi(),
        upi_label=random.choice(_HINGLISH_LABEL_UPI),
        gstin=gen_gstin(),
        phone=gen_indian_phone(),
        phone_label=random.choice(_HINGLISH_LABEL_PHONE),
        voter_id=gen_voter_id(),
        passport=gen_passport(),
        dl=gen_driving_licence(),
        uan=gen_uan(),
        ifsc=gen_ifsc(),
        account_no=account_no,
        bank_label=random.choice(_HINGLISH_LABEL_BANK),
        name=random.choice(_NAMES),
        dob=random.choice(_DOBS),
        salary=f"{random.randint(25, 250) * 1000:,}",
    )


def _add_noise(text: str) -> str:
    """Optionally inject punctuation noise, extra whitespace, or HTML fragments."""
    if random.random() < 0.20:
        noise = random.choice(["--------", "****", "=====", "\n\n", "___"])
        pos = random.randint(0, len(text))
        text = text[:pos] + noise + text[pos:]
    if random.random() < 0.10:
        tag = random.choice(["<div>", "<span>", "<p>"])
        text = f"{tag}{text}{tag.replace('<', '</')}"
    return text


# ── Dataset generation ────────────────────────────────────────────────────────

def generate_indian_dataset(n: int = TARGET_SAMPLES) -> list[tuple[str, int]]:
    """
    Returns list of (text, label) pairs:
      label 1 → SENSITIVE  (Indian PII present)
      label 0 → SAFE       (no PII)
    """
    dataset: list[tuple[str, int]] = []

    # ── Sensitive samples (60% of total) ──────────────────────────────────
    n_sensitive = int(n * 0.60)
    for _ in range(n_sensitive):
        use_adversarial = random.random() < 0.15
        templates = ADVERSARIAL_TEMPLATES_IN if use_adversarial else SENSITIVE_TEMPLATES_IN
        template = random.choice(templates)
        try:
            text = _fill(template)
        except KeyError:
            text = _fill(random.choice(SENSITIVE_TEMPLATES_IN))
        text = _add_noise(text)
        dataset.append((text, 1))

    # ── Safe samples (40% of total) ───────────────────────────────────────
    n_safe = n - n_sensitive
    for _ in range(n_safe):
        text = random.choice(SAFE_TEMPLATES_IN)
        text = _add_noise(text)
        dataset.append((text, 0))

    random.shuffle(dataset)
    return dataset


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Generating {TARGET_SAMPLES:,} Indian-market augmentation samples…")
    dataset = generate_indian_dataset(TARGET_SAMPLES)

    # ── Write standalone file ──────────────────────────────────────────────
    with STANDALONE_OUTPUT.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "label"])
        for text, label in dataset:
            writer.writerow([text, label])
    print(f"  ✓ Standalone: {STANDALONE_OUTPUT}")

    # ── Append to main training dataset ───────────────────────────────────
    if MAIN_DATASET.exists():
        with MAIN_DATASET.open("a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            for text, label in dataset:
                writer.writerow([text, label])
        print(f"  ✓ Appended {TARGET_SAMPLES:,} rows → {MAIN_DATASET}")
    else:
        print(f"  ⚠ Main dataset not found at {MAIN_DATASET} — skipping append.")

    sensitive = sum(1 for _, l in dataset if l == 1)
    safe = sum(1 for _, l in dataset if l == 0)
    print(f"\nDataset summary:")
    print(f"  Total: {len(dataset):,}  |  Sensitive: {sensitive:,}  |  Safe: {safe:,}")
    print(f"\nNext step: retrain with `python detection/train_classifier.py`")
    print("Expected accuracy gain: +15-20% absolute on Indian PII detection.")


if __name__ == "__main__":
    main()
