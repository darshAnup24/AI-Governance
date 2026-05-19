"""
AI Governance Firewall — Detection Service (ShieldAI Extended)
Full multi-tier detection pipeline: Regex → NER → Hallucination → Bias →
Security → Regulatory → Prompt Injection → ONNX micro-model (Sprint 2).
"""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator
from concurrent.futures import ThreadPoolExecutor

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import hashlib
import json
import math
import os
from redis.asyncio import Redis

from proxy.app.logging_config import setup_logging
from proxy.app.models import ActionType, DetectedSpan, DetectionCategory, DetectionResult, FinalRiskScore

from detection.app.preprocessor import sanitize, fast_path_route, length_defense
from detection.app.regex_detector import RegexDetector
from detection.app.ner_detector import DebertaNERDetector
from detection.app.risk_scorer import RiskScoreAggregator, redact_prompt, REDUCED_SENSITIVITY_ROLES
from detection.app.llama_classifier import LlamaClassifier
from detection.app.detectors.hallucination_detector import HallucinationDetector
from detection.app.detectors.bias_detector import BiasDetector
from detection.app.detectors.security_code_detector import SecurityCodeDetector
from detection.app.detectors.regulatory_detector import RegulatoryDetector
from detection.app.detectors.prompt_injection_detector import PromptInjectionDetector
from detection.app.ml_classifier import MLClassifier
# Sprint 2: ONNX micro-model (replaces heavy Llama in Tier 3)
from detection.app.onnx_classifier import classify_sensitivity, ONNX_ENABLED
# Phase 4: RL Feedback Collection
from detection.app.feedback_api import FeedbackStore
from detection.app.rl_threshold_tuner import RLThresholdTuner

log = structlog.get_logger()

# ─── Globals (loaded once at startup) ─────────────────────

regex_detector = RegexDetector()
ner_detector = DebertaNERDetector()
risk_aggregator = RiskScoreAggregator()
llama_classifier = LlamaClassifier()
hallucination_detector = HallucinationDetector()
bias_detector = BiasDetector()
security_code_detector = SecurityCodeDetector()
regulatory_detector = RegulatoryDetector()
prompt_injection_detector = PromptInjectionDetector()
ml_classifier = MLClassifier()  # Trained sklearn + spaCy ensemble
# Phase 4: RL Feedback Store
feedback_store = FeedbackStore()

TIER3_THRESHOLD_LOW  = 40
TIER3_THRESHOLD_HIGH = 70
MAX_PROMPT_CHARS     = 4000

redis_client: Redis | None = None
# True parallel execution for C-extension ML models (which release the GIL)
ml_executor = ThreadPoolExecutor(max_workers=8)


# ─── Tier 0: Semantic Fast-Path ───────────────────────────
# Classify input BEFORE running the full detector suite.
# Route:
#   "code"             → all tiers + syntax-aware chunking (full 50ms budget)
#   "natural_language" → Tier 1 regex + ML only; skip heavy NER/security detectors
#   "mixed"            → all tiers (conservative)
#
# Latency gain for pure NL prompts: ~15-30ms (skips spaCy NER, security_code,
# hallucination, and bias detectors which are irrelevant for plain chat).

import re as _re

# Markers that strongly indicate a code block is present
_CODE_BLOCK_RE = _re.compile(
    r'(?:```|~~~|\bimport\b|\bfrom\b\s+\w+\s+\bimport\b|'
    r'\bfunction\b|\bclass\b\s+\w+[\s:{(]|\bdef\b\s+\w+\s*\(|'
    r'\bconst\b|\blet\b|\bvar\b\s+\w+\s*=|'
    r'\b(?:public|private|protected)\b\s+(?:static\s+)?\w+|'
    r'\bSELECT\b.*\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\b.*\bSET\b|'
    r'\$\{|=>\s*\{|->\s*\{)',
    _re.IGNORECASE | _re.DOTALL,
)

# Markers that strongly indicate a URL / connection string / structured data
_STRUCTURED_DATA_RE = _re.compile(
    r'(?:https?://|ftp://|ssh://|git@|mongodb\+srv://|postgresql://|'
    r'redis://|amqp://|-----BEGIN|\bAKIA[A-Z0-9]{16}\b|'
    r'eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+)',
)


