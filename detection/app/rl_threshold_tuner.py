"""
Mistake-Only Threshold Tuner
============================
Reads FALSE POSITIVE corrections submitted by users and raises per-category
confidence thresholds so the model becomes less trigger-happy on those categories.

Only false positives (user said "not sensitive") are collected from the UI.
The model ONLY learns from its mistakes — not from confirmed correct detections.

Algorithm:
  - Count how often each category was flagged as a false positive
  - If FP rate for a category exceeds 30% → raise its threshold by LEARNING_RATE
  - Thresholds are bounded: [0.30, 0.95] per category
  - Requires MIN_SAMPLES FP reports per category before adjusting

Output:
  - detection/data/feedback/tuned_thresholds.json   (runtime override)
  - Loaded by MLClassifier at startup

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
MIN_SAMPLES      = 3      # Minimum FP reports needed before adjusting a category
FP_RATE_TRIGGER  = 0.30   # FP rate above this triggers a threshold increase


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
        Compute per-category false-positive counts.

        Only processes entries where user_correction == 'SAFE' — these are
        the mistakes the model made. Other corrections (FN, confirmed TP)
        are ignored since the UI no longer collects them.
        """
        stats: dict[str, dict] = defaultdict(lambda: {"fp": 0, "total": 0})

        for entry in feedback:
            predicted = entry.get("model_prediction", "").upper()
            corrected = entry.get("user_correction", "").upper()

            # Only count entries where user explicitly said "not sensitive"
            if corrected in ("SAFE", "") and predicted not in ("SAFE", ""):
                stats[predicted]["fp"] += 1
                stats[predicted]["total"] += 1

        return dict(stats)

    def compute_adjustments(
        self,
        stats: dict[str, dict],
        current_thresholds: dict[str, float],
    ) -> dict[str, dict]:
        """
        Raise thresholds for categories with too many false positives.
        Only upward adjustments are made — the model only learns from its mistakes.
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

            fp = cat_stats["fp"]
            fp_rate = fp / total
            current = current_thresholds.get(category, DEFAULT_THRESHOLDS.get(category, 0.55))
            adjustment = 0.0
            reason = "no_change"

            if fp_rate > FP_RATE_TRIGGER:
                # Too many false positives — raise threshold so the model is
                # less aggressive on this category in future
                adjustment = round(LEARNING_RATE * fp_rate, 4)
                reason = f"high_fp_rate ({fp_rate:.0%}, {fp}/{total} reports)"

            new_threshold = round(
                max(THRESHOLD_MIN, min(THRESHOLD_MAX, current + adjustment)),
                4
            )

            results[category] = {
                "current": current,
                "new": new_threshold,
                "adjustment": round(adjustment, 4),
                "reason": reason,
                "fp": cat_stats["fp"],
                "total": total,
                "fp_rate": round(fp_rate, 3),
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
        Full mistake-correction tuning run.
        Reads FP-only feedback and raises thresholds for over-triggering categories.

        Returns a dict with:
          - feedback_count: total FP corrections processed
          - stats: per-category FP counts
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
            print(f"  Mistake-Only Tuner — {len(feedback)} false-positive reports")
            print(f"{'='*60}")
            for cat, adj in sorted(adjustments.items()):
                arrow = "↑" if adj["adjustment"] > 0 else "→"
                print(f"  {cat:<18} {adj['current']:.3f} {arrow} {adj['new']:.3f}  ({adj['reason']})")
            if not adjustments:
                print("  No categories with enough false-positive reports yet.")
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
    parser = argparse.ArgumentParser(description="RL Threshold Tuner for Airlock")
    parser.add_argument("--apply", action="store_true", help="Apply threshold updates")
    parser.add_argument("--reset", action="store_true", help="Reset to default thresholds")
    args = parser.parse_args()

    tuner = RLThresholdTuner()

    if args.reset:
        tuner.reset_thresholds()
    else:
        tuner.run(apply=args.apply, verbose=True)
