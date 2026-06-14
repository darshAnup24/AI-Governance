"""
Threshold Optimization for 5-Action Detection System
=====================================================
Uses Optuna (or scipy.optimize fallback) to find optimal ALLOW/LOG/WARN/REDACT/BLOCK
threshold boundaries that maximise: F1*0.5 + Precision*0.3 + Recall*0.2.

Also computes per-category threshold adjustments based on category-specific
Precision/Recall metrics.

Usage:
    python detection/ml/scripts/optimize_thresholds.py [--trials 200] [--plot]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from proxy.app.models import DetectionCategory, ActionType

# ─── Paths ─────────────────────────────────────────────────────────────────────
_SCRIPT_DIR = Path(__file__).parent
_CONFIG_DIR = _SCRIPT_DIR.parent / "config"
_OUTPUT_JSON = _SCRIPT_DIR.parent / "models" / "optimized_thresholds.json"
_HEATMAP_PATH = _SCRIPT_DIR.parent / "models" / "threshold_heatmap.png"


# ─── Load test results from accuracy_eval harness ──────────────────────────────

def _load_test_results() -> list[dict[str, Any]]:
    """Run accuracy_eval and collect per-case results."""
    from tests.accuracy_eval import get_test_cases, evaluate_case, _run_detectors
    from tests.sample_feed_runner import SAMPLES
    from detection.app.regex_detector import RegexDetector
    from detection.app.risk_scorer import RiskScoreAggregator

    try:
        from tests.test_cases_extended import EXTENDED_SAMPLES
    except ImportError:
        EXTENDED_SAMPLES = []

    regex_det = RegexDetector()
    aggregator = RiskScoreAggregator()

    # Try loading optional detectors
    detectors: dict[str, Any] = {"regex": regex_det.detect}
    try:
        from detection.app.ner_detector import DebertaNERDetector
        detectors["ner"] = DebertaNERDetector().detect
    except Exception:
        pass
    try:
        from detection.app.ml_classifier import MLClassifier
        ml = MLClassifier()
        if ml.is_loaded:
            detectors["ml_classifier"] = ml.detect
    except Exception:
        pass
    try:
        from detection.app.detectors.prompt_injection_detector import PromptInjectionDetector
        detectors["prompt_injection"] = PromptInjectionDetector().detect
    except Exception:
        pass
    try:
        from detection.app.detectors.regulatory_detector import RegulatoryDetector
        detectors["regulatory"] = RegulatoryDetector().detect
    except Exception:
        pass
    try:
        from detection.app.detectors.bias_detector import BiasDetector
        detectors["bias"] = BiasDetector().detect
    except Exception:
        pass
    try:
        from detection.app.detectors.hallucination_detector import HallucinationDetector
        detectors["hallucination"] = HallucinationDetector().detect
    except Exception:
        pass
    try:
        from detection.app.detectors.security_code_detector import SecurityCodeDetector
        detectors["security_code"] = SecurityCodeDetector().detect
    except Exception:
        pass

    test_cases = get_test_cases(count=2000)
    results = []
    for case in test_cases:
        cr = evaluate_case(case, detectors, aggregator)
        results.append({
            "name": cr.name,
            "expected": cr.expected,
            "predicted": cr.predicted,
            "risk_score": cr.risk_score,
            "action": cr.action,
            "expect_safe": cr.expect_safe,
        })
    return results


# ─── Metric computation ────────────────────────────────────────────────────────

def _safe_div(num: float, denom: float) -> float:
    return num / denom if denom else 0.0


def compute_metrics(results: list[dict], warn_thr: int, redact_thr: int, block_thr: int):
    """Compute per-category and aggregate metrics for given thresholds.

    Thresholds are score boundaries (0-100):
        ALLOW:  [0, warn_thr)
        LOG:    [warn_thr, redact_thr)
        WARN:   [redact_thr, block_thr)
        REDACT: [block_thr, 100]
        BLOCK:  [100] (handled by escalation, not score)
    """
    # Remap actions based on new thresholds
    def remap_action(score: int, orig_action: str) -> str:
        if score >= block_thr:
            return "BLOCK"
        if score >= redact_thr:
            return "REDACT"
        if score >= warn_thr:
            return "WARN"
        if score >= 30:
            return "LOG"
        return "ALLOW"

    # Per-category TP/FP/FN
    all_cats: set[str] = set()
    for r in results:
        all_cats |= r["expected"] | r["predicted"]

    cat_metrics: dict[str, dict] = {}
    for cat in sorted(all_cats):
        tp = sum(1 for r in results if cat in r["expected"] and cat in r["predicted"])
        fp = sum(1 for r in results if cat not in r["expected"] and cat in r["predicted"])
        fn = sum(1 for r in results if cat in r["expected"] and cat not in r["predicted"])
        support = sum(1 for r in results if cat in r["expected"])

        p = _safe_div(tp, tp + fp)
        r = _safe_div(tp, tp + fn)
        f1 = _safe_div(2 * p * r, p + r)

        cat_metrics[cat] = {
            "tp": tp, "fp": fp, "fn": fn, "support": support,
            "precision": p, "recall": r, "f1": f1,
        }

    # Aggregate micro metrics
    tp_total = sum(m["tp"] for m in cat_metrics.values())
    fp_total = sum(m["fp"] for m in cat_metrics.values())
    fn_total = sum(m["fn"] for m in cat_metrics.values())
    micro_p = _safe_div(tp_total, tp_total + fp_total)
    micro_r = _safe_div(tp_total, tp_total + fn_total)
    micro_f1 = _safe_div(2 * micro_p * micro_r, micro_p + micro_r)

    # Weighted objective: F1*0.5 + Precision*0.3 + Recall*0.2
    objective = micro_f1 * 0.5 + micro_p * 0.3 + micro_r * 0.2

    return {
        "micro_precision": micro_p,
        "micro_recall": micro_r,
        "micro_f1": micro_f1,
        "objective": objective,
        "per_category": cat_metrics,
    }


# ─── Optuna optimization ──────────────────────────────────────────────────────

def _optimize_with_optuna(results: list[dict], n_trials: int) -> dict[str, Any]:
    """Use Optuna for threshold search."""
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    def objective(trial):
        warn_thr = trial.suggest_int("warn_thr", 40, 70)
        redact_thr = trial.suggest_int("redact_thr", 75, 90)
        block_thr = trial.suggest_int("block_thr", 88, 97)

        if warn_thr >= redact_thr or redact_thr >= block_thr:
            return -1.0

        metrics = compute_metrics(results, warn_thr, redact_thr, block_thr)
        return metrics["objective"]

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=n_trials, show_progress_bar=True)

    best = study.best_params
    return {
        "warn_thr": best["warn_thr"],
        "redact_thr": best["redact_thr"],
        "block_thr": best["block_thr"],
        "objective_value": study.best_value,
        "n_trials": n_trials,
        "method": "optuna",
    }


# ─── scipy.optimize fallback ──────────────────────────────────────────────────

def _optimize_with_scipy(results: list[dict], n_trials: int) -> dict[str, Any]:
    """Use scipy.optimize.differential_evolution for threshold search."""
    from scipy.optimize import differential_evolution

    bounds = [(40, 70), (75, 90), (88, 97)]

    def neg_objective(params):
        warn_thr, redact_thr, block_thr = int(params[0]), int(params[1]), int(params[2])
        if warn_thr >= redact_thr or redact_thr >= block_thr:
            return 0.0
        metrics = compute_metrics(results, warn_thr, redact_thr, block_thr)
        return -metrics["objective"]

    result = differential_evolution(
        neg_objective, bounds, maxiter=n_trials, seed=42, tol=1e-6,
    )

    warn_thr, redact_thr, block_thr = [int(x) for x in result.x]
    metrics = compute_metrics(results, warn_thr, redact_thr, block_thr)

    return {
        "warn_thr": warn_thr,
        "redact_thr": redact_thr,
        "block_thr": block_thr,
        "objective_value": metrics["objective"],
        "n_trials": n_trials,
        "method": "scipy_differential_evolution",
    }


# ─── Per-category threshold adjustment ────────────────────────────────────────

def compute_category_thresholds(
    cat_metrics: dict[str, dict],
    global_warn: int,
    global_redact: int,
    global_block: int,
) -> dict[str, dict[str, Any]]:
    """Compute per-category threshold overrides based on Precision/Recall.

    Rules:
        - Precision < 0.6 (too many FPs) → increase block_thr by +5
        - Recall < 0.65 (missing too many) → decrease warn_thr by -5

    Returns dict of {category: {warn, redact, block, reason}}.
    """
    category_thresholds: dict[str, dict[str, Any]] = {}

    for cat, m in cat_metrics.items():
        warn = global_warn
        redact = global_redact
        block = global_block
        reasons = []

        if m["precision"] < 0.6 and m["support"] > 5:
            block = min(97, block + 5)
            reasons.append(f"precision={m['precision']:.3f}<0.6 → block+5")

        if m["recall"] < 0.65 and m["support"] > 5:
            warn = max(30, warn - 5)
            reasons.append(f"recall={m['recall']:.3f}<0.65 → warn-5")

        # Critical categories get extra safety margin
        critical_cats = {"API_KEY", "CREDENTIALS", "SECURITY_VULN", "PROMPT_INJECTION", "REGULATORY"}
        if cat in critical_cats and block < 93:
            block = 93
            reasons.append(f"critical category → block floor 93")

        category_thresholds[cat] = {
            "warn": warn,
            "redact": redact,
            "block": block,
            "precision": round(m["precision"], 4),
            "recall": round(m["recall"], 4),
            "f1": round(m["f1"], 4),
            "support": m["support"],
            "reasons": reasons,
        }

    return category_thresholds


# ─── Heatmap plotting ─────────────────────────────────────────────────────────

def plot_heatmap(results: list[dict], output_path: str | None = None):
    """Plot F1 vs WARN/REDACT boundary positions."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("  WARNING: matplotlib not installed. pip install matplotlib")
        return

    warn_range = range(40, 71, 3)
    redact_range = range(75, 91, 3)
    block_fixed = 93

    f1_grid = np.zeros((len(warn_range), len(redact_range)))
    obj_grid = np.zeros((len(warn_range), len(redact_range)))

    for i, w in enumerate(warn_range):
        for j, r in enumerate(redact_range):
            if w >= r:
                f1_grid[i, j] = 0.0
                obj_grid[i, j] = 0.0
                continue
            m = compute_metrics(results, w, r, block_fixed)
            f1_grid[i, j] = m["micro_f1"]
            obj_grid[i, j] = m["objective"]

    fig, axes = plt.subplots(1, 2, figsize=(16, 6))

    # F1 heatmap
    im0 = axes[0].imshow(f1_grid, aspect="auto", origin="lower",
                          cmap="YlOrRd", vmin=0.4, vmax=1.0)
    axes[0].set_xticks(range(0, len(redact_range), 2))
    axes[0].set_xticklabels([str(r) for r in list(redact_range)[::2]])
    axes[0].set_yticks(range(0, len(warn_range), 2))
    axes[0].set_yticklabels([str(w) for w in list(warn_range)[::2]])
    axes[0].set_xlabel("REDACT Threshold")
    axes[0].set_ylabel("WARN Threshold")
    axes[0].set_title(f"Micro F1 (BLOCK={block_fixed})")
    plt.colorbar(im0, ax=axes[0])

    # Objective heatmap
    im1 = axes[1].imshow(obj_grid, aspect="auto", origin="lower",
                          cmap="YlOrRd", vmin=0.4, vmax=1.0)
    axes[1].set_xticks(range(0, len(redact_range), 2))
    axes[1].set_xticklabels([str(r) for r in list(redact_range)[::2]])
    axes[1].set_yticks(range(0, len(warn_range), 2))
    axes[1].set_yticklabels([str(w) for w in list(warn_range)[::2]])
    axes[1].set_xlabel("REDACT Threshold")
    axes[1].set_ylabel("WARN Threshold")
    axes[1].set_title("Weighted Objective (F1×0.5 + P×0.3 + R×0.2)")
    plt.colorbar(im1, ax=axes[1])

    plt.tight_layout()
    path = output_path or str(_HEATMAP_PATH)
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"  Heatmap saved → {path}")