def classify_input_context(text: str) -> str:
    """
    Tier-0 semantic fast-path classifier.

    Returns one of:
      "code"             — contains code blocks, SQL, or structured data patterns
      "natural_language" — plain prose / chat; no code markers detected
      "mixed"            — ambiguous; fall back to full pipeline
    """
    has_code       = bool(_CODE_BLOCK_RE.search(text))
    has_structured = bool(_STRUCTURED_DATA_RE.search(text))

    if has_code or has_structured:
        # Check if it also has natural-language sentences
        # Simple heuristic: sentence-ending punctuation ratio
        sentence_count = len(_re.findall(r'[.!?]\s', text))
        word_count     = len(text.split())
        nl_ratio       = sentence_count / max(word_count, 1)
        if nl_ratio > 0.05 and not has_code:
            return "mixed"
        return "code"

    return "natural_language"


# ─── Request / Response Models ───────────────────────────

class DetectRequest(BaseModel):
    text: str
    user_id: str = ""
    department: str = ""
    role: str = ""
    org_id: str = ""


class DetectResponse(BaseModel):
    detection_id: str = ""  # SHA-256 hash of the request text — used by feedback loop
    risk_score: int
    action: ActionType
    detection_results: list[DetectionResult]
    detected_spans: list[DetectedSpan]
    processing_time_ms: float
    eu_ai_act_risk_level: str = "MINIMAL"
    regulatory_flags: list[dict[str, Any]] = []
    remediation_priority: list[str] = []


# ─── Phase 4: RL Feedback Models ──────────────────────

class FeedbackRequest(BaseModel):
    """User feedback on a detection result"""
    detection_id: str
    model_prediction: str                    # What model predicted
    model_confidence: float                  # Model confidence (0.0-1.0)
    model_threshold: float                   # Threshold used
    user_correction: str                     # What user says is correct
    user_confidence: float = 0.95            # User confidence (0.0-1.0)
    notes: str = ""


class FeedbackResponse(BaseModel):
    """Response to feedback submission"""
    status: str
    feedback_id: str
    message: str


# ─── Lifespan ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global redis_client
    setup_logging("INFO")
    
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    try:
        redis_client = Redis.from_url(redis_url, decode_responses=True)
    except Exception as e:
        log.warning("detection.redis_init_failed", error=str(e))
        
    log.info("detection.startup", tiers=["regex", "ner", "onnx_micro_model", "llama_fallback"])
    yield
    if redis_client:
        await redis_client.aclose()
    log.info("detection.shutdown")


# ─── App ──────────────────────────────────────────────────

app = FastAPI(
    title="AI Governance Firewall — Detection Engine",
    description="3-tier ML detection pipeline for PII, secrets, and sensitive content",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "detection", "version": "0.1.0"}


