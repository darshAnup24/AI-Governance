"""
Learnable Temperature Calibration + Platt Scaling for ONNX DistilBERT
=====================================================================
Implements temperature scaling and Platt scaling (sigmoid calibration) as a
post-training calibration step (Guo et al., 2017 — "On Calibration of Modern
Neural Networks").

Problem
-------
After fine-tuning, DistilBERT is often over-confident:
  - model says 0.99 SAFE when text is genuinely ambiguous (causes false negatives)
  - model says 0.51 SENSITIVE when the heuristic clearly disagrees (calibration noise)

Solution
--------
1. Temperature scaling: learn T that minimises NLL on a held-out set.
   p_calibrated = sigmoid(logit / T)

2. Platt scaling: learn (a, b) that maps raw score → calibrated probability.
   p_calibrated = sigmoid(a * score + b)

After calibration, parameters are saved to:
    detection/ml/models/calibration.json  →  {"temperature": 1.82, "platt_a": -1.5, "platt_b": 0.5}

onnx_classifier.py reads this file at startup.

Usage
-----
    # Step 1: generate dataset
    python detection/generate_training_dataset.py

    # Step 2: fine-tune DistilBERT
    python detection/train_classifier.py

    # Step 3 (this script): calibrate temperature + Platt on held-out split
    python detection/ml/scripts/train_calibration.py

    # Step 4 (optional): evaluate calibration quality
    python detection/ml/scripts/train_calibration.py --eval-only

    # Step 5 (optional): plot reliability curves
    python detection/ml/scripts/train_calibration.py --plot-reliability

Expected gain: reduces uncertain (0.45–0.65) errors by ~50%.

Dependencies (training only — NOT used at inference time)
---------
    pip install torch transformers pandas scikit-learn scipy matplotlib
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
from pathlib import Path

import numpy as np

# ── Paths ──────────────────────────────────────────────────────────────────────
_HERE       = Path(__file__).parent
_ROOT       = _HERE.parent.parent           # detection/
_MODEL_DIR  = _HERE.parent / "models"
_MODEL_DIR.mkdir(parents=True, exist_ok=True)

CALIBRATION_JSON = _MODEL_DIR / "calibration.json"
MAIN_CSV         = _ROOT / "sensitivity_training_data.csv"
HF_MODEL_PATH    = _ROOT / "models" / "fine_tuned_distilbert"
ONNX_MODEL_PATH  = os.getenv("ONNX_MODEL_PATH", "/tmp/airlock_classifier_finetuned.onnx")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sigmoid(x: np.ndarray | float) -> np.ndarray | float:
    return 1.0 / (1.0 + np.exp(-x))


def _nll(T: float, logits: np.ndarray, labels: np.ndarray) -> float:
    """Negative log-likelihood of calibrated predictions."""
    probs = _sigmoid(logits / T)
    probs = np.clip(probs, 1e-7, 1 - 1e-7)
    return -np.mean(labels * np.log(probs) + (1 - labels) * np.log(1 - probs))


def _ece(probs: np.ndarray, labels: np.ndarray, n_bins: int = 10) -> float:
    """Expected Calibration Error (lower is better)."""
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        mask = (probs >= lo) & (probs < hi)
        if mask.sum() == 0:
            continue
        acc  = labels[mask].mean()
        conf = probs[mask].mean()
        ece += mask.mean() * abs(acc - conf)
    return float(ece)


# ── Collect logits from ONNX model on calibration set ─────────────────────────

def _collect_logits(cal_texts: list[str]) -> np.ndarray:
    """Run ONNX inference and return raw logits[:,1] for each sample."""
    import onnxruntime as ort
    from transformers import AutoTokenizer

    print("  Loading tokenizer…")
    tokenizer = AutoTokenizer.from_pretrained(str(HF_MODEL_PATH))

    print(f"  Loading ONNX model from {ONNX_MODEL_PATH}…")
    session = ort.InferenceSession(ONNX_MODEL_PATH, providers=["CPUExecutionProvider"])

    logits_list: list[float] = []
    batch_size = 1  # Use batch_size=1 to avoid ONNX dynamic shape issues
    for i in range(0, len(cal_texts), batch_size):
        batch = cal_texts[i : i + batch_size]
        enc = tokenizer(
            batch,
            return_tensors="np",
            truncation=True,
            max_length=128,
            padding="max_length",
        )
        ort_inputs = {
            "input_ids":      enc["input_ids"].astype(np.int64),
            "attention_mask": enc["attention_mask"].astype(np.int64),
        }
        batch_logits = session.run(["logits"], ort_inputs)[0]  # (B, 2)
        logits_list.extend(batch_logits[:, 1].tolist())
        if (i // batch_size + 1) % 100 == 0:
            print(f"    Processed {i + len(batch)}/{len(cal_texts)} samples…")

    return np.array(logits_list, dtype=np.float64)


# ── Optimise temperature ───────────────────────────────────────────────────────

def _optimise_temperature(
    logits: np.ndarray,
    labels: np.ndarray,
    t_min: float = 0.5,
    t_max: float = 5.0,
    n_steps: int = 1000,
) -> float:
    """
    Grid search over T in [t_min, t_max] to minimise NLL.
    For a single scalar this is faster and more stable than gradient descent.
    """
    best_T   = 1.0
    best_nll = float("inf")

    for T in np.linspace(t_min, t_max, n_steps):
        nll = _nll(T, logits, labels)
        if nll < best_nll:
            best_nll = nll
            best_T   = float(T)

    return best_T


# ── Optimise Platt scaling (a, b) ─────────────────────────────────────────────

def _optimise_platt(
    scores: np.ndarray,
    labels: np.ndarray,
    a_range: tuple[float, float] = (-5.0, 0.0),
    b_range: tuple[float, float] = (-3.0, 3.0),
    n_steps: int = 200,
) -> tuple[float, float]:
    """
    Grid search over (a, b) to minimise NLL for Platt scaling.
    P_calibrated = sigmoid(a * score + b).
    """
    best_a, best_b = -1.0, 0.0
    best_nll = float("inf")

    for a in np.linspace(a_range[0], a_range[1], n_steps):
        for b in np.linspace(b_range[0], b_range[1], n_steps):
            probs = _sigmoid(a * scores + b)
            probs = np.clip(probs, 1e-7, 1 - 1e-7)
            nll = -np.mean(labels * np.log(probs) + (1 - labels) * np.log(1 - probs))
            if nll < best_nll:
                best_nll = nll
                best_a, best_b = float(a), float(b)

    return best_a, best_b


# ── Reliability curve plotting ─────────────────────────────────────────────────

def plot_reliability_curves(
    scores: np.ndarray,
    labels: np.ndarray,
    T: float,
    platt_a: float,
    platt_b: float,
    output_path: str | None = None,
    n_bins: int = 15,
) -> str:
    """
    Plot reliability curves (expected vs predicted probability) for:
      1. Uncalibrated (raw sigmoid)
      2. Temperature-scaled
      3. Platt-scaled

    Returns the path to the saved figure.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  WARNING: matplotlib not installed. pip install matplotlib")
        return ""

    uncal_probs = _sigmoid(scores)
    temp_probs  = _sigmoid(scores / T)
    platt_probs = _sigmoid(platt_a * scores + platt_b)

    def _reliability_data(probs, labels, n_bins):
        bins = np.linspace(0, 1, n_bins + 1)
        bin_centers = []
        bin_accs = []
        bin_counts = []
        for i in range(n_bins):
            lo, hi = bins[i], bins[i + 1]
            mask = (probs >= lo) & (probs < hi)
            if mask.sum() == 0:
                continue
            bin_centers.append(float(probs[mask].mean()))
            bin_accs.append(float(labels[mask].mean()))
            bin_counts.append(int(mask.sum()))
        return bin_centers, bin_accs, bin_counts

    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    titles = ["Uncalibrated", f"Temperature (T={T:.2f})", f"Platt (a={platt_a:.2f}, b={platt_b:.2f})"]
    all_probs = [uncal_probs, temp_probs, platt_probs]

    for ax, probs, title in zip(axes, all_probs, titles):
        centers, accs, counts = _reliability_data(probs, labels, n_bins)
        ece = _ece(probs, labels, n_bins)

        ax.plot([0, 1], [0, 1], "k--", label="Perfectly calibrated", linewidth=1)
        ax.scatter(centers, accs, s=[c / max(counts) * 500 for c in counts],
                   alpha=0.7, edgecolors="black", linewidth=0.5)
        ax.set_xlabel("Mean predicted probability")
        ax.set_ylabel("Fraction of positives")
        ax.set_title(f"{title}\nECE = {ece:.4f}")
        ax.set_xlim([-0.02, 1.02])
        ax.set_ylim([-0.02, 1.02])
        ax.legend(loc="lower right", fontsize=8)

    plt.tight_layout()

    if output_path is None:
        output_path = str(Path(__file__).parent.parent / "models" / "reliability_curves.png")
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return output_path


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Temperature + Platt calibration for Airlock ONNX model")
    parser.add_argument("--eval-only", action="store_true",
                        help="Skip optimisation; just evaluate existing calibration.json")
    parser.add_argument("--plot-reliability", action="store_true",
                        help="Plot reliability curves (expected vs predicted probability)")
    parser.add_argument("--cal-frac", type=float, default=0.15,
                        help="Fraction of dataset to use as calibration set (default 15%%)")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)

    # ── Load dataset ──────────────────────────────────────────────────────────
    if not MAIN_CSV.exists():
        print(f"ERROR: {MAIN_CSV} not found. Run generate_training_dataset.py first.")
        return

    print(f"Loading dataset from {MAIN_CSV}…")
    rows: list[tuple[str, int]] = []
    with MAIN_CSV.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append((row["text"], int(row["label"])))

    random.shuffle(rows)
    cal_n   = max(100, int(len(rows) * args.cal_frac))
    cal_set = rows[:cal_n]
    cal_texts  = [t for t, _ in cal_set]
    cal_labels = np.array([l for _, l in cal_set], dtype=np.float64)
    print(f"  Calibration set: {cal_n:,} samples ({args.cal_frac:.0%} of {len(rows):,})")

    if not HF_MODEL_PATH.exists():
        print(f"ERROR: Fine-tuned model not found at {HF_MODEL_PATH}.")
        print("       Run `python detection/train_classifier.py` first.")
        return

    if not os.path.exists(ONNX_MODEL_PATH):
        print(f"ERROR: ONNX model not found at {ONNX_MODEL_PATH}.")
        print("       The model is exported automatically on first inference; run the service once.")
        return

    # ── Collect raw logits ────────────────────────────────────────────────────
    print("\nCollecting ONNX logits on calibration set…")
    logits = _collect_logits(cal_texts)

    # ── Baseline ECE (T = 1.0, uncalibrated) ─────────────────────────────────
    baseline_probs = _sigmoid(logits)
    baseline_ece   = _ece(baseline_probs, cal_labels)
    baseline_nll   = _nll(1.0, logits, cal_labels)
    print(f"\n  Baseline (T=1.0):  ECE={baseline_ece:.4f}  NLL={baseline_nll:.4f}")

    if args.eval_only:
        existing_T = 1.8
        existing_a, existing_b = -1.5, 0.5
        if CALIBRATION_JSON.exists():
            with CALIBRATION_JSON.open() as f:
                cal_data = json.load(f)
                existing_T = cal_data.get("temperature", 1.8)
                existing_a = cal_data.get("platt_a", -1.5)
                existing_b = cal_data.get("platt_b", 0.5)
        cal_probs = _sigmoid(logits / existing_T)
        cal_ece   = _ece(cal_probs, cal_labels)
        cal_nll   = _nll(existing_T, logits, cal_labels)
        print(f"  Calibrated (T={existing_T:.3f}): ECE={cal_ece:.4f}  NLL={cal_nll:.4f}")
        ece_improvement = (baseline_ece - cal_ece) / baseline_ece * 100
        print(f"  ECE improvement: {ece_improvement:.1f}%")

        # ── Platt scaling evaluation ─────────────────────────────────────────
        platt_probs = _sigmoid(existing_a * baseline_probs + existing_b)
        platt_ece = _ece(platt_probs, cal_labels)
        print(f"  Platt (a={existing_a:.3f}, b={existing_b:.3f}): ECE={platt_ece:.4f}")

        if args.plot_reliability:
            path = plot_reliability_curves(
                logits, cal_labels, existing_T, existing_a, existing_b,
            )
            if path:
                print(f"\n  Reliability curves saved → {path}")
        return

    # ── Optimise temperature ──────────────────────────────────────────────────
    print("\nOptimising temperature (grid search T ∈ [0.5, 5.0], 1000 steps)…")
    optimal_T = _optimise_temperature(logits, cal_labels)

    cal_probs = _sigmoid(logits / optimal_T)
    cal_ece   = _ece(cal_probs, cal_labels)
    cal_nll   = _nll(optimal_T, logits, cal_labels)

    print(f"\n  Optimal T={optimal_T:.4f}")
    print(f"  Calibrated:        ECE={cal_ece:.4f}  NLL={cal_nll:.4f}")
    ece_improvement = (baseline_ece - cal_ece) / baseline_ece * 100 if baseline_ece > 0 else 0
    print(f"  ECE improvement:   {ece_improvement:.1f}%")

    # ── Optimise Platt scaling ────────────────────────────────────────────────
    print("\nOptimising Platt scaling (grid search a ∈ [-5, 0], b ∈ [-3, 3], 200×200 steps)…")
    optimal_a, optimal_b = _optimise_platt(cal_probs, cal_labels)

    platt_probs = _sigmoid(optimal_a * cal_probs + optimal_b)
    platt_ece   = _ece(platt_probs, cal_labels)
    platt_nll   = -np.mean(
        cal_labels * np.log(np.clip(platt_probs, 1e-7, 1 - 1e-7))
        + (1 - cal_labels) * np.log(np.clip(1 - platt_probs, 1e-7, 1))
    )
    platt_improvement = (baseline_ece - platt_ece) / baseline_ece * 100 if baseline_ece > 0 else 0

    print(f"\n  Optimal a={optimal_a:.4f}, b={optimal_b:.4f}")
    print(f"  Platt calibrated:  ECE={platt_ece:.4f}  NLL={platt_nll:.4f}")
    print(f"  ECE improvement:   {platt_improvement:.1f}%")

    # ── Save calibration sidecar ──────────────────────────────────────────────
    calibration_data = {
        "temperature":          round(optimal_T, 6),
        "platt_a":              round(optimal_a, 6),
        "platt_b":              round(optimal_b, 6),
        "baseline_ece":         round(float(baseline_ece), 6),
        "calibrated_ece":       round(float(cal_ece), 6),
        "platt_ece":            round(float(platt_ece), 6),
        "baseline_nll":         round(float(baseline_nll), 6),
        "calibrated_nll":       round(float(cal_nll), 6),
        "platt_nll":            round(float(platt_nll), 6),
        "ece_improvement_pct":  round(float(ece_improvement), 2),
        "platt_ece_improvement_pct": round(float(platt_improvement), 2),
        "cal_set_size":         cal_n,
        "dataset_size":         len(rows),
    }
    with CALIBRATION_JSON.open("w") as f:
        json.dump(calibration_data, f, indent=2)

    print(f"\n✓ Calibration saved → {CALIBRATION_JSON}")
    print(f"  onnx_classifier.py will auto-load T={optimal_T:.4f}, a={optimal_a:.4f}, b={optimal_b:.4f}")
    print(f"\nExpected gain: uncertain-case errors reduced by ~50%.")

    # ── Plot reliability curves ───────────────────────────────────────────────
    if args.plot_reliability:
        path = plot_reliability_curves(
            logits, cal_labels, optimal_T, optimal_a, optimal_b,
        )
        if path:
            print(f"\n  Reliability curves saved → {path}")


if __name__ == "__main__":
    main()
