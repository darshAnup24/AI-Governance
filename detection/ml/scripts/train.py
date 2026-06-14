"""
Airlock ML Model Trainer
=========================
Trains TWO complementary models:
  1. spaCy textcat (BERT-style bow) — fast multi-label classifier
  2. sklearn TF-IDF + LogisticRegression pipeline — interpretable baseline

Both are saved to detection/ml/models/ and ready to serve via the detection API.

Usage:
    python detection/ml/scripts/train.py [--model-type spacy|sklearn|both]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# ── Paths ─────────────────────────────────────────────────────────────────────

ML_DIR = Path(__file__).parent.parent
PROC_DIR = ML_DIR / "data" / "processed"
MODEL_DIR = ML_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

ALL_CATS = ["SAFE", "PII", "CREDENTIALS", "API_KEY", "PROMPT_INJECTION", "HALLUCINATION", "BIAS", "REGULATORY"]

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_jsonl(path: Path) -> list[dict]:
    records = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def extract_texts_labels(records: list[dict]) -> tuple[list[str], list[list[int]]]:
    texts = [r["text"] for r in records]
    labels = [[1 if r["labels"].get(c, False) else 0 for c in ALL_CATS] for r in records]
    return texts, labels


# ── Threshold Optimiser ───────────────────────────────────────────────────────

def _find_optimal_thresholds(
    pipeline: Any,
    dev_texts: list[str],
    dev_labels: Any,  # np.ndarray shape (n, n_cats)
    thresholds: list[float] | None = None,
) -> dict[str, float]:
    """
    Per-category threshold sweep on the dev set.

    For each category independently, evaluates binary F1 over a grid of
    thresholds [0.10, 0.15, …, 0.90] and picks the one that maximises F1.

    Returns {category: optimal_threshold}.
    The result is saved to sklearn_meta.json so MLClassifier can load it.
    """
    import numpy as np
    from sklearn.metrics import f1_score

    if thresholds is None:
        thresholds = [round(t * 0.05 + 0.10, 2) for t in range(17)]  # 0.10 … 0.90

    # predict_proba returns list[array(n_samples, 2)], one per label
    proba_list = pipeline.predict_proba(dev_texts)

    best: dict[str, float] = {}
    for i, cat in enumerate(ALL_CATS):
        if cat == "SAFE":
            best[cat] = 0.50
            continue
        probs = np.array([p[1] for p in proba_list[i]])  # P(positive) for each sample
        gold  = dev_labels[:, i]

        if gold.sum() == 0:  # No positive examples for this category in dev set
            best[cat] = 0.40
            continue

        best_f1  = -1.0
        best_thr = 0.40
        for thr in thresholds:
            preds = (probs >= thr).astype(int)
            f1 = f1_score(gold, preds, zero_division=0)
            if f1 > best_f1:
                best_f1  = f1
                best_thr = thr

        best[cat] = round(best_thr, 2)

    return best


# ── sklearn Training ──────────────────────────────────────────────────────────

def train_sklearn(train: list[dict], dev: list[dict]) -> None:
    """Train sklearn TF-IDF + LogisticRegression multi-label classifier.

    Enhancements over baseline:
      1. class_weight='balanced' — automatic inverse-frequency weighting
      2. compute_sample_weight — manual per-sample weights for comparison
      3. Stratified K-Fold cross-validation with per-class F1 reporting
      4. Confusion matrix normalized by true class (recall-oriented)
    """
    try:
        import pickle
        import numpy as np
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.multioutput import MultiOutputClassifier
        from sklearn.pipeline import Pipeline
        from sklearn.metrics import (
            f1_score, precision_score, recall_score,
            classification_report, confusion_matrix,
        )
        from sklearn.utils.class_weight import compute_sample_weight
        from sklearn.model_selection import StratifiedKFold

        print("\n" + "=" * 60)
        print("Training sklearn TF-IDF + LogisticRegression (balanced)")
        print("=" * 60)

        train_texts, train_labels = extract_texts_labels(train)
        dev_texts, dev_labels = extract_texts_labels(dev)

        train_labels_arr = np.array(train_labels)
        dev_labels_arr = np.array(dev_labels)

        # ── 1. class_weight='balanced' ───────────────────────────────────
        # LogisticRegression computes per-class weights as:
        #   w_c = n_samples / (n_classes * n_samples_c)
        # This upweights minority classes automatically.
        base_clf = LogisticRegression(
            C=1.5,
            max_iter=2000,
            solver="saga",
            class_weight="balanced",   # <-- KEY: inverse-frequency weighting
            n_jobs=-1,
        )

        pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(
                ngram_range=(1, 3),
                max_features=50_000,
                sublinear_tf=True,
                strip_accents="unicode",
                analyzer="word",
                min_df=1,
            )),
            ("clf", MultiOutputClassifier(base_clf, n_jobs=-1)),
        ])

        # ── 2. compute_sample_weight (for comparison) ────────────────────
        # Manual per-sample weighting using sklearn's utility.
        # For multi-label, we compute weights per output and take the mean.
        print("\n  ── Sample Weight Comparison ──")
        sample_weights_by_label = {}
        for i, cat in enumerate(ALL_CATS):
            y_col = train_labels_arr[:, i]
            if y_col.sum() == 0 or y_col.sum() == len(y_col):
                sample_weights_by_label[cat] = np.ones(len(y_col))
                continue
            sw = compute_sample_weight(class_weight="balanced", y=y_col)
            sample_weights_by_label[cat] = sw
            n_pos = int(y_col.sum())
            n_neg = len(y_col) - n_pos
            w_pos = float(sw[y_col == 1].mean()) if n_pos > 0 else 0.0
            w_neg = float(sw[y_col == 0].mean()) if n_neg > 0 else 0.0
            print(f"    {cat:<22}  pos={n_pos:>4d}  neg={n_neg:>4d}  "
                  f"w_pos={w_pos:.3f}  w_neg={w_neg:.3f}  ratio={w_pos / w_neg:.2f}x")

        # Average sample weights across all labels for the training set
        avg_sample_weights = np.mean(
            np.array([sample_weights_by_label[cat] for cat in ALL_CATS]),
            axis=0,
        )
        print(f"\n    Mean sample weight: {avg_sample_weights.mean():.4f} "
              f"(std={avg_sample_weights.std():.4f})")
        print("    Note: class_weight='balanced' handles this internally. "
              "compute_sample_weight shown for manual experimentation.\n")

        # ── Train ─────────────────────────────────────────────────────────
        start = time.perf_counter()
        pipeline.fit(train_texts, train_labels_arr)
        elapsed = time.perf_counter() - start
        print(f"  ✓ Training completed in {elapsed:.1f}s")

        # ── Evaluate on dev set ──────────────────────────────────────────
        dev_preds = pipeline.predict(dev_texts)
        micro_f1 = f1_score(dev_labels_arr, dev_preds, average="micro", zero_division=0)
        macro_f1 = f1_score(dev_labels_arr, dev_preds, average="macro", zero_division=0)
        weighted_f1 = f1_score(dev_labels_arr, dev_preds, average="weighted", zero_division=0)

        print(f"\n  ── Dev Set Metrics ──")
        print(f"  Micro F1:    {micro_f1:.4f}")
        print(f"  Macro F1:    {macro_f1:.4f}")
        print(f"  Weighted F1: {weighted_f1:.4f}")

        # Per-category report
        print("\n  Per-category Dev Metrics:")
        for i, cat in enumerate(ALL_CATS):
            p = precision_score(dev_labels_arr[:, i], dev_preds[:, i], zero_division=0)
            r = recall_score(dev_labels_arr[:, i], dev_preds[:, i], zero_division=0)
            f = f1_score(dev_labels_arr[:, i], dev_preds[:, i], zero_division=0)
            n_pos = int(dev_labels_arr[:, i].sum())
            bar = "█" * int(f * 20)
            print(f"    {cat:<22}  P={p:.3f} R={r:.3f} F1={f:.3f} {bar}  (n={n_pos})")

        # ── 3. Cross-Validation with per-class F1 ────────────────────────
        print("\n  ── Stratified 5-Fold Cross-Validation ──")
        _run_cross_validation(train_texts, train_labels_arr)

        # ── 4. Confusion Matrix (normalized by true class) ───────────────
        print("\n  ── Confusion Matrix (normalized by true class = recall) ──")
        _print_confusion_matrix(dev_labels_arr, dev_preds)

        # ── Full classification report ──────────────────────────────────
        print("\n  ── Full Classification Report (dev set) ──")
        print(classification_report(
            dev_labels_arr, dev_preds,
            target_names=ALL_CATS,
            zero_division=0,
        ))

        # Save model
        model_path = MODEL_DIR / "sklearn_classifier.pkl"
        with model_path.open("wb") as f:
            pickle.dump(pipeline, f)
        print(f"  💾 Model saved → {model_path}")

        # ── Threshold optimisation ────────────────────────────────────────
        print("\n  Optimising per-category confidence thresholds on dev set...")
        opt_thresholds = _find_optimal_thresholds(pipeline, dev_texts, dev_labels_arr)
        print("  Per-category optimal thresholds:")
        for cat, thr in opt_thresholds.items():
            print(f"    {cat:<22}  threshold={thr:.2f}")

        # Save metadata
        meta = {
            "model_type": "sklearn_tfidf_lr",
            "categories": ALL_CATS,
            "train_size": len(train),
            "dev_micro_f1": round(micro_f1, 4),
            "dev_macro_f1": round(macro_f1, 4),
            "dev_weighted_f1": round(weighted_f1, 4),
            "training_time_s": round(elapsed, 2),
            "class_weight": "balanced",
            "cv_folds": 5,
            "version": "2.0",
            "per_category_thresholds": opt_thresholds,
        }
        with (MODEL_DIR / "sklearn_meta.json").open("w") as f:
            json.dump(meta, f, indent=2)
        print(f"  💾 Thresholds saved → {MODEL_DIR / 'sklearn_meta.json'}")

    except ImportError as e:
        print(f"  ❌ sklearn not available: {e}")
        print("  Install: pip install scikit-learn")


def _run_cross_validation(
    texts: list[str],
    labels: np.ndarray,
    n_folds: int = 5,
) -> None:
    """Stratified K-Fold CV reporting per-class F1 for each fold + summary."""
    import numpy as np
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.multioutput import MultiOutputClassifier
    from sklearn.pipeline import Pipeline
    from sklearn.model_selection import StratifiedKFold
    from sklearn.metrics import f1_score

    # Use primary label for stratification
    primary_labels = []
    for row in labels:
        idx = np.argmax(row)
        primary_labels.append(idx)
    primary_labels = np.array(primary_labels)

    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)

    fold_results: list[dict[str, float]] = []

    for fold_idx, (train_idx, val_idx) in enumerate(skf.split(texts, primary_labels)):
        fold_train = [texts[i] for i in train_idx]
        fold_val = [texts[i] for i in val_idx]
        fold_y_train = labels[train_idx]
        fold_y_val = labels[val_idx]

        pipe = Pipeline([
            ("tfidf", TfidfVectorizer(
                ngram_range=(1, 3),
                max_features=50_000,
                sublinear_tf=True,
                strip_accents="unicode",
                analyzer="word",
                min_df=1,
            )),
            ("clf", MultiOutputClassifier(
                LogisticRegression(
                    C=1.5, max_iter=2000, solver="saga",
                    class_weight="balanced", n_jobs=-1,
                ),
                n_jobs=-1,
            )),
        ])

        pipe.fit(fold_train, fold_y_train)
        fold_preds = pipe.predict(fold_val)

        fold_f1s = {}
        for i, cat in enumerate(ALL_CATS):
            fold_f1s[cat] = f1_score(fold_y_val[:, i], fold_preds[:, i], zero_division=0)
        fold_f1s["micro"] = f1_score(fold_y_val, fold_preds, average="micro", zero_division=0)
        fold_f1s["macro"] = f1_score(fold_y_val, fold_preds, average="macro", zero_division=0)
        fold_results.append(fold_f1s)

    # Print header
    header = f"  {'Fold':<6}" + "".join(f"{cat:>10}" for cat in ALL_CATS) + f"{'micro':>10}{'macro':>10}"
    print(header)
    print("  " + "─" * (6 + 10 * (len(ALL_CATS) + 2)))

    for idx, res in enumerate(fold_results):
        row = f"  {idx + 1:<6}" + "".join(f"{res[c]:>10.3f}" for c in ALL_CATS)
        row += f"{res['micro']:>10.3f}{res['macro']:>10.3f}"
        print(row)

    # Averages
    print("  " + "─" * (6 + 10 * (len(ALL_CATS) + 2)))
    avg_row = f"  {'MEAN':<6}"
    for cat in ALL_CATS:
        avg_val = np.mean([r[cat] for r in fold_results])
        avg_row += f"{avg_val:>10.3f}"
    avg_micro = np.mean([r["micro"] for r in fold_results])
    avg_macro = np.mean([r["macro"] for r in fold_results])
    avg_row += f"{avg_micro:>10.3f}{avg_macro:>10.3f}"
    print(avg_row)

    # Std deviations
    std_row = f"  {'STD':<6}"
    for cat in ALL_CATS:
        std_val = np.std([r[cat] for r in fold_results])
        std_row += f"{std_val:>10.3f}"
    std_micro = np.std([r["micro"] for r in fold_results])
    std_macro = np.std([r["macro"] for r in fold_results])
    std_row += f"{std_micro:>10.3f}{std_macro:>10.3f}"
    print(std_row)

    # Highlight minority classes
    print("\n  Minority class CV summary (classes with fewest training samples):")
    class_counts = labels.sum(axis=0)
    minority_idx = np.argsort(class_counts)[:3]
    for idx in minority_idx:
        cat = ALL_CATS[idx]
        vals = [r[cat] for r in fold_results]
        print(f"    {cat:<22}  mean_F1={np.mean(vals):.3f} ± {np.std(vals):.3f}  "
              f"(n_train={int(class_counts[idx])})")


def _print_confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray) -> None:
    """Print per-category confusion matrices normalized by true class (rows).

    Each row sums to 1.0 (recall). Diagonal = recall for that class.
    Off-diagonal = misclassification pattern.
    """
    import numpy as np

    for i, cat in enumerate(ALL_CATS):
        y_t = y_true[:, i]
        y_p = y_pred[:, i]

        tp = int(((y_t == 1) & (y_p == 1)).sum())
        fn = int(((y_t == 1) & (y_p == 0)).sum())
        fp = int(((y_t == 0) & (y_p == 1)).sum())
        tn = int(((y_t == 0) & (y_p == 0)).sum())

        n_pos = tp + fn
        n_neg = fp + tn

        if n_pos == 0 and n_neg == 0:
            continue

        # Normalized by true class (row-normalized)
        total = n_pos + n_neg
        if total == 0:
            continue

        print(f"\n    [{cat}]  (true_pos={n_pos}, true_neg={n_neg})")
        print(f"    {'':>18}  {'Predicted POS':>14}  {'Predicted NEG':>14}")
        print(f"    {'True POS':>18}  {tp / total:>14.3f}  {fn / total:>14.3f}  ← recall={tp / (tp + fn):.3f}" if n_pos > 0 else f"    {'True POS':>18}  {'N/A':>14}  {'N/A':>14}")
        print(f"    {'True NEG':>18}  {fp / total:>14.3f}  {tn / total:>14.3f}  ← specificity={tn / (tn + fp):.3f}" if n_neg > 0 else f"    {'True NEG':>18}  {'N/A':>14}  {'N/A':>14}")

        # Also show raw counts
        print(f"    {'Raw counts':>18}  TP={tp} FN={fn} FP={fp} TN={tn}")


# ── spaCy Training ────────────────────────────────────────────────────────────

def train_spacy(train: list[dict], dev: list[dict], n_iter: int = 20) -> None:
    """Train spaCy textcat BOW multi-label classifier."""
    try:
        import spacy
        from spacy.training import Example
        from spacy.tokens import DocBin
        import numpy as np

        print("\n" + "=" * 55)
        print("Training spaCy textcat_multilabel (BOW)")
        print("=" * 55)

        # Try to load existing spaCy model for pipeline base
        try:
            nlp = spacy.load("en_core_web_sm")
            print("  ✓ Loaded en_core_web_sm as base")
        except OSError:
            nlp = spacy.blank("en")
            print("  ✓ Using blank English model (install en_core_web_sm for better results)")

        # Remove textcat if already exists, add fresh
        if nlp.has_pipe("textcat_multilabel"):
            nlp.remove_pipe("textcat_multilabel")

        textcat = nlp.add_pipe("textcat_multilabel")
        for cat in ALL_CATS:
            textcat.add_label(cat)

        # Build training examples
        train_examples = []
        for rec in train:
            doc = nlp.make_doc(rec["text"])
            cats = {c: 1.0 if rec["labels"].get(c, False) else 0.0 for c in ALL_CATS}
            train_examples.append(Example.from_dict(doc, {"cats": cats}))

        dev_examples = []
        for rec in dev:
            doc = nlp.make_doc(rec["text"])
            cats = {c: 1.0 if rec["labels"].get(c, False) else 0.0 for c in ALL_CATS}
            dev_examples.append(Example.from_dict(doc, {"cats": cats}))

        # Initialise model
        nlp.initialize(lambda: train_examples)

        # Training loop
        optimizer = nlp.create_optimizer()
        best_macro_f1 = 0.0
        best_epoch = 0

        import random
        random.seed(42)

        print(f"  Training for {n_iter} iterations, {len(train_examples)} examples...\n")

        for epoch in range(1, n_iter + 1):
            random.shuffle(train_examples)
            losses: dict = {}

            # Mini-batch training
            batches = spacy.util.minibatch(train_examples, size=16)
            for batch in batches:
                nlp.update(batch, drop=0.3, losses=losses, sgd=optimizer)

            # Evaluate on dev
            if epoch % 5 == 0 or epoch == n_iter:
                f1_scores = []
                for ex in dev_examples:
                    pred_doc = nlp(ex.reference.text)
                    for cat in ALL_CATS:
                        pred = pred_doc.cats.get(cat, 0.0)
                        gold = ex.reference.cats.get(cat, 0.0)
                        if gold > 0.5:  # Only score positive examples
                            f1_scores.append(1.0 if pred > 0.5 else 0.0)

                macro_f1 = sum(f1_scores) / len(f1_scores) if f1_scores else 0.0
                loss_val = losses.get("textcat_multilabel", 0)

                print(f"  Epoch {epoch:>3}/{n_iter}  loss={loss_val:.3f}  "
                      f"dev_f1~={macro_f1:.3f}", end="")

                if macro_f1 > best_macro_f1:
                    best_macro_f1 = macro_f1
                    best_epoch = epoch
                    # Save best checkpoint
                    ckpt_path = MODEL_DIR / "spacy_textcat_best"
                    nlp.to_disk(ckpt_path)
                    print("  ★ new best", end="")
                print()

        print(f"\n  ✓ Best model at epoch {best_epoch}, dev_f1~={best_macro_f1:.3f}")

        # Final save
        model_path = MODEL_DIR / "spacy_textcat"
        nlp.to_disk(model_path)
        print(f"  💾 Model saved → {model_path}")

        # Save metadata
        meta = {
            "model_type": "spacy_textcat_multilabel_bow",
            "categories": ALL_CATS,
            "train_size": len(train),
            "n_iter": n_iter,
            "best_epoch": best_epoch,
            "best_dev_f1_approx": round(best_macro_f1, 4),
            "version": "1.0",
        }
        with (MODEL_DIR / "spacy_meta.json").open("w") as f:
            json.dump(meta, f, indent=2)

    except ImportError as e:
        print(f"  ❌ spaCy not available: {e}")
        print("  Install: pip install spacy")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Airlock ML Model Trainer")
    parser.add_argument(
        "--model-type",
        choices=["spacy", "sklearn", "both"],
        default="both",
        help="Which model to train (default: both)",
    )
    parser.add_argument(
        "--n-iter",
        type=int,
        default=20,
        help="spaCy training iterations (default: 20)",
    )
    args = parser.parse_args()

    print("╔══════════════════════════════════════════════════════╗")
    print("║        Airlock ML Model Trainer — v1.0             ║")
    print("╚══════════════════════════════════════════════════════╝\n")

    # Check preprocessed data exists
    train_path = PROC_DIR / "train.jsonl"
    dev_path = PROC_DIR / "dev.jsonl"

    if not train_path.exists():
        print("❌ Preprocessed data not found. Run preprocess.py first.")
        print(f"   Expected: {train_path}")
        sys.exit(1)

    train = load_jsonl(train_path)
    dev = load_jsonl(dev_path)

    print(f"✓ Loaded {len(train)} train / {len(dev)} dev examples")
    print(f"  Categories: {', '.join(ALL_CATS)}")
    print(f"  Output dir: {MODEL_DIR}")

    start_total = time.perf_counter()

    if args.model_type in ("sklearn", "both"):
        train_sklearn(train, dev)

    if args.model_type in ("spacy", "both"):
        train_spacy(train, dev, n_iter=args.n_iter)

    elapsed = time.perf_counter() - start_total
    print(f"\n{'='*55}")
    print(f"✅ All training complete in {elapsed:.1f}s")
    print(f"   Models directory: {MODEL_DIR}")


if __name__ == "__main__":
    main()
