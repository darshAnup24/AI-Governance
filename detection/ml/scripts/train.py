"""
ShieldAI ML Model Trainer
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

# ── Paths ─────────────────────────────────────────────────────────────────────

ML_DIR = Path(__file__).parent.parent
PROC_DIR = ML_DIR / "data" / "processed"
MODEL_DIR = ML_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

ALL_CATS = ["SAFE", "PII", "CREDENTIALS", "PROMPT_INJECTION", "HALLUCINATION", "BIAS", "REGULATORY"]

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


# ── sklearn Training ──────────────────────────────────────────────────────────

def train_sklearn(train: list[dict], dev: list[dict]) -> None:
    """Train sklearn TF-IDF + LogisticRegression multi-label classifier."""
    try:
        import pickle
        import numpy as np
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression
        from sklearn.multioutput import MultiOutputClassifier
        from sklearn.calibration import CalibratedClassifierCV
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import MultiLabelBinarizer
        from sklearn.metrics import classification_report, f1_score

        print("\n" + "=" * 55)
        print("Training sklearn TF-IDF + LogisticRegression baseline")
        print("=" * 55)

        train_texts, train_labels = extract_texts_labels(train)
        dev_texts, dev_labels = extract_texts_labels(dev)

        train_labels_arr = np.array(train_labels)
        dev_labels_arr = np.array(dev_labels)

        # Build pipeline
        base_clf = LogisticRegression(
            C=1.5,
            max_iter=2000,
            solver="saga",
            class_weight="balanced",
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

        start = time.perf_counter()
        pipeline.fit(train_texts, train_labels_arr)
        elapsed = time.perf_counter() - start
        print(f"  ✓ Training completed in {elapsed:.1f}s")

        # Evaluate on dev set
        dev_preds = pipeline.predict(dev_texts)
        micro_f1 = f1_score(dev_labels_arr, dev_preds, average="micro", zero_division=0)
        macro_f1 = f1_score(dev_labels_arr, dev_preds, average="macro", zero_division=0)

        print(f"  Dev Micro-F1: {micro_f1:.4f}")
        print(f"  Dev Macro-F1: {macro_f1:.4f}")

        # Per-category report
        print("\n  Per-category Dev Metrics:")
        for i, cat in enumerate(ALL_CATS):
            from sklearn.metrics import precision_score, recall_score
            p = precision_score(dev_labels_arr[:, i], dev_preds[:, i], zero_division=0)
            r = recall_score(dev_labels_arr[:, i], dev_preds[:, i], zero_division=0)
            f = f1_score(dev_labels_arr[:, i], dev_preds[:, i], zero_division=0)
            n_pos = dev_labels_arr[:, i].sum()
            bar = "█" * int(f * 20)
            print(f"    {cat:<22}  P={p:.2f} R={r:.2f} F1={f:.2f} {bar}  (n={n_pos})")

        # Save model
        model_path = MODEL_DIR / "sklearn_classifier.pkl"
        with model_path.open("wb") as f:
            pickle.dump(pipeline, f)
        print(f"\n  💾 Model saved → {model_path}")

        # Save metadata
        meta = {
            "model_type": "sklearn_tfidf_lr",
            "categories": ALL_CATS,
            "train_size": len(train),
            "dev_micro_f1": round(micro_f1, 4),
            "dev_macro_f1": round(macro_f1, 4),
            "training_time_s": round(elapsed, 2),
            "version": "1.0",
        }
        with (MODEL_DIR / "sklearn_meta.json").open("w") as f:
            json.dump(meta, f, indent=2)

    except ImportError as e:
        print(f"  ❌ sklearn not available: {e}")
        print("  Install: pip install scikit-learn")


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
    parser = argparse.ArgumentParser(description="ShieldAI ML Model Trainer")
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
    print("║        ShieldAI ML Model Trainer — v1.0             ║")
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
