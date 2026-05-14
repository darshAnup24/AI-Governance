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
import os
from redis.asyncio import Redis

from proxy.app.logging_config import setup_logging
from proxy.app.models import ActionType, DetectedSpan, DetectionResult, FinalRiskScore

from detection.app.regex_detector import RegexDetector
from detection.app.ner_detector import SpacyNERDetector
from detection.app.risk_scorer import RiskScoreAggregator, redact_prompt
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

log = structlog.get_logger()

# ─── Globals (loaded once at startup) ─────────────────────

regex_detector = RegexDetector()
ner_detector = SpacyNERDetector()
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

TIER3_THRESHOLD_LOW = 40
TIER3_THRESHOLD_HIGH = 70
MAX_PROMPT_CHARS = 4000

redis_client: Redis | None = None
# True parallel execution for C-extension ML models (which release the GIL)
ml_executor = ThreadPoolExecutor(max_workers=8)


# ─── Request / Response Models ───────────────────────────

class DetectRequest(BaseModel):
    text: str
    user_id: str = ""
    department: str = ""
    role: str = ""
    org_id: str = ""


class DetectResponse(BaseModel):
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

    # DOS Protection / Prompt Length Attack Prevention
    text_to_scan = request.text
    synthetic_middle_risk = None
    if len(text_to_scan) > MAX_PROMPT_CHARS:
        # Scan first + last 2000 chars to prevent parallel chunking server crashes
        head = text_to_scan[:2000]
        tail = text_to_scan[-2000:]
        text_to_scan = f"{head}\n\n...[TRUNCATED]...\n\n{tail}"
        synthetic_middle_risk = DetectionResult(
            detector_name="length_guard",
            spans=[],
            risk_score=50.0, # Flag unseen middle as MEDIUM automatically
            processing_time_ms=0.0
        )

    # B4: Check Redis Cache
    prompt_hash = hashlib.sha256(text_to_scan.encode("utf-8")).hexdigest()
    cache_key = f"detection:cache:{prompt_hash}:{request.role}"
    
    if redis_client:
        try:
            cached_res = await redis_client.get(cache_key)
            if cached_res:
                log.info("detection.cache_hit", hash=prompt_hash)
                cached_dict = json.loads(cached_res)
                cached_dict["processing_time_ms"] = round((time.perf_counter() - start) * 1000, 2)
                return DetectResponse(**cached_dict)
        except Exception as e:
            log.warning("detection.cache_read_failed", error=str(e))

    # ─── Run ALL detectors in parallel (Tier 1-2 + ML ensemble) ─────────────
    async def _run_detector_with_timeout(func, text, detector_name, timeout: float = 0.05):
        start_t = time.perf_counter()
        try:
            loop = asyncio.get_event_loop()
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

    futures = [
        _run_detector_with_timeout(regex_detector.detect, text_to_scan, "regex", 1.0),
        _run_detector_with_timeout(ner_detector.detect, text_to_scan, "ner", 5.0),
        _run_detector_with_timeout(hallucination_detector.detect, text_to_scan, "hallucination", 1.0),
        _run_detector_with_timeout(bias_detector.detect, text_to_scan, "bias", 1.0),
        _run_detector_with_timeout(security_code_detector.detect, text_to_scan, "security_code", 1.0),
        _run_detector_with_timeout(regulatory_detector.detect, text_to_scan, "regulatory", 1.0),
        _run_detector_with_timeout(prompt_injection_detector.detect, text_to_scan, "prompt_injection", 1.0),
        _run_detector_with_timeout(ml_classifier.detect, text_to_scan, "ml_classifier", 5.0),
    ]

    results = list(await asyncio.gather(*futures))
    
    if synthetic_middle_risk:
        results.append(synthetic_middle_risk)

    # Aggregate all detectors
    intermediate_score = risk_aggregator.aggregate(results, request.role)

    # ─── Tier 3: ONNX micro-model (Sprint 2) → Llama fallback ─────────────────
    if TIER3_THRESHOLD_LOW <= intermediate_score.score <= TIER3_THRESHOLD_HIGH:
        if ONNX_ENABLED:
            try:
                loop = asyncio.get_event_loop()
                onnx_result = await loop.run_in_executor(None, classify_sensitivity, request.text)
                onnx_label = onnx_result.get("classification", "UNKNOWN")
                onnx_conf = onnx_result.get("confidence", 0.0)
                log.info("tier3.onnx", label=onnx_label, conf=onnx_conf,
                         ms=onnx_result.get("latency_ms"))
                if onnx_label in ("SENSITIVE", "RESTRICTED") and onnx_conf > 0.55:
                    from proxy.app.models import DetectedSpan as DS, DetectionCategory as DC
                    synthetic = DetectionResult(
                        detector_name="onnx_micro_model",
                        spans=[DS(start=0, end=0, category=DC.CONFIDENTIAL,
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

    # Final aggregation
    final_score = risk_aggregator.aggregate(results, request.role)
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
            await redis_client.setex(
                cache_key,
                60, # Cache for 60 seconds
                response_obj.model_dump_json()
            )
            # Continuous Feedback Loop - Log verdict for weekly ONNX retraining
            loop_data = {
                "hash": prompt_hash,
                "final_verdict": response_obj.action.value,
                "risk_score": response_obj.risk_score,
                "timestamp": time.time(),
                "human_label": None
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error("detection.unhandled_exception", error=str(exc), exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal detection engine error", "detail": str(exc)},
    )
