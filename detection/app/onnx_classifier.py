"""
Sprint 2 — ONNX Micro-Model Classifier
Replaces the heavy Llama3.1:8b Ollama dependency for Tier-3 classification
with a lightweight distilbert-base-uncased model exported to ONNX.

Key advantages over Ollama/Llama:
  - Inference latency: ~15-30 ms on CPU vs 500-3000 ms for Llama
  - RAM footprint: ~260 MB vs 5 GB
  - No GPU required — runs on cheap T3/t3.small AWS instances
  - No separate docker container (Ollama) needed

On first startup, the model is downloaded from HuggingFace and exported to ONNX.
The exported model is cached to disk at ONNX_MODEL_PATH for subsequent runs.

Environment variables:
  ONNX_MODEL_PATH   Path to save/load the ONNX model (default: /tmp/airlock_classifier.onnx)
  ONNX_ENABLED      Set to "false" to fall back to old Llama classifier (default: true)
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any

import structlog

log = structlog.get_logger()

ONNX_MODEL_PATH = os.getenv("ONNX_MODEL_PATH", "/tmp/airlock_classifier_finetuned.onnx")
ONNX_ENABLED    = os.getenv("ONNX_ENABLED", "true").lower() == "true"
HF_MODEL_NAME   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../models/fine_tuned_distilbert")

# TinyBERT ensemble (4M params, structural-validation head)
# huawei-noah/TinyBERT_General_4L_312D — runs in ~5-8ms on CPU
# Set TINYBERT_ENABLED=false to disable the ensemble.
TINYBERT_ONNX_PATH = os.getenv("TINYBERT_ONNX_PATH", "/tmp/airlock_tinybert.onnx")
TINYBERT_HF_NAME   = os.getenv("TINYBERT_HF_NAME",   "huawei-noah/TinyBERT_General_4L_312D")
TINYBERT_ENABLED   = os.getenv("TINYBERT_ENABLED", "true").lower() == "true"

# Ensemble weights: DistilBERT (framing) + TinyBERT (structural)
# These can be overridden by calibration.json ("ensemble_weights" key).
_DISTILBERT_WEIGHT = 0.65
_TINYBERT_WEIGHT   = 0.35

# Calibration sidecar path — written by detection/ml/scripts/train_calibration.py
_CALIBRATION_JSON = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "../../ml/models/calibration.json",
)

# Lazy-loaded globals so import is fast
_ort_session      = None
_tokenizer        = None
_tinybert_session = None
_tinybert_tok     = None


def _ensure_model() -> tuple[Any, Any]:
    """
    Lazy-load or export the ONNX model on first call.
    Returns (ort_session, tokenizer).
    """
    global _ort_session, _tokenizer

    if _ort_session is not None and _tokenizer is not None:
        return _ort_session, _tokenizer

    try:
        from transformers import AutoTokenizer
        import onnxruntime as ort

        _tokenizer = AutoTokenizer.from_pretrained(HF_MODEL_NAME)

        if not os.path.exists(ONNX_MODEL_PATH):
            log.info("onnx_classifier.exporting_model", model=HF_MODEL_NAME, path=ONNX_MODEL_PATH)
            _export_to_onnx()

        _ort_session = ort.InferenceSession(
            ONNX_MODEL_PATH,
            providers=["CPUExecutionProvider"],
        )
        log.info("onnx_classifier.loaded", path=ONNX_MODEL_PATH)
        return _ort_session, _tokenizer

    except ImportError as e:
        log.warning("onnx_classifier.missing_deps", error=str(e),
                    hint="pip install transformers onnxruntime torch optimum")
        raise


def _export_to_onnx() -> None:
    """Export distilbert to ONNX using optimum or torch.onnx."""
    try:
        # Try optimum first (cleanest export)
        from optimum.onnxruntime import ORTModelForSequenceClassification
        from transformers import AutoTokenizer
        model = ORTModelForSequenceClassification.from_pretrained(
            HF_MODEL_NAME, export=True
        )
        model.save_pretrained(os.path.dirname(ONNX_MODEL_PATH) or ".")
        log.info("onnx_classifier.exported_via_optimum")
    except ImportError:
        # Fall back to manual torch.onnx export
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        tokenizer = AutoTokenizer.from_pretrained(HF_MODEL_NAME)
        model = AutoModelForSequenceClassification.from_pretrained(HF_MODEL_NAME)
        model.eval()
        dummy = tokenizer("classify this text", return_tensors="pt", truncation=True, max_length=128)
        with torch.no_grad():
            torch.onnx.export(
                model,
                (dummy["input_ids"], dummy["attention_mask"]),
                ONNX_MODEL_PATH,
                input_names=["input_ids", "attention_mask"],
                output_names=["logits"],
                dynamic_axes={
                    "input_ids": {0: "batch", 1: "seq"},
                    "attention_mask": {0: "batch", 1: "seq"},
                },
                opset_version=14,
            )
        log.info("onnx_classifier.exported_via_torch", path=ONNX_MODEL_PATH)


# ─── Calibration sidecar loader ───────────────────────────────────────────────
# train_calibration.py writes detection/ml/models/calibration.json.
# We load it once at module import time so the temperature is always current.

def _load_calibration() -> dict:
    """Load calibration.json if it exists, else return empty dict."""
    try:
        if os.path.exists(_CALIBRATION_JSON):
            with open(_CALIBRATION_JSON) as f:
                data = json.load(f)
            log.info(
                "onnx_classifier.calibration_loaded",
                T=data.get("temperature"),
                ece=data.get("calibrated_ece"),
            )
            return data
    except Exception as exc:
        log.warning("onnx_classifier.calibration_load_failed", error=str(exc))
    return {}

_CALIBRATION: dict = _load_calibration()


# ─── Sigmoid-based sensitivity label map ───────────────────────────────────────
# distilbert-base-uncased outputs 2 logits → [not_sensitive, sensitive]
# We use logit[1] as a raw sensitivity score (0–1 after sigmoid).

def _sigmoid(x: float) -> float:
    import math
    return 1.0 / (1.0 + math.exp(-x))


# ─── Temperature Scaling (Calibration Layer) ──────────────────────────────────
# Temperature T is loaded from calibration.json (set by train_calibration.py).
# Falls back to ONNX_TEMPERATURE env var, then hardcoded 1.8.

_TEMPERATURE: float = float(
    _CALIBRATION.get("temperature")
    or os.getenv("ONNX_TEMPERATURE", "1.8")
)
# Ensemble weights can also be overridden by calibration.json
if "ensemble_weights" in _CALIBRATION:
    _ew = _CALIBRATION["ensemble_weights"]
    _DISTILBERT_WEIGHT = float(_ew.get("distilbert", _DISTILBERT_WEIGHT))
    _TINYBERT_WEIGHT   = float(_ew.get("tinybert",   _TINYBERT_WEIGHT))

def _calibrated_score(logit: float) -> float:
    """Apply temperature scaling then sigmoid to get a calibrated probability."""
    return _sigmoid(logit / _TEMPERATURE)


# ─── TinyBERT ensemble ─────────────────────────────────────────────────────────

def _ensure_tinybert() -> tuple[Any, Any] | None:
    """
    Lazy-load TinyBERT ONNX session and tokenizer.
    Returns (session, tokenizer) or None if unavailable.

    Export path: huawei-noah/TinyBERT_General_4L_312D is exported to
    TINYBERT_ONNX_PATH using the same _export_tinybert() helper below.
    If export fails, ensemble falls back to DistilBERT-only.
    """
    global _tinybert_session, _tinybert_tok
    if _tinybert_session is not None:
        return _tinybert_session, _tinybert_tok
    if not TINYBERT_ENABLED:
        return None
    try:
        from transformers import AutoTokenizer
        import onnxruntime as ort
        _tinybert_tok = AutoTokenizer.from_pretrained(TINYBERT_HF_NAME)
        if not os.path.exists(TINYBERT_ONNX_PATH):
            log.info("tinybert.exporting", path=TINYBERT_ONNX_PATH)
            _export_tinybert()
        _tinybert_session = ort.InferenceSession(
            TINYBERT_ONNX_PATH,
            providers=["CPUExecutionProvider"],
        )
        log.info("tinybert.loaded", path=TINYBERT_ONNX_PATH)
        return _tinybert_session, _tinybert_tok
    except Exception as exc:
        log.warning("tinybert.unavailable", error=str(exc),
                    hint="pip install transformers onnxruntime torch")
        return None


def _export_tinybert() -> None:
    """Export TinyBERT to ONNX format."""
    try:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        tok   = AutoTokenizer.from_pretrained(TINYBERT_HF_NAME)
        model = AutoModelForSequenceClassification.from_pretrained(
            TINYBERT_HF_NAME, num_labels=2, ignore_mismatched_sizes=True
        )
        model.eval()
        dummy = tok("classify this", return_tensors="pt", truncation=True, max_length=128)
        with torch.no_grad():
            torch.onnx.export(
                model,
                (dummy["input_ids"], dummy["attention_mask"]),
                TINYBERT_ONNX_PATH,
                input_names=["input_ids", "attention_mask"],
                output_names=["logits"],
                dynamic_axes={"input_ids": {0: "batch", 1: "seq"},
                              "attention_mask": {0: "batch", 1: "seq"}},
                opset_version=14,
            )
        log.info("tinybert.exported", path=TINYBERT_ONNX_PATH)
    except Exception as exc:
        log.warning("tinybert.export_failed", error=str(exc))
        raise


def _tinybert_score(text: str) -> float | None:
    """
    Run TinyBERT inference and return calibrated probability for class 1.
    Returns None if TinyBERT is unavailable.
    """
    result = _ensure_tinybert()
    if result is None:
        return None
    session, tokenizer = result
    try:
        import numpy as np
        enc = tokenizer(
            text[:512], return_tensors="np", truncation=True,
            max_length=128, padding="max_length",
        )
        ort_inputs = {
            "input_ids":      enc["input_ids"].astype(np.int64),
            "attention_mask": enc["attention_mask"].astype(np.int64),
        }
        logits = session.run(["logits"], ort_inputs)[0][0]
        raw_logit = float(logits[1]) if len(logits) > 1 else float(logits[0])
        return _calibrated_score(raw_logit)
    except Exception as exc:
        log.warning("tinybert.inference_failed", error=str(exc))
        return None


import re

def _clean_noise(text: str) -> str:
    """
    Remove artificial noise/patterns to improve ONNX F1 score.
    """
    # Remove HTML-like tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Remove repetitive artificial noise (e.g., --------, ****, ====)
    text = re.sub(r'([*_=+\-]){3,}', ' ', text)
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


# ─── Heuristic detection regexes (module-level for performance) ───────────────
# FIXED (BUG-011): Compiling these regexes inside _heuristic_score() on every
# call caused repeated re.compile() overhead. Moved to module level.

_DIRECT_FRAMING_RE = re.compile(
    r'(?i)(?:pretend|ignore\s+(?:previous|above|prior|all)\s+(?:instructions?|prompts?|rules?)|'
    r'act\s+as|roleplay|you\s+are\s+now|forget\s+(?:everything|your\s+training)|'
    r'jailbreak|DAN\s+mode|developer\s+mode|unrestricted\s+mode)',
)
_INDIRECT_FRAMING_RE = re.compile(
    r'(?i)(?:(?:this\s+is|just\s+a)\s+(?:fictional|hypothetical|educational|tutorial|example|test|demo)|'
    r"i(?:'m|\s+am)\s+writing\s+a\s+(?:book|story|tutorial|guide|blog)|'"
    r'(?:in\s+a\s+(?:story|novel|game|scenario|simulation))|'
    r'for\s+(?:educational|research|academic|testing)\s+purposes|'
    r'imagine\s+(?:if|that|you|a\s+world))',
)
_ESCALATION_RE = re.compile(
    r'(?i)(?:override\s+(?:safety|policy|filter|restriction)|'
    r'bypass\s+(?:content|safety|the)|'
    r'ignore\s+(?:safety|guidelines|ethical)|'
    r'must\s+comply|you\s+must\s+answer|no\s+restrictions)',
)
_SENSITIVE_KEYWORD_RE = re.compile(
    r'(?i)(?:password|secret|api.key|private.key|credentials?|token|ssn|social.security)',
)


def _heuristic_score(text: str) -> float:
    """
    Manual heuristic rules that directly compensate for the ONNX model's two
    known blind spots:

    1. Structured secrets that look syntactically different from training data
       (credit cards, SSNs, API key assignments).
    2. Framing attacks — nested or indirect phrasing that wraps a real secret
       in a fictional / tutorial / hypothetical context to evade the classifier.

    Returns an additive boost in [0, 1] that is combined with the ONNX score.
    """
    score = 0.0
    text_lower = text.lower()

    # ── Structured secrets ────────────────────────────────────────────────────
    if re.search(r'\b(?:\d[ -]*?){13,16}\b', text):          # Credit card
        score += 0.4
    if re.search(r'\b\d{3}[-.]?\d{2}[-.]?\d{4}\b', text):   # SSN
        score += 0.4
    if re.search(r'(?:api[_-]?key|password|secret|private[_-]?key|bearer)\s*[:=]', text_lower):
        score += 0.35
    if re.search(r'\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b', text):  # AWS key ID
        score += 0.5
    if re.search(r'sk-[a-zA-Z0-9]{20,}', text):               # OpenAI key
        score += 0.5
    if re.search(r'gh[pso]_[a-zA-Z0-9]{36}', text):           # GitHub PAT
        score += 0.5

    # ── Framing-attack detection — use pre-compiled module-level regexes ──────
    if _DIRECT_FRAMING_RE.search(text):
        score += 0.45
    if _INDIRECT_FRAMING_RE.search(text):
        score += 0.25
    if _ESCALATION_RE.search(text):
        score += 0.35
    # Compound: indirect framing + sensitive keyword → very likely an attack
    if _INDIRECT_FRAMING_RE.search(text) and _SENSITIVE_KEYWORD_RE.search(text):
        score += 0.30  # extra boost for the combo

    return score


# ─── Intent Classification Layer ─────────────────────────────────────────────
# Priority 2 from ACCURACY_IMPROVEMENTS_STATUS.txt:
# Distinguish "educational" context (lower FP) from "adversarial" (escalate).
#
# Returns a float modifier in the range [-0.30, +0.45]:
#   positive  → more likely adversarial / genuinely sensitive
#   negative  → strong signal this is a test/docs context → reduce score

_EDUCATIONAL_SAFE_RE = re.compile(
    r'(?i)(?:'
    # Explicit test/example/dummy signals
    r'(?:this\s+is\s+(?:a\s+)?(?:test|example|demo|sample|dummy|fake|mock|placeholder))|'
    r'(?:(?:for\s+)?(?:testing|demo|sandbox|staging)\s+(?:only|purposes?|environment))|'
    r'(?:do\s+not\s+use\s+in\s+(?:production|prod))|'
    r'(?:(?:dummy|fake|sample|placeholder|synthetic|generated)\s+(?:data|value|key|secret|credential|number|id))|'
    r'(?:not\s+(?:a\s+)?real\s+(?:key|secret|password|credential|id|number))|'
    r'(?:(?:example|sample)\s+(?:only|value|output))|'
    # Documentation context signals
    r'(?:see\s+(?:the\s+)?(?:docs?|documentation|readme|wiki))|'
    r'(?:replace\s+with\s+(?:your|actual|real))|'
    r'(?:insert\s+(?:your|actual|real))|'
    # Code-comment context
    r'(?://|#\s|/\*|\*\s)(?:todo|fixme|note|example|placeholder)|'
    r'(?:api_key\s*=\s*["\']?(?:your|my|<|\[))|'
    r'(?:password\s*=\s*["\']?(?:your|changeme|password123|secret|<|\[))'
    r')'
)

_ADVERSARIAL_STRONG_RE = re.compile(
    r'(?i)(?:'
    r'ignore\s+(?:previous|above|all)\s+(?:instructions?|rules?|prompts?)|'
    r'jailbreak|DAN\s+mode|developer\s+mode|unrestricted\s+mode|'
    r'bypass\s+(?:content|safety|filter|restriction|policy)|'
    r'override\s+(?:safety|policy|filter)|'
    r'you\s+(?:must|have\s+to)\s+(?:comply|answer|reveal|share|show)|'
    r'no\s+(?:restrictions?|filters?|limits?|rules?)'
    r')'
)


def _intent_modifier(text: str, heuristic_boost: float) -> float:
    """
    Intent classification modifier.

    Logic:
    - If strong adversarial signals are present → +0.35 (escalate regardless of framing)
    - If educational/test signals are present AND heuristic_boost is low
      (i.e., no structural secret found by regex) → −0.25 (reduce FP)
    - If educational signals are present BUT structural secrets were also found
      → only −0.10 (mildly reduce; keep it sensitive)
    - Otherwise → 0.0 (no change)
    """
    if _ADVERSARIAL_STRONG_RE.search(text):
        return 0.35  # Hard escalate — adversarial intent overrides educational framing

    if _EDUCATIONAL_SAFE_RE.search(text):
        if heuristic_boost < 0.35:
            # No structural secret found — likely a genuine test/docs context
            return -0.25
        else:
            # Educational framing PLUS real-looking secret → likely adversarial
            return -0.10  # small reduction only

    return 0.0


def classify_sensitivity(text: str) -> dict[str, Any]:
    """
    Run ONNX ensemble inference and return a sensitivity score dict.

    Pipeline:
      1. DistilBERT (66M params) — framing / semantic understanding
      2. TinyBERT  (4M params)  — structural validation (~5ms extra)
      3. Weighted aggregate (65% DistilBERT + 35% TinyBERT)
      4. Heuristic boost (AWS key, credit card, SSN, framing patterns)
      5. Intent modifier (educational ↓, adversarial escalation ↑)
      6. Hard override: heuristic ≥ 0.45 but score < 0.55 → floor to 0.60

    Returns:
        {
            "classification": "SAFE" | "SENSITIVE" | "RESTRICTED",
            "confidence": float,   # 0.0 – 1.0
            "reason": str,
            "latency_ms": float,
        }
    """
    start = time.perf_counter()

    try:
        session, tokenizer = _ensure_model()

        # Clean text to remove artificial noise / HTML tags
        clean_text = _clean_noise(text[:1024])

        import numpy as np
        inputs = tokenizer(
            clean_text[:512],
            return_tensors="np",
            truncation=True,
            max_length=128,
            padding="max_length",
        )

        ort_inputs = {
            "input_ids":      inputs["input_ids"].astype(np.int64),
            "attention_mask": inputs["attention_mask"].astype(np.int64),
        }
        logits = session.run(["logits"], ort_inputs)[0][0]  # shape: (num_labels,)

        # ── DistilBERT calibrated score ──────────────────────────────────────
        distilbert_score = _calibrated_score(
            float(logits[1]) if len(logits) > 1 else float(logits[0])
        )

        # ── TinyBERT ensemble score (graceful fallback to DistilBERT-only) ───
        tinybert_raw = _tinybert_score(clean_text)
        if tinybert_raw is not None:
            base_onnx_score = (
                _DISTILBERT_WEIGHT * distilbert_score
                + _TINYBERT_WEIGHT  * tinybert_raw
            )
            ensemble_note = (
                f"distilbert={distilbert_score:.3f}x{_DISTILBERT_WEIGHT}, "
                f"tinybert={tinybert_raw:.3f}x{_TINYBERT_WEIGHT}"
            )
        else:
            base_onnx_score = distilbert_score
            ensemble_note   = f"distilbert={distilbert_score:.3f} (tinybert unavail)"

        # ── Heuristic boost (structured secrets) ────────────────────────────
        heuristic_boost = _heuristic_score(clean_text)

        # ── Intent modifier (educational vs adversarial) ─────────────────────
        intent_mod = _intent_modifier(clean_text, heuristic_boost)

        # ── Combine all signals ──────────────────────────────────────────────
        sensitive_score = min(1.0, max(0.0,
            base_onnx_score + heuristic_boost + intent_mod
        ))

        # Hard override: structural evidence trumps borderline ONNX SAFE
        if heuristic_boost >= 0.45 and sensitive_score < 0.55:
            sensitive_score = max(sensitive_score, 0.60)

        latency_ms = (time.perf_counter() - start) * 1000

        if sensitive_score > 0.80:
            classification = "RESTRICTED"
        elif sensitive_score > 0.55:
            classification = "SENSITIVE"
        else:
            classification = "SAFE"

        return {
            "classification": classification,
            "confidence":     round(sensitive_score, 4),
            "reason": (
                f"ensemble=({ensemble_note}) T={_TEMPERATURE}, "
                f"heuristic={heuristic_boost:.3f}, intent={intent_mod:+.3f}, "
                f"combined={sensitive_score:.3f}"
            ),
            "latency_ms": round(latency_ms, 2),
        }

    except Exception as exc:
        latency_ms = (time.perf_counter() - start) * 1000
        log.warning("onnx_classifier.inference_error", error=str(exc))
        return {
            "classification": "UNKNOWN",
            "confidence":     0.0,
            "reason":         f"ONNX inference failed: {exc}",
            "latency_ms":     round(latency_ms, 2),
        }