@app.post("/detect", response_model=DetectResponse)
async def detect(request: DetectRequest) -> DetectResponse:
    """
    Run the extended detection pipeline:
      All detectors run in parallel (Tier 1-2 + ShieldAI detectors)
      Tier 3 (Llama) runs only if score is ambiguous (40-70)
    """
    start = time.perf_counter()

    # ── Preprocessing Stage 1: Input Sanitization ────────────────────────────
    # Strip null bytes, NFKC-normalize, collapse whitespace.  Runs before any
    # hashing or caching so all downstream stages see a clean, canonical text.
    text_to_scan, _sv = sanitize(request.text)
    log.debug("preprocess.sanitize", **_sv)

    # ── Preprocessing Stage 2a: Empty-input fast path ────────────────────────
    # Return immediately for blank / whitespace-only prompts — no scan needed.
    _fp_verdict, _fpv = fast_path_route(text_to_scan)
    log.debug("preprocess.fast_path", **_fpv)
    if _fpv.get("route") == "empty":
        log.info("preprocess.empty_fast_path", latency_ms=_fpv.get("latency_ms"))
        _empty_hash = hashlib.sha256(text_to_scan.encode("utf-8")).hexdigest()
        return DetectResponse(
            detection_id=_empty_hash,
            risk_score=0,
            action=ActionType.ALLOW,
            detection_results=[],
            detected_spans=[],
            processing_time_ms=round((time.perf_counter() - start) * 1000, 2),
        )

    # ── Preprocessing Stage 3: Verifiable Length Defense ─────────────────────
    # Replaces the previous silent head+tail concatenation with an explicit
    # [N_CHARS_SKIPPED_BY_SHIELD] marker so auditors can verify no edge data
    # was dropped.  Also emits first/last edge SHA-256 fingerprints.
    synthetic_middle_risk = None
    if len(text_to_scan) > MAX_PROMPT_CHARS:
        text_to_scan, _ldv = length_defense(text_to_scan, max_len=MAX_PROMPT_CHARS, edge_len=2000)
        log.info("preprocess.length_defense", **_ldv)
        synthetic_middle_risk = DetectionResult(
            detector_name="length_guard",
            spans=[],
            risk_score=50.0,
            processing_time_ms=_ldv.get("latency_ms", 0.0),
        )

    # B4: Check Redis Cache
    # Role is collapsed into a 2-state bucket: reduced-sensitivity roles
    # (security/admin/ciso) all map to the same modifier in risk_scorer, so
    # caching by raw role would split identical verdicts across 3 keys.
    prompt_hash = hashlib.sha256(text_to_scan.encode("utf-8")).hexdigest()
    role_bucket = "r" if request.role.lower() in REDUCED_SENSITIVITY_ROLES else "n"
    cache_key = f"detection:cache:{prompt_hash}:{role_bucket}"
    
    if redis_client:
        try:
            cached_res = await redis_client.get(cache_key)
            if cached_res:
                log.info("detection.cache_hit", hash=prompt_hash)
                cached_dict = json.loads(cached_res)
                cached_dict["processing_time_ms"] = round((time.perf_counter() - start) * 1000, 2)
                # Cache only stores safe metadata — reconstruct DetectResponse with empty
                # detection_results (raw results are never cached for security)
                cached_dict.setdefault("detection_results", [])
                return DetectResponse(**cached_dict)
        except Exception as e:
            log.warning("detection.cache_read_failed", error=str(e))

    # ─── Tier 0: Classify input type (fast path routing) ────────────────────
    # fast_path_route() already ran above for empty detection.  Re-use its
    # route decision to set input_context without a second pass when possible.
    # Derive input_context from fast_path_route flags already computed above.
    # If code_markers is True we already know it's "code" — no need to re-scan
    # with classify_input_context()'s two extra regex passes.
    if _fpv.get("route") == "natural_language":
        input_context = "natural_language"
    elif _fpv.get("code_markers"):
        input_context = "code"
    elif _fpv.get("secret_context") or _fpv.get("vuln_signal"):
        # Structured secrets / attack payloads — treat as code for full detector suite
        input_context = "code"
    else:
        # Injection / regulatory signals are prose-based; classify_input_context
        # needed only to catch edge cases like JWTs/URLs not in _CODE_MARKERS
        input_context = classify_input_context(text_to_scan)
    log.debug("tier0.context", input_context=input_context, text_len=len(text_to_scan),
              preprocess_route=_fpv.get("route"))

    # ─── Run detectors in parallel — set varies by input context ─────────────
    # Pure natural language: skip heavy NER, security_code, hallucination, bias
    # (they add ~15-30ms and are irrelevant for plain chat messages).
    # Code or mixed: run full suite.
    async def _run_detector_with_timeout(func, text, detector_name, timeout: float = 0.05):
        start_t = time.perf_counter()
        try:
            loop = asyncio.get_running_loop()
            # Run in explicit executor to achieve true parallelism (GIL released by ML engines)
            return await asyncio.wait_for(loop.run_in_executor(ml_executor, func, text), timeout)
        except asyncio.TimeoutError:
            log.warning("detector.timeout", detector=detector_name, timeout=timeout)
            return DetectionResult(
                detector_name=detector_name,
                spans=[],
                risk_score=0,
                processing_time_ms=timeout * 1000
            )
        except Exception as e:
            log.warning("detector.failed", detector=detector_name, error=str(e))
            return DetectionResult(
                detector_name=detector_name,
                spans=[],
                risk_score=0,
                processing_time_ms=(time.perf_counter() - start_t) * 1000
            )

    # Tier 1 + ML — always run
    futures = [
        _run_detector_with_timeout(regex_detector.detect,              text_to_scan, "regex",            1.0),
        _run_detector_with_timeout(prompt_injection_detector.detect,   text_to_scan, "prompt_injection",  1.0),
        _run_detector_with_timeout(ml_classifier.detect,               text_to_scan, "ml_classifier",     5.0),
    ]

    if input_context in ("code", "mixed", "unknown"):
        # Full suite for code / mixed / unknown contexts
        futures += [
            _run_detector_with_timeout(ner_detector.detect,            text_to_scan, "ner",               5.0),
            _run_detector_with_timeout(hallucination_detector.detect,  text_to_scan, "hallucination",     1.0),
            _run_detector_with_timeout(bias_detector.detect,           text_to_scan, "bias",              1.0),
            _run_detector_with_timeout(security_code_detector.detect,  text_to_scan, "security_code",     1.0),
            _run_detector_with_timeout(regulatory_detector.detect,     text_to_scan, "regulatory",        1.0),
        ]
    else:
        # Natural language fast path: only regulatory (compliance always required)
        futures += [
            _run_detector_with_timeout(regulatory_detector.detect,     text_to_scan, "regulatory",        1.0),
        ]

    results = list(await asyncio.gather(*futures))

    if synthetic_middle_risk:
        results.append(synthetic_middle_risk)

    # Aggregate with weighted confidence fusion + input context
    intermediate_score = risk_aggregator.aggregate(results, request.role, input_context)

    # Track whether Tier 3 adds new evidence; only re-aggregate if it does.
    _results_len_before_tier3 = len(results)

    # ─── Tier 3: ONNX micro-model (Sprint 2) → Llama fallback ─────────────
    if TIER3_THRESHOLD_LOW <= intermediate_score.score <= TIER3_THRESHOLD_HIGH:
        if ONNX_ENABLED:
            try:
                loop = asyncio.get_running_loop()
                # Use shared ml_executor (not None) to avoid creating a new thread-pool per call
                # Wrapped in wait_for: ONNX was the only detector without a timeout
                onnx_result = await asyncio.wait_for(
                    loop.run_in_executor(ml_executor, classify_sensitivity, text_to_scan),
                    timeout=5.0,
                )
                onnx_label = onnx_result.get("classification", "UNKNOWN")
                onnx_conf = onnx_result.get("confidence", 0.0)
                log.info("tier3.onnx", label=onnx_label, conf=onnx_conf,
                         ms=onnx_result.get("latency_ms"))
                if onnx_label in ("SENSITIVE", "RESTRICTED") and onnx_conf > 0.55:
                    synthetic = DetectionResult(
                        detector_name="onnx_micro_model",
                        spans=[DetectedSpan(start=0, end=0, category=DetectionCategory.CONFIDENTIAL,
                                  confidence=onnx_conf,
                                  matched_text=f"[ONNX:{onnx_label}]",
                                  detector="onnx_micro_model",
                                  context=onnx_result.get("reason", ""))],
                        risk_score=onnx_conf * 100,
                        processing_time_ms=onnx_result.get("latency_ms", 0),
                    )
                    results.append(synthetic)
            except Exception as e:
                log.warning("tier3.onnx_failed_using_llama", error=str(e))
                try:
                    tier3_result = await llama_classifier.classify(request.text, redis=None)
                    results.append(tier3_result)
                except Exception as e2:
                    log.warning("tier3.llama_also_failed", error=str(e2))
        else:
            try:
                tier3_result = await llama_classifier.classify(request.text, redis=None)
                results.append(tier3_result)
            except Exception as e:
                log.warning("tier3.llama_failed", error=str(e))

    # Final aggregation (with context).  Skip the second pass when Tier 3 added
    # nothing — the intermediate score is already final, saving ~1-3ms per
    # request in the common case where the score wasn't in the ambiguous band.
    if len(results) > _results_len_before_tier3:
        final_score = risk_aggregator.aggregate(results, request.role, input_context)
    else:
        final_score = intermediate_score
    duration_ms = (time.perf_counter() - start) * 1000

    log.info(
        "detection.completed",
        risk_score=final_score.score,
        action=final_score.recommended_action.value,
        span_count=len(final_score.detected_spans),
        eu_ai_act=final_score.eu_ai_act_risk_level,
        duration_ms=round(duration_ms, 2),
    )

    response_obj = DetectResponse(
        detection_id=prompt_hash,
        risk_score=final_score.score,
        action=final_score.recommended_action,
        detection_results=results,
        detected_spans=final_score.detected_spans,
        processing_time_ms=round(duration_ms, 2),
        eu_ai_act_risk_level=final_score.eu_ai_act_risk_level,
        regulatory_flags=final_score.regulatory_flags,
        remediation_priority=final_score.remediation_priority,
    )

    if redis_client:
        try:
            # ── SECURITY: only cache safe metadata — never matched_text or context ──
            safe_spans = [
                {
                    "start": s.start,
                    "end": s.end,
                    "category": s.category.value if hasattr(s.category, "value") else str(s.category),
                    "confidence": s.confidence,
                    "detector": s.detector,
                    # matched_text and context are intentionally omitted
                }
                for s in final_score.detected_spans
            ]
            safe_payload = json.dumps({
                "detection_id": prompt_hash,
                "risk_score": response_obj.risk_score,
                "action": response_obj.action.value,
                "eu_ai_act_risk_level": response_obj.eu_ai_act_risk_level,
                "regulatory_flags": response_obj.regulatory_flags,
                "remediation_priority": response_obj.remediation_priority,
                "detected_spans": safe_spans,
                "processing_time_ms": response_obj.processing_time_ms,
            })
            # TTL varies by action: safe prompts cache longer (policy rarely changes);
            # BLOCK/REDACT cache shorter so policy updates take effect quickly.
            _ACTION_TTL = {"ALLOW": 300, "LOG": 180, "WARN": 90, "REDACT": 45, "BLOCK": 30}
            ttl = _ACTION_TTL.get(response_obj.action.value, 60)
            await redis_client.setex(cache_key, ttl, safe_payload)

            # Continuous Feedback Loop — log verdict for weekly ONNX retraining
            # Active Learning: Only push high-uncertainty samples to avoid retraining on 99% correct predictions
            regex_hit = any(r.detector_name == "regex" and len(r.spans) > 0 for r in results)
            transformer_conf = 0.0
            for r in results:
                if r.detector_name in ("onnx_micro_model", "ml_classifier", "spacy_ner"):
                    if r.spans:
                        transformer_conf = max(transformer_conf, max(s.confidence for s in r.spans))
            
            p = transformer_conf
            # Calculate binary cross-entropy (uncertainty)
            model_entropy = - (p * math.log2(p + 1e-9) + (1 - p) * math.log2(1 - p + 1e-9)) if p > 0 else 0
            
            # Uncertainty sampling for human review
            if model_entropy > 0.5 or (regex_hit and transformer_conf < 0.3):
                loop_data = {
                    "hash": prompt_hash,
                    "final_verdict": response_obj.action.value,
                    "risk_score": response_obj.risk_score,
                    "timestamp": time.time(),
                    "human_label": None,
                    "entropy": model_entropy,
                    "needs_human_review": True
                }
                await redis_client.lpush("shield:training_loop", json.dumps(loop_data))
        except Exception as e:
            log.warning("detection.cache_write_failed", error=str(e))

    return response_obj