# ─── Save thresholds ──────────────────────────────────────────────────────────

def save_thresholds(
    global_thresholds: dict[str, int],
    category_thresholds: dict[str, dict],
    metrics_before: dict,
    metrics_after: dict,
):
    """Save optimized thresholds to JSON and update config.py."""
    output = {
        "global": global_thresholds,
        "per_category": category_thresholds,
        "metrics_before": {
            "micro_precision": round(metrics_before["micro_precision"], 4),
            "micro_recall": round(metrics_before["micro_recall"], 4),
            "micro_f1": round(metrics_before["micro_f1"], 4),
            "objective": round(metrics_before["objective"], 4),
        },
        "metrics_after": {
            "micro_precision": round(metrics_after["micro_precision"], 4),
            "micro_recall": round(metrics_after["micro_recall"], 4),
            "micro_f1": round(metrics_after["micro_f1"], 4),
            "objective": round(metrics_after["objective"], 4),
        },
    }

    _OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(_OUTPUT_JSON, "w") as f:
        json.dump(output, f, indent=2)
    print(f"  Thresholds saved → {_OUTPUT_JSON}")

    # Update config.py with CATEGORY_THRESHOLDS constant
    _update_config_py(category_thresholds)


def _update_config_py(category_thresholds: dict[str, dict]):
    """Append CATEGORY_THRESHOLDS to detection/config.py."""
    config_path = Path(__file__).parent.parent.parent / "config.py"
    content = config_path.read_text()

    # Remove old CATEGORY_THRESHOLDS block if present
    marker_start = "# ─── Category-specific action thresholds"
    marker_end = "# ── End category thresholds"
    if marker_start in content:
        start_idx = content.index(marker_start)
        end_idx = content.index(marker_end) + len(marker_end)
        content = content[:start_idx] + content[end_idx:]

    # Build new block
    lines = [
        "",
        "# ─── Category-specific action thresholds (auto-generated by optimize_thresholds.py) ──",
        "# Per-category overrides for ACTION_THRESHOLDS. Categories not listed use global defaults.",
        "CATEGORY_THRESHOLDS: dict[str, dict[str, int]] = {",
    ]
    for cat, cfg in sorted(category_thresholds.items()):
        lines.append(
            f'    "{cat}": {{"warn": {cfg["warn"]}, "redact": {cfg["redact"]}, "block": {cfg["block"]}}},'
        )
    lines.append("}")
    lines.append("# ── End category thresholds")
    lines.append("")

    # Insert before the CALIBRATION singleton
    insert_marker = "# Singleton — import and use directly"
    if insert_marker in content:
        idx = content.index(insert_marker)
        content = content[:idx] + "\n".join(lines) + "\n\n" + content[idx:]
    else:
        content += "\n" + "\n".join(lines) + "\n"

    config_path.write_text(content)
    print(f"  config.py updated with CATEGORY_THRESHOLDS")


# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Optimize action thresholds")
    parser.add_argument("--trials", type=int, default=200, help="Number of optimization trials")
    parser.add_argument("--plot", action="store_true", help="Generate threshold heatmap")
    parser.add_argument("--skip-eval", action="store_true", help="Skip running accuracy_eval, use cached results")
    args = parser.parse_args()

    print("=" * 70)
    print("  Action Threshold Optimizer")
    print("=" * 70)

    # ── Load test results ─────────────────────────────────────────────────────
    print("\nLoading test results...")
    results = _load_test_results()
    print(f"  Loaded {len(results)} test cases")

    # ── Baseline metrics (current thresholds) ─────────────────────────────────
    print("\nBaseline metrics (current thresholds: WARN=60, REDACT=80, BLOCK=93):")
    metrics_before = compute_metrics(results, 60, 80, 93)
    print(f"  Micro Precision: {metrics_before['micro_precision']:.4f}")
    print(f"  Micro Recall:    {metrics_before['micro_recall']:.4f}")
    print(f"  Micro F1:        {metrics_before['micro_f1']:.4f}")
    print(f"  Objective:       {metrics_before['objective']:.4f}")

    # ── Optimize ──────────────────────────────────────────────────────────────
    print(f"\nRunning optimization ({args.trials} trials)...")
    try:
        import optuna
        print("  Using Optuna")
        best = _optimize_with_optuna(results, args.trials)
    except ImportError:
        print("  Optuna not available, using scipy.optimize.differential_evolution")
        best = _optimize_with_scipy(results, args.trials)

    warn_thr = best["warn_thr"]
    redact_thr = best["redact_thr"]
    block_thr = best["block_thr"]

    print(f"\n  Best thresholds: WARN={warn_thr}, REDACT={redact_thr}, BLOCK={block_thr}")
    print(f"  Objective value:  {best['objective_value']:.4f}")
    print(f"  Method:           {best['method']}")

    # ── Metrics after optimization ────────────────────────────────────────────
    print("\nOptimized metrics:")
    metrics_after = compute_metrics(results, warn_thr, redact_thr, block_thr)
    print(f"  Micro Precision: {metrics_after['micro_precision']:.4f}")
    print(f"  Micro Recall:    {metrics_after['micro_recall']:.4f}")
    print(f"  Micro F1:        {metrics_after['micro_f1']:.4f}")
    print(f"  Objective:       {metrics_after['objective']:.4f}")

    # ── Per-category breakdown ────────────────────────────────────────────────
    print("\nPer-category metrics (optimized):")
    print(f"  {'Category':<20s} {'Support':>8s} {'Precision':>10s} {'Recall':>10s} {'F1':>10s}")
    print("  " + "─" * 60)
    for cat, m in sorted(metrics_after["per_category"].items(), key=lambda x: -x[1]["support"]):
        print(f"  {cat:<20s} {m['support']:>8d} {m['precision']:>10.4f} {m['recall']:>10.4f} {m['f1']:>10.4f}")

    # ── Per-category threshold adjustments ────────────────────────────────────
    print("\nPer-category threshold adjustments:")
    cat_thresholds = compute_category_thresholds(
        metrics_after["per_category"], warn_thr, redact_thr, block_thr,
    )
    for cat, cfg in sorted(cat_thresholds.items()):
        if cfg["reasons"]:
            print(f"  {cat:<20s}: WARN={cfg['warn']}, REDACT={cfg['redact']}, BLOCK={cfg['block']}")
            for reason in cfg["reasons"]:
                print(f"    → {reason}")

    # ── Show expected change ──────────────────────────────────────────────────
    dp = metrics_after["micro_precision"] - metrics_before["micro_precision"]
    dr = metrics_after["micro_recall"] - metrics_before["micro_recall"]
    df = metrics_after["micro_f1"] - metrics_before["micro_f1"]
    print(f"\nExpected change vs baseline:")
    print(f"  Precision: {dp:+.4f} ({'↑' if dp > 0 else '↓'})")
    print(f"  Recall:    {dr:+.4f} ({'↑' if dr > 0 else '↓'})")
    print(f"  F1:        {df:+.4f} ({'↑' if df > 0 else '↓'})")

    # ── Heatmap ───────────────────────────────────────────────────────────────
    if args.plot:
        print("\nGenerating heatmap...")
        plot_heatmap(results)

    # ── Save ──────────────────────────────────────────────────────────────────
    print("\nSaving thresholds...")
    save_thresholds(
        {"warn": warn_thr, "redact": redact_thr, "block": block_thr},
        cat_thresholds,
        metrics_before,
        metrics_after,
    )

    print("\n" + "=" * 70)
    print("  Done. Restart detection service to apply new thresholds.")
    print("=" * 70)


if __name__ == "__main__":
    main()
