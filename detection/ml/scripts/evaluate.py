"""
ShieldAI Model Evaluation
==========================
Evaluates trained models on the held-out test set.

Outputs:
  - Per-category Precision / Recall / F1
  - Micro / Macro / Weighted F1
  - Confusion matrix PNG per category
  - evaluation/report.json — full metrics for CI/CD gate
  - evaluation/summary.md  — human-readable report

Usage:
    python detection/ml/scripts/evaluate.py [--model-type spacy|sklearn|both]
"""

from __future__ import annotations

import json
import pickle
import sys
import time
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

ML_DIR = Path(__file__).parent.parent
PROC_DIR = ML_DIR / "data" / "processed"
MODEL_DIR = ML_DIR / "models"
EVAL_DIR = ML_DIR / "evaluation"
EVAL_DIR.mkdir(parents=True, exist_ok=True)

ALL_CATS = ["SAFE", "PII", "CREDENTIALS", "PROMPT_INJECTION", "HALLUCINATION", "BIAS", "REGULATORY"]

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_jsonl(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def extract_arrays(records: list[dict]):
    """Returns (texts, label_matrix) where label_matrix[i][j] = 0/1."""
    import numpy as np
    texts = [r["text"] for r in records]
    labels = np.array([[1 if r["labels"].get(c, False) else 0 for c in ALL_CATS] for r in records])
    return texts, labels


def compute_per_category_metrics(y_true, y_pred, threshold: float = 0.5):
    """Compute per-category and aggregate metrics."""
    import numpy as np
    from sklearn.metrics import precision_score, recall_score, f1_score

    # Binarize predictions if probabilistic
    if y_pred.dtype == float or y_pred.max() <= 1.0:
        y_pred_bin = (y_pred >= threshold).astype(int)
    else:
        y_pred_bin = y_pred

    metrics = {}

    for i, cat in enumerate(ALL_CATS):
        p = precision_score(y_true[:, i], y_pred_bin[:, i], zero_division=0)
        r = recall_score(y_true[:, i], y_pred_bin[:, i], zero_division=0)
        f = f1_score(y_true[:, i], y_pred_bin[:, i], zero_division=0)
        support = int(y_true[:, i].sum())
        tp = int(((y_pred_bin[:, i] == 1) & (y_true[:, i] == 1)).sum())
        fp = int(((y_pred_bin[:, i] == 1) & (y_true[:, i] == 0)).sum())
        fn = int(((y_pred_bin[:, i] == 0) & (y_true[:, i] == 1)).sum())
        tn = int(((y_pred_bin[:, i] == 0) & (y_true[:, i] == 0)).sum())
        metrics[cat] = {
            "precision": round(p, 4), "recall": round(r, 4), "f1": round(f, 4),
            "support": support, "tp": tp, "fp": fp, "fn": fn, "tn": tn,
        }

    # Aggregate
    micro_f1 = f1_score(y_true, y_pred_bin, average="micro", zero_division=0)
    macro_f1 = f1_score(y_true, y_pred_bin, average="macro", zero_division=0)
    weighted_f1 = f1_score(y_true, y_pred_bin, average="weighted", zero_division=0)

    metrics["_aggregate"] = {
        "micro_f1": round(micro_f1, 4),
        "macro_f1": round(macro_f1, 4),
        "weighted_f1": round(weighted_f1, 4),
        "threshold": threshold,
    }

    return metrics, y_pred_bin


def plot_confusion_matrices(y_true, y_pred_bin, prefix: str = "eval") -> None:
    """Save per-category confusion matrix heatmaps."""
    try:
        import numpy as np
        import matplotlib
        matplotlib.use("Agg")  # Non-interactive backend
        import matplotlib.pyplot as plt
        import seaborn as sns

        fig, axes = plt.subplots(2, 4, figsize=(20, 10))
        axes = axes.flatten()

        for i, cat in enumerate(ALL_CATS):
            tn = ((y_pred_bin[:, i] == 0) & (y_true[:, i] == 0)).sum()
            fp = ((y_pred_bin[:, i] == 1) & (y_true[:, i] == 0)).sum()
            fn = ((y_pred_bin[:, i] == 0) & (y_true[:, i] == 1)).sum()
            tp = ((y_pred_bin[:, i] == 1) & (y_true[:, i] == 1)).sum()
            cm = np.array([[tn, fp], [fn, tp]])

            sns.heatmap(
                cm, annot=True, fmt="d", cmap="Blues", ax=axes[i],
                xticklabels=["Pred 0", "Pred 1"],
                yticklabels=["True 0", "True 1"],
                linewidths=0.5, linecolor="gray",
            )
            axes[i].set_title(f"{cat}", fontsize=11, fontweight="bold")
            axes[i].set_xlabel("Predicted", fontsize=9)
            axes[i].set_ylabel("Actual", fontsize=9)

        # Hide last empty subplot
        if len(ALL_CATS) < len(axes):
            axes[-1].set_visible(False)

        plt.suptitle(f"ShieldAI {prefix} — Confusion Matrices (Test Set)", fontsize=14, fontweight="bold")
        plt.tight_layout()
        out = EVAL_DIR / f"{prefix}_confusion_matrices.png"
        plt.savefig(out, dpi=150, bbox_inches="tight")
        plt.close()
        print(f"  📊 Confusion matrices → {out.name}")

    except ImportError:
        print("  ⚠ matplotlib/seaborn not available — skipping confusion matrix plots")


def plot_f1_bar(metrics: dict, prefix: str = "eval") -> None:
    """Bar chart of F1 scores per category."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        cats = [c for c in metrics if not c.startswith("_")]
        f1s = [metrics[c]["f1"] for c in cats]
        colors = ["#22c55e" if f >= 0.8 else "#eab308" if f >= 0.6 else "#ef4444" for f in f1s]

        fig, ax = plt.subplots(figsize=(12, 5))
        bars = ax.bar(cats, f1s, color=colors, edgecolor="white", linewidth=0.8)

        for bar, f1 in zip(bars, f1s):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.01,
                    f"{f1:.3f}", ha="center", va="bottom", fontsize=10, fontweight="bold")

        ax.axhline(0.8, color="#6366f1", linestyle="--", linewidth=1, label="Target F1=0.80")
        ax.set_ylim(0, 1.1)
        ax.set_ylabel("F1 Score", fontsize=11)
        ax.set_title(f"ShieldAI {prefix} — F1 per Category (Test Set)", fontsize=13, fontweight="bold")
        ax.legend(fontsize=9)
        plt.xticks(rotation=20, fontsize=9)
        plt.tight_layout()

        out = EVAL_DIR / f"{prefix}_f1_scores.png"
        plt.savefig(out, dpi=150, bbox_inches="tight")
        plt.close()
        print(f"  📊 F1 bar chart → {out.name}")

    except ImportError:
        pass


def print_metrics_table(metrics: dict, model_name: str) -> None:
    """Print formatted metrics table to stdout."""
    agg = metrics.get("_aggregate", {})
    print(f"\n  {'Category':<22} {'Prec':>6} {'Recall':>7} {'F1':>6} {'Support':>8}")
    print("  " + "-" * 55)
    for cat in ALL_CATS:
        m = metrics.get(cat, {})
        p = m.get("precision", 0)
        r = m.get("recall", 0)
        f = m.get("f1", 0)
        s = m.get("support", 0)
        flag = " ✓" if f >= 0.80 else " △" if f >= 0.60 else " ✗"
        print(f"  {cat:<22} {p:>6.3f} {r:>7.3f} {f:>6.3f} {s:>8}{flag}")
    print("  " + "-" * 55)
    print(f"  {'Micro F1':<22} {agg.get('micro_f1', 0):>6.3f}")
    print(f"  {'Macro F1':<22} {agg.get('macro_f1', 0):>6.3f}")
    print(f"  {'Weighted F1':<22} {agg.get('weighted_f1', 0):>6.3f}")


def write_markdown_report(sklearn_metrics: dict | None, spacy_metrics: dict | None) -> None:
    """Write a human-readable markdown evaluation report."""
    lines = [
        "# ShieldAI Model Evaluation Report\n",
        f"Generated at: {time.strftime('%Y-%m-%d %H:%M:%S')}\n",
        "## Test Set Metrics\n",
        f"Categories: `{'` · `'.join(ALL_CATS)}`\n",
    ]

    def table(metrics: dict, name: str) -> list[str]:
        agg = metrics.get("_aggregate", {})
        rows = [
            f"### {name}\n",
            "| Category | Precision | Recall | F1 | Support | Status |\n",
            "|---|---|---|---|---|---|\n",
        ]
        for cat in ALL_CATS:
            m = metrics.get(cat, {})
            f = m.get("f1", 0)
            status = "✅" if f >= 0.8 else "🟡" if f >= 0.6 else "❌"
            rows.append(
                f"| **{cat}** | {m.get('precision', 0):.3f} | {m.get('recall', 0):.3f} "
                f"| {f:.3f} | {m.get('support', 0)} | {status} |\n"
            )
        rows += [
            "\n",
            f"| **Micro F1** | | | **{agg.get('micro_f1', 0):.4f}** | | |\n",
            f"| **Macro F1** | | | **{agg.get('macro_f1', 0):.4f}** | | |\n",
            f"| **Weighted F1** | | | **{agg.get('weighted_f1', 0):.4f}** | | |\n\n",
        ]
        return rows

    if sklearn_metrics:
        lines.extend(table(sklearn_metrics, "sklearn TF-IDF + Logistic Regression"))
    if spacy_metrics:
        lines.extend(table(spacy_metrics, "spaCy textcat_multilabel (BOW)"))

    lines += [
        "## Legend\n",
        "- ✅ F1 ≥ 0.80 — production ready\n",
        "- 🟡 F1 0.60–0.79 — needs improvement\n",
        "- ❌ F1 < 0.60 — insufficient data or model\n",
        "\n## Next Steps\n",
        "- Add more labeled examples for low-F1 categories\n",
        "- Re-run `python detection/ml/scripts/train.py`\n",
        "- Consider fine-tuning `en_core_web_trf` for production\n",
    ]

    report_path = EVAL_DIR / "report.md"
    with report_path.open("w") as f:
        f.writelines(lines)
    print(f"  📝 Markdown report → {report_path.name}")


# ── Model evaluators ──────────────────────────────────────────────────────────

def evaluate_sklearn(test: list[dict]) -> dict | None:
    model_path = MODEL_DIR / "sklearn_classifier.pkl"
    if not model_path.exists():
        print("  ⚠ sklearn model not found — skipping")
        return None

    print("\n" + "=" * 55)
    print("Evaluating sklearn TF-IDF + LogisticRegression")
    print("=" * 55)

    import numpy as np
    with model_path.open("rb") as f:
        pipeline = pickle.load(f)

    test_texts, y_true = extract_arrays(test)

    start = time.perf_counter()
    y_pred = pipeline.predict(test_texts)
    elapsed = time.perf_counter() - start
    print(f"  Inference: {len(test_texts)} examples in {elapsed*1000:.1f}ms "
          f"({elapsed/len(test_texts)*1000:.2f}ms each)")

    metrics, y_pred_bin = compute_per_category_metrics(y_true, y_pred)
    print_metrics_table(metrics, "sklearn")
    plot_confusion_matrices(y_true, y_pred_bin, "sklearn")
    plot_f1_bar(metrics, "sklearn")

    # Save JSON metrics
    with (EVAL_DIR / "sklearn_metrics.json").open("w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  💾 Metrics JSON → sklearn_metrics.json")

    return metrics


def evaluate_spacy(test: list[dict]) -> dict | None:
    import numpy as np

    model_path = MODEL_DIR / "spacy_textcat"
    if not model_path.exists():
        best = MODEL_DIR / "spacy_textcat_best"
        if best.exists():
            model_path = best
        else:
            print("  ⚠ spaCy model not found — skipping")
            return None

    try:
        import spacy
    except ImportError:
        print("  ⚠ spaCy not available — skipping")
        return None

    print("\n" + "=" * 55)
    print("Evaluating spaCy textcat_multilabel")
    print("=" * 55)

    nlp = spacy.load(str(model_path))

    test_texts = [r["text"] for r in test]
    y_true = np.array([[1 if r["labels"].get(c, False) else 0 for c in ALL_CATS] for r in test])

    start = time.perf_counter()
    y_pred_prob = np.zeros((len(test), len(ALL_CATS)))
    for i, doc in enumerate(nlp.pipe(test_texts, batch_size=32)):
        for j, cat in enumerate(ALL_CATS):
            y_pred_prob[i, j] = doc.cats.get(cat, 0.0)
    elapsed = time.perf_counter() - start

    y_pred = y_pred_prob
    print(f"  Inference: {len(test_texts)} examples in {elapsed*1000:.1f}ms "
          f"({elapsed/len(test_texts)*1000:.2f}ms each)")

    metrics, y_pred_bin = compute_per_category_metrics(y_true, y_pred, threshold=0.5)
    print_metrics_table(metrics, "spaCy")
    plot_confusion_matrices(y_true, y_pred_bin, "spacy")
    plot_f1_bar(metrics, "spacy")

    with (EVAL_DIR / "spacy_metrics.json").open("w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  💾 Metrics JSON → spacy_metrics.json")

    return metrics


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="ShieldAI Model Evaluator")
    parser.add_argument("--model-type", choices=["spacy", "sklearn", "both"], default="both")
    args = parser.parse_args()

    print("╔══════════════════════════════════════════════════════╗")
    print("║       ShieldAI Model Evaluator — v1.0               ║")
    print("╚══════════════════════════════════════════════════════╝\n")

    test_path = PROC_DIR / "test.jsonl"
    if not test_path.exists():
        print(f"❌ test.jsonl not found. Run preprocess.py first.")
        sys.exit(1)

    test = load_jsonl(test_path)
    print(f"✓ Loaded {len(test)} test examples")

    sklearn_metrics = None
    spacy_metrics = None

    if args.model_type in ("sklearn", "both"):
        sklearn_metrics = evaluate_sklearn(test)

    if args.model_type in ("spacy", "both"):
        spacy_metrics = evaluate_spacy(test)

    # Write consolidated report
    write_markdown_report(sklearn_metrics, spacy_metrics)

    # Write combined JSON report
    report = {
        "timestamp": time.strftime("%Y-%m-%d %Human:%M:%S"),
        "test_size": len(test),
        "categories": ALL_CATS,
    }
    if sklearn_metrics:
        report["sklearn"] = sklearn_metrics
    if spacy_metrics:
        report["spacy"] = spacy_metrics

    with (EVAL_DIR / "report.json").open("w") as f:
        json.dump(report, f, indent=2)

    print(f"\n✅ Evaluation complete → {EVAL_DIR}")


if __name__ == "__main__":
    main()