@app.get("/ml/status")
async def ml_status() -> dict[str, Any]:
    """Return ML model loading status and metadata."""
    return ml_classifier.status()


@app.post("/ml/predict-raw")
async def ml_predict_raw(request: DetectRequest) -> dict[str, Any]:
    """Return raw ML score breakdown per category — useful for debugging."""
    raw = ml_classifier.predict_raw(request.text)
    return {
        "text_preview": request.text[:100],
        "ensemble_scores": raw["scores"],
        "sklearn_scores": raw["sklearn"],
        "spacy_scores": raw["spacy"],
    }


# ─── Phase 4: RL Feedback Endpoints ────────────────────────

@app.post("/feedback", response_model=FeedbackResponse)
async def submit_feedback(feedback: FeedbackRequest) -> FeedbackResponse:
    """
    Submit user feedback on a detection result.
    
    Used for Phase 4 RL Threshold Tuning.
    Feedback is collected and processed daily to improve thresholds.
    
    Example:
    {
        "detection_id": "det_12345",
        "model_prediction": "PII",
        "model_confidence": 0.62,
        "model_threshold": 0.45,
        "user_correction": "SAFE",
        "user_confidence": 0.95,
        "notes": "Just a common name"
    }
    """
    try:
        # Add feedback to store
        result = feedback_store.add_feedback(
            detection_id=feedback.detection_id,
            text="",  # Will be populated from cache if available
            model_prediction=feedback.model_prediction,
            model_confidence=feedback.model_confidence,
            model_threshold=feedback.model_threshold,
            user_correction=feedback.user_correction,
            user_confidence=feedback.user_confidence,
            notes=feedback.notes
        )
        
        log.info(
            "feedback.submitted",
            detection_id=feedback.detection_id,
            prediction=feedback.model_prediction,
            correction=feedback.user_correction,
            confidence_diff=abs(feedback.model_confidence - feedback.user_confidence)
        )
        
        return FeedbackResponse(
            status="success",
            feedback_id=result["id"],
            message=f"Feedback recorded: {feedback.model_prediction} → {feedback.user_correction}. "
                   f"This helps improve our detection accuracy!"
        )
    except Exception as e:
        log.error("feedback.submission_failed", error=str(e), exc_info=e)
        return FeedbackResponse(
            status="error",
            feedback_id="",
            message=f"Error recording feedback: {str(e)}"
        )


