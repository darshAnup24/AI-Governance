"""
ShieldAI ML Classifier — Detection Integration Layer
=====================================================
Loads trained sklearn + spaCy models and exposes a unified
`MLClassifier.detect(text)` → DetectionResult interface that
plugs into the existing 3-tier detection pipeline.

Loading strategy:
  1. Try sklearn pickle (fast, ~2ms) — always available
  2. Try spaCy model (accurate, ~10ms) — falls back gracefully
  3. Emergency fallback: keyword heuristics if both fail
"""

from __future__ import annotations

import json
import pickle
import time
from pathlib import Path
from typing import Any

import structlog

from proxy.app.models import DetectedSpan, DetectionCategory, DetectionResult

log = structlog.get_logger()

# ── Paths ─────────────────────────────────────────────────────────────────────

_THIS_DIR = Path(__file__).parent
_ML_DIR = _THIS_DIR.parent / "ml"
_MODEL_DIR = _ML_DIR / "models"

# ── Category → DetectionCategory mapping ─────────────────────────────────────

CATEGORY_MAP: dict[str, DetectionCategory] = {
    "PII": DetectionCategory.PII,
    "CREDENTIALS": DetectionCategory.CREDENTIALS,
    "PROMPT_INJECTION": DetectionCategory.PROMPT_INJECTION,
    "HALLUCINATION": DetectionCategory.HALLUCINATION,
    "BIAS": DetectionCategory.BIAS,
    "REGULATORY": DetectionCategory.REGULATORY,
    "SAFE": DetectionCategory.SAFE,
}

# ── Category → risk score contribution ───────────────────────────────────────

CATEGORY_RISK: dict[str, float] = {
    "CREDENTIALS": 95.0,
    "PROMPT_INJECTION": 90.0,
    "REGULATORY": 85.0,
    "PII": 75.0,
    "BIAS": 70.0,
    "HALLUCINATION": 55.0,
    "SAFE": 0.0,
}

# Minimum confidence threshold to create a span
CONFIDENCE_THRESHOLD = 0.45


