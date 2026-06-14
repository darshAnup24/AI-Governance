"""
Merge augmented minority-class data into the main training CSV.

Usage:
    python detection/ml/scripts/merge_augmented.py

Appends rows from minority_class_augmented_clean.csv to sensitivity_training_data.csv
and prints the new class distribution.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent  # detection/
MAIN_CSV = ROOT / "sensitivity_training_data.csv"
AUG_CSV = ROOT / "ml" / "data" / "augmented" / "minority_class_augmented_clean.csv"


def main() -> None:
    if not MAIN_CSV.exists():
        print(f"❌ Main CSV not found: {MAIN_CSV}")
        sys.exit(1)
    if not AUG_CSV.exists():
        print(f"❌ Augmented CSV not found: {AUG_CSV}")
        sys.exit(1)

    # Read existing rows
    with MAIN_CSV.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        existing = list(reader)

    existing_count = len(existing)
    existing_pos = sum(1 for r in existing if len(r) >= 2 and r[1] == "1")
    existing_neg = sum(1 for r in existing if len(r) >= 2 and r[1] == "0")

    print(f"  Existing: {existing_count} rows ({existing_pos} positive, {existing_neg} negative)")

    # Read augmented rows
    with AUG_CSV.open(encoding="utf-8") as f:
        reader = csv.reader(f)
        aug_header = next(reader)  # skip header
        augmented = list(reader)

    aug_count = len(augmented)
    aug_pos = sum(1 for r in augmented if len(r) >= 2 and r[1] == "1")
    print(f"  Augmented: {aug_count} rows ({aug_pos} positive)")

    # Merge
    all_rows = existing + augmented
    total = len(all_rows)

    with MAIN_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(all_rows)

    new_pos = sum(1 for r in all_rows if len(r) >= 2 and r[1] == "1")
    new_neg = sum(1 for r in all_rows if len(r) >= 2 and r[1] == "0")

    print(f"\n  ✓ Merged: {total} rows ({new_pos} positive, {new_neg} negative)")
    print(f"  Added {aug_count} new positive examples")
    print(f"  Positive ratio: {new_pos / total:.1%} (was {existing_pos / existing_count:.1%})")


if __name__ == "__main__":
    main()