@app.get("/feedback/stats")
async def get_feedback_stats() -> dict[str, Any]:
    """
    Get feedback collection statistics.
    
    Returns:
    - Total feedback collected
    - Unprocessed feedback (waiting for RL pipeline)
    - Processed feedback (already used for threshold tuning)
    - Correction rate
    - Breakdown by category
    """
    try:
        stats = feedback_store.get_feedback_stats()
        return {
            "status": "success",
            "total_feedback": stats["total_feedback"],
            "unprocessed": stats["unprocessed"],
            "processed": stats["processed"],
            "correction_rate": stats["correction_rate"],
            "by_category": stats["by_category"],
        }
    except Exception as e:
        log.error("feedback.stats_failed", error=str(e))
        return {
            "status": "error",
            "message": str(e)
        }


@app.get("/feedback/unprocessed")
async def get_unprocessed_feedback(limit: int = 100) -> dict[str, Any]:
    """
    Get unprocessed feedback (for RL pipeline).
    
    Only use this internally - for RL training pipeline.
    Returns feedback that hasn't been used for threshold updates yet.
    """
    try:
        feedback_list = feedback_store.get_unprocessed_feedback(limit)
        return {
            "status": "success",
            "count": len(feedback_list),
            "feedback": feedback_list
        }
    except Exception as e:
        log.error("feedback.unprocessed_failed", error=str(e))
        return {
            "status": "error",
            "count": 0,
            "message": str(e)
        }