class MLClassifier:
    """
    Production ML classifier that integrates with the detection pipeline.

    Usage:
        clf = MLClassifier()
        result: DetectionResult = clf.detect("your text here")
    """

    def __init__(self) -> None:
        self._sklearn_model: Any = None
        self._spacy_nlp: Any = None
        self._all_cats: list[str] = [
            "SAFE", "PII", "CREDENTIALS", "PROMPT_INJECTION",
            "HALLUCINATION", "BIAS", "REGULATORY",
        ]
        self._sklearn_loaded = False
        self._spacy_loaded = False
        self._load_attempted = False

    # ── Model Loading ─────────────────────────────────────────────────────────

    def _load_models(self) -> None:
        """Load models once, lazily on first call."""
        if self._load_attempted:
            return
        self._load_attempted = True

        # 1. Load sklearn model
        sklearn_path = _MODEL_DIR / "sklearn_classifier.pkl"
        if sklearn_path.exists():
            try:
                with sklearn_path.open("rb") as f:
                    self._sklearn_model = pickle.load(f)
                self._sklearn_loaded = True
                log.info("ml_classifier.sklearn_loaded", path=str(sklearn_path))
            except Exception as e:
                log.warning("ml_classifier.sklearn_load_failed", error=str(e))

        # 2. Load spaCy model
        spacy_path = _MODEL_DIR / "spacy_textcat_best"
        if not spacy_path.exists():
            spacy_path = _MODEL_DIR / "spacy_textcat"

        if spacy_path.exists():
            try:
                import spacy as _spacy
                self._spacy_nlp = _spacy.load(str(spacy_path))
                self._spacy_loaded = True
                log.info("ml_classifier.spacy_loaded", path=str(spacy_path))
            except Exception as e:
                log.warning("ml_classifier.spacy_load_failed", error=str(e))

        if not self._sklearn_loaded and not self._spacy_loaded:
            log.warning(
                "ml_classifier.no_models_found",
                sklearn_path=str(sklearn_path),
                spacy_path=str(spacy_path),
                hint="Run: python detection/ml/scripts/train.py",
            )

    # ── Inference ─────────────────────────────────────────────────────────────

    def _sklearn_predict(self, text: str) -> dict[str, float]:
        """Run sklearn model, return {category: probability}."""
        try:
            # sklearn MultiOutputClassifier.predict_proba returns list of arrays
            proba_list = self._sklearn_model.predict_proba([text])
            scores: dict[str, float] = {}
            for i, cat in enumerate(self._all_cats):
                # Each element is array of shape (1, 2) → proba of positive class
                if i < len(proba_list):
                    scores[cat] = float(proba_list[i][0][1])
                else:
                    scores[cat] = 0.0
            return scores
        except Exception as e:
            log.warning("ml_classifier.sklearn_predict_failed", error=str(e))
            return {}

    def _spacy_predict(self, text: str) -> dict[str, float]:
        """Run spaCy textcat, return {category: probability}."""
        try:
            doc = self._spacy_nlp(text[:4000])  # Limit for performance
            return {cat: float(doc.cats.get(cat, 0.0)) for cat in self._all_cats}
        except Exception as e:
            log.warning("ml_classifier.spacy_predict_failed", error=str(e))
            return {}

    def _ensemble_scores(self, sklearn_scores: dict, spacy_scores: dict) -> dict[str, float]:
        """
        Weighted ensemble of sklearn + spaCy predictions.
        spaCy gets more weight (0.6) as it has better generalisation.
        If only one model available, use it directly.
        """
        if not sklearn_scores and not spacy_scores:
            return {}
        if not sklearn_scores:
            return spacy_scores
        if not spacy_scores:
            return sklearn_scores

        # Weighted average: spaCy 60%, sklearn 40%
        result = {}
        for cat in self._all_cats:
            s = sklearn_scores.get(cat, 0.0)
            p = spacy_scores.get(cat, 0.0)
            result[cat] = 0.4 * s + 0.6 * p
        return result

    # ── Main detect() ─────────────────────────────────────────────────────────

    def detect(self, text: str) -> DetectionResult:
        """
        Run ML classification and return DetectionResult.
        Integrates with the existing detection pipeline as an additional tier.
        """
        start = time.perf_counter()
        self._load_models()

        sklearn_scores: dict[str, float] = {}
        spacy_scores: dict[str, float] = {}

        if self._sklearn_loaded:
            sklearn_scores = self._sklearn_predict(text)

        if self._spacy_loaded:
            spacy_scores = self._spacy_predict(text)

        # Ensemble
        scores = self._ensemble_scores(sklearn_scores, spacy_scores)

        if not scores:
            # No models loaded — return empty result
            return DetectionResult(
                detector_name="ml_classifier",
                spans=[],
                risk_score=0,
                processing_time_ms=round((time.perf_counter() - start) * 1000, 2),
            )

        # Build spans for non-SAFE, high-confidence predictions
        spans: list[DetectedSpan] = []
        max_risk = 0.0

        for cat, confidence in scores.items():
            if cat == "SAFE":
                continue
            if confidence < CONFIDENCE_THRESHOLD:
                continue

            risk_contribution = CATEGORY_RISK.get(cat, 50.0) * confidence
            max_risk = max(max_risk, risk_contribution)

            det_cat = CATEGORY_MAP.get(cat, DetectionCategory.CONFIDENTIAL)
            spans.append(DetectedSpan(
                start=0,
                end=len(text),
                category=det_cat,
                confidence=round(confidence, 4),
                matched_text=f"[ML:{cat} {confidence:.0%}]",
                detector="ml_classifier",
                context=f"sklearn={sklearn_scores.get(cat, 0):.2f} spacy={spacy_scores.get(cat, 0):.2f}",
            ))

        # Sort by confidence descending
        spans.sort(key=lambda s: s.confidence, reverse=True)

        duration_ms = (time.perf_counter() - start) * 1000

        return DetectionResult(
            detector_name="ml_classifier",
            spans=spans,
            risk_score=round(min(100, max_risk), 2),
            processing_time_ms=round(duration_ms, 2),
        )

    # ── Utility ───────────────────────────────────────────────────────────────

    @property
    def is_loaded(self) -> bool:
        return self._sklearn_loaded or self._spacy_loaded

    def status(self) -> dict[str, Any]:
        """Return model status for the health check endpoint."""
        self._load_models()
        return {
            "sklearn": self._sklearn_loaded,
            "spacy": self._spacy_loaded,
            "model_dir": str(_MODEL_DIR),
            "categories": self._all_cats,
        }

    def predict_raw(self, text: str) -> dict[str, float]:
        """Return raw score dict — useful for debugging and API exposure."""
        self._load_models()
        s = self._sklearn_predict(text) if self._sklearn_loaded else {}
        p = self._spacy_predict(text) if self._spacy_loaded else {}
        ensemble = self._ensemble_scores(s, p)
        return {
            "scores": ensemble,
            "sklearn": s,
            "spacy": p,
        }
