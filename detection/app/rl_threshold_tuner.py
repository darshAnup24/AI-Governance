"""
RL Threshold Tuner
==================
Reads user feedback from FeedbackStore, computes per-category FP/FN rates,
and adjusts _DEFAULT_CAT_THRESHOLDS in ml_classifier.py accordingly.

Algorithm (bandit-style policy gradient):
  - If category has high FALSE POSITIVE rate → raise threshold (more conservative)
  - If category has high FALSE NEGATIVE rate → lower threshold (more sensitive)
  - Learning rate clips adjustments to ±0.05 per run to prevent oscillation
  - Thresholds are bounded: [0.30, 0.95] per category

Output:
  - detection/data/feedback/tuned_thresholds.json   (runtime override)
  - Loaded by MLClassifier at startup via sklearn_meta.json convention

Usage:
  python -m detection.app.rl_threshold_tuner          # dry run, print only
  python -m detection.app.rl_threshold_tuner --apply  # write tuned_thresholds.json
  python -m detection.app.rl_threshold_tuner --reset  # revert to defaults
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import defaultdict
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────

_THIS_DIR = Path(__file__).parent
_FEEDBACK_DIR = _THIS_DIR.parent / "data" / "feedback"
_TUNED_THRESHOLDS_FILE = _FEEDBACK_DIR / "tuned_thresholds.json"

# ── Default thresholds (mirrors ml_classifier._DEFAULT_CAT_THRESHOLDS) ────────

DEFAULT_THRESHOLDS: dict[str, float] = {
    "PII":              0.55,
    "BIAS":             0.55,
    "HALLUCINATION":    0.55,
    "REGULATORY":       0.80,
    "CREDENTIALS":      0.55,
    "PROMPT_INJECTION": 0.65,
    "SAFE":             0.50,
}

# ── Tuning constants ───────────────────────────────────────────────────────────

LEARNING_RATE    = 0.04   # Max threshold change per run
THRESHOLD_MIN    = 0.30   # Never go below this (safety floor)
THRESHOLD_MAX    = 0.95   # Never go above this (recall floor)
MIN_SAMPLES      = 3      # Minimum feedback samples to trust a category
FP_ADJUST_UP     = +LEARNING_RATE   # FP → raise threshold
FN_ADJUST_DOWN   = -LEARNING_RATE   # FN → lower threshold


# ── Core tuner ────────────────────────────────────────────────────────────────

class RLThresholdTuner:
    """
    Reads feedback from FeedbackStore JSONL files and computes threshold updates.
    """

    def __init__(self, feedback_dir: str | None = None):
        self.feedback_dir = Path(feedback_dir) if feedback_dir else _FEEDBACK_DIR
        self.feedback_file = self.feedback_dir / "user_feedback.jsonl"
        self.processed_file = self.feedback_dir / "processed_feedback.jsonl"
        self.tuned_file = _TUNED_THRESHOLDS_FILE

    def load_feedback(self) -> list[dict]:
        """Load all unprocessed feedback from JSONL file."""
        entries = []
        if not self.feedback_file.exists():
            logger.info("No feedback file found at %s", self.feedback_file)
            return entries
        with open(self.feedback_file) as f:
            for i, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    if entry.get("status") == "recorded":
                        entries.append(entry)
                except json.JSONDecodeError:
                    logger.warning("Skipping malformed feedback line %d", i)
        logger.info("Loaded %d unprocessed feedback entries", len(entries))
        return entries

    def load_current_thresholds(self) -> dict[str, float]:
        """Load currently active thresholds (tuned > defaults)."""
        if self.tuned_file.exists():
            try:
                data = json.loads(self.tuned_file.read_text())
                thresholds = data.get("thresholds", {})
                # Merge with defaults so new categories always have a value
                merged = dict(DEFAULT_THRESHOLDS)
                merged.update(thresholds)
                return merged
            except Exception as e:
                logger.warning("Could not read tuned thresholds: %s", e)
        return dict(DEFAULT_THRESHOLDS)

    def compute_stats(self, feedback: list[dict]) -> dict[str, dict]:
        """
        Compute per-category TP / FP / FN counts.

        - FP: model predicted category X, user said SAFE / different category
        - FN: model predicted SAFE, user said category X (or model missed it)
        - TP: model prediction matches user correction
        """
        stats: dict[str, dict] = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "total": 0})

        for entry in feedback:
            predicted = entry.get("model_prediction", "").upper()
            corrected = entry.get("user_correction", "").upper()

            if predicted == corrected:
                stats[predicted]["tp"] += 1
                stats[predicted]["total"] += 1
            elif corrected == "SAFE" or corrected == "":
                # Model fired, user says it's safe → False Positive
                stats[predicted]["fp"] += 1
                stats[predicted]["total"] += 1
            elif predicted == "SAFE" or predicted == "":
                # Model missed it, user says it IS a violation → False Negative
                stats[corrected]["fn"] += 1
                stats[corrected]["total"] += 1
            else:
                # Wrong category: FP for predicted, FN for corrected
                stats[predicted]["fp"] += 1
                stats[predicted]["total"] += 1
                stats[corrected]["fn"] += 1
                stats[corrected]["total"] += 1

        return dict(stats)

    def compute_adjustments(
        self,
        stats: dict[str, dict],
        current_thresholds: dict[str, float],
    ) -> dict[str, dict]:
        """
        Compute new thresholds from stats using a simple policy gradient:
          - High FP rate → raise threshold (be more conservative)
          - High FN rate → lower threshold (be more sensitive)
          - Mixed / insufficient data → no change
        """
        results = {}

        for category, cat_stats in stats.items():
            if category == "SAFE":
                continue

            total = cat_stats["total"]
            if total < MIN_SAMPLES:
                results[category] = {
                    "current": current_thresholds.get(category, DEFAULT_THRESHOLDS.get(category, 0.55)),
                    "new": current_thresholds.get(category, DEFAULT_THRESHOLDS.get(category, 0.55)),
                    "adjustment": 0.0,
                    "reason": f"insufficient_data (n={total}, need {MIN_SAMPLES})",
                    **cat_stats,
                }
                continue

            fp_rate = cat_stats["fp"] / total
            fn_rate = cat_stats["fn"] / total

            current = current_thresholds.get(category, DEFAULT_THRESHOLDS.get(category, 0.55))
            adjustment = 0.0
            reason = "no_change"

            if fp_rate > 0.3 and fn_rate < 0.1:
                # Too many false positives → raise threshold
                adjustment = FP_ADJUST_UP * fp_rate
                reason = f"high_fp_rate ({fp_rate:.0%})"
            elif fn_rate > 0.3 and fp_rate < 0.1:
                # Too many false negatives → lower threshold
                adjustment = FN_ADJUST_DOWN * fn_rate
                reason = f"high_fn_rate ({fn_rate:.0%})"
            elif fp_rate > 0.2 and fn_rate > 0.2:
                # Mixed signal — small nudge toward higher threshold (precision bias)
                adjustment = FP_ADJUST_UP * 0.5
                reason = f"mixed_signal (fp={fp_rate:.0%}, fn={fn_rate:.0%})"

            new_threshold = round(
                max(THRESHOLD_MIN, min(THRESHOLD_MAX, current + adjustment)),
                4
            )

            results[category] = {
                "current": current,
                "new": new_threshold,
                "adjustment": round(adjustment, 4),
                "reason": reason,
                "tp": cat_stats["tp"],
                "fp": cat_stats["fp"],
                "fn": cat_stats["fn"],
                "total": total,
                "fp_rate": round(fp_rate, 3),
                "fn_rate": round(fn_rate, 3),
            }

        return results

    def apply_thresholds(self, adjustments: dict[str, dict]) -> dict[str, float]:
        """Write updated thresholds to tuned_thresholds.json."""
        current = self.load_current_thresholds()
        updated = dict(current)

        for category, adj in adjustments.items():
            if adj.get("adjustment", 0.0) != 0.0:
                updated[category] = adj["new"]

        self.feedback_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "thresholds": updated,
            "defaults": DEFAULT_THRESHOLDS,
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "adjustments": adjustments,
        }
        self.tuned_file.write_text(json.dumps(payload, indent=2))
        logger.info("Wrote tuned thresholds to %s", self.tuned_file)
        return updated

    def reset_thresholds(self):
        """Remove tuned thresholds file — reverts to defaults."""
        if self.tuned_file.exists():
            self.tuned_file.unlink()
            logger.info("Removed tuned thresholds — reverted to defaults")
        else:
            logger.info("No tuned thresholds file found")

    def mark_feedback_processed(self, feedback: list[dict]):
        """Move processed entries to processed_feedback.jsonl."""
        processed_ids = {e["id"] for e in feedback if "id" in e}
        remaining = []

        if self.feedback_file.exists():
            with open(self.feedback_file) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                        if entry.get("id") in processed_ids:
                            entry["status"] = "processed"
                            with open(self.processed_file, "a") as pf:
                                pf.write(json.dumps(entry) + "\n")
                        else:
                            remaining.append(line)
                    except json.JSONDecodeError:
                        pass

        with open(self.feedback_file, "w") as f:
            for line in remaining:
                f.write(line + "\n")

        logger.info("Marked %d feedback entries as processed", len(processed_ids))

    def run(self, apply: bool = False, verbose: bool = True) -> dict:
        """
        Full RL tuning run.

        Returns a dict with:
          - feedback_count: total feedback processed
          - stats: per-category counts
          - adjustments: per-category threshold changes
          - new_thresholds: final threshold values
        """
        feedback = self.load_feedback()
        current_thresholds = self.load_current_thresholds()
        stats = self.compute_stats(feedback)
        adjustments = self.compute_adjustments(stats, current_thresholds)

        new_thresholds = current_thresholds.copy()
        if apply and feedback:
            new_thresholds = self.apply_thresholds(adjustments)
            self.mark_feedback_processed(feedback)

        if verbose:
            print(f"\n{'='*60}")
            print(f"  RL Threshold Tuner — {len(feedback)} feedback entries")
            print(f"{'='*60}")
            for cat, adj in sorted(adjustments.items()):
                arrow = "↑" if adj["adjustment"] > 0 else ("↓" if adj["adjustment"] < 0 else "→")
                print(f"  {cat:<18} {adj['current']:.3f} {arrow} {adj['new']:.3f}  ({adj['reason']})")
            if not adjustments:
                print("  No categories with enough feedback yet.")
            print(f"{'='*60}\n")

        return {
            "feedback_count": len(feedback),
            "stats": stats,
            "adjustments": adjustments,
            "new_thresholds": new_thresholds,
            "applied": apply and bool(feedback),
        }


# ── Entry point ────────────────────────────────────────────────────────────────

def load_tuned_thresholds() -> dict[str, float]:
    """
    Called by MLClassifier at startup to override default thresholds.
    Returns tuned thresholds if available, else DEFAULT_THRESHOLDS.
    """
    if _TUNED_THRESHOLDS_FILE.exists():
        try:
            data = json.loads(_TUNED_THRESHOLDS_FILE.read_text())
            return data.get("thresholds", DEFAULT_THRESHOLDS)
        except Exception:
            pass
    return DEFAULT_THRESHOLDS


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description="RL Threshold Tuner for ShieldAI")
    parser.add_argument("--apply", action="store_true", help="Apply threshold updates")
    parser.add_argument("--reset", action="store_true", help="Reset to default thresholds")
    args = parser.parse_args()

    tuner = RLThresholdTuner()

    if args.reset:
        tuner.reset_thresholds()
    else:
        tuner.run(apply=args.apply, verbose=True)