@app.post("/ml/retrain")
async def retrain_thresholds(apply: bool = True) -> dict[str, Any]:
    """
    Run the RL threshold tuner on collected user feedback.
    Reads detection/data/feedback/user_feedback.jsonl and adjusts per-category
    confidence thresholds in ml_classifier based on FP/FN rates.

    Query params:
      apply=true  (default) → write tuned_thresholds.json + mark feedback processed
      apply=false            → dry run, return adjustments without writing
    """
    try:
        loop = asyncio.get_running_loop()
        tuner = RLThresholdTuner()

        def _run_tuner():
            return tuner.run(apply=apply, verbose=False)

        result = await loop.run_in_executor(ml_executor, _run_tuner)

        log.info(
            "rl_tuner.completed",
            feedback_count=result["feedback_count"],
            applied=result["applied"],
            categories_adjusted=sum(
                1 for a in result["adjustments"].values() if a.get("adjustment", 0) != 0
            ),
        )
        return {
            "status": "ok",
            "feedback_processed": result["feedback_count"],
            "applied": result["applied"],
            "adjustments": result["adjustments"],
            "new_thresholds": result["new_thresholds"],
        }
    except Exception as e:
        log.error("rl_tuner.failed", error=str(e))
        return {"status": "error", "message": str(e)}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error("detection.unhandled_exception", error=str(exc), exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal detection engine error", "detail": str(exc)},
    )
