"""
AI Governance Firewall — Detection Service (Airlock Extended)
Restructured, production-hardened low-latency detection pipeline:
  Tier A (fast path) <1ms
  Tier B (parallel concurrent) <5ms p95
  Tier C (conditional ONNX) <15ms
  Tier D (async fire-and-forget enrichment)

Key fixes over v1:
  - True asyncio.gather() with TaskGroup for structured concurrency
  - ProcessPoolExecutor for GIL-released ML parallelism
  - ThreadPoolExecutor for I/O-bound model loading
  - Detector circuit breakers (CLOSED/OPEN/HALF_OPEN)
  - Fire-and-forget task tracking with graceful shutdown
  - Cache write off critical path (fire-and-forget)
  - Tier-level timeouts with cancellation propagation
  - Pre-warmed model pools (lazy + eager mode)
  - No orphan tasks — all background work is tracked
  - Proper executor shutdown in lifespan
  - OpenTelemetry tracing for every tier
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import re as _re
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from redis.asyncio import Redis

from fastapi.responses import Response
from prometheus_client import CollectorRegistry, Counter, Histogram, Gauge, generate_latest
from prometheus_client import ProcessCollector

from proxy.app.logging_config import setup_logging
from proxy.app.models import ActionType, DetectedSpan, DetectionCategory, DetectionResult, FinalRiskScore

from detection.app.preprocessor import sanitize, fast_path_route, length_defense
from detection.app.regex_detector import RegexDetector
from detection.app.ner_detector import DebertaNERDetector
from detection.app.risk_scorer import RiskScoreAggregator, redact_prompt, REDUCED_SENSITIVITY_ROLES
from detection.app.detectors.hallucination_detector import HallucinationDetector
from detection.app.detectors.bias_detector import BiasDetector
from detection.app.detectors.security_code_detector import SecurityCodeDetector
from detection.app.detectors.regulatory_detector import RegulatoryDetector
from detection.app.detectors.prompt_injection_detector import PromptInjectionDetector
from detection.app.ml_classifier import MLClassifier
from detection.app.onnx_classifier import classify_sensitivity, ONNX_ENABLED
from detection.app.feedback_api import FeedbackStore
from detection.app.rl_threshold_tuner import RLThresholdTuner
from detection.app.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError
from detection.app.pipeline import DetectionPipeline

try:
    from proxy.app.tracing import get_tracer, span, add_span_event, record_exception
except ImportError:
    get_tracer = lambda: None
    span = lambda name, attributes=None, kind=None: _null_ctx()
    add_span_event = lambda name, attributes=None: None
    record_exception = lambda exc, attributes=None: None

    from contextlib import contextmanager

    @contextmanager
    def _null_ctx():
        yield None

log = structlog.get_logger()

# ─── Globals (loaded once at startup) ─────────────────────

regex_detector = RegexDetector()
ner_detector = DebertaNERDetector()
risk_aggregator = RiskScoreAggregator()
hallucination_detector = HallucinationDetector()
bias_detector = BiasDetector()
security_code_detector = SecurityCodeDetector()
regulatory_detector = RegulatoryDetector()
prompt_injection_detector = PromptInjectionDetector()
ml_classifier = MLClassifier()
feedback_store = FeedbackStore()
pipeline: DetectionPipeline | None = None

# ─── Prompt Whitelist ─────────────────────────────────────

WHITELIST_FILE = "detection/data/whitelist.jsonl"
_whitelist: set[str] = set()


def load_whitelist() -> None:
    global _whitelist
    try:
        if os.path.exists(WHITELIST_FILE):
            with open(WHITELIST_FILE) as f:
                _whitelist = {line.strip() for line in f if line.strip()}
            log.info("detection.whitelist_loaded", count=len(_whitelist))
    except Exception as e:
        log.warning("detection.whitelist_load_failed", error=str(e))


def _add_to_whitelist_sync(h: str) -> None:
    """Synchronous file write — runs in thread via asyncio.to_thread()."""
    try:
        os.makedirs(os.path.dirname(WHITELIST_FILE), exist_ok=True)
        with open(WHITELIST_FILE, "a") as f:
            f.write(h + "\n")
    except Exception as e:
        log.warning("detection.whitelist_write_failed", error=str(e))


def add_to_whitelist(text: str) -> None:
    """Add hash to in-memory whitelist; schedules async file write via task."""
    global _whitelist
    h = hashlib.sha256(text.encode()).hexdigest()
    _whitelist.add(h)
    # FIXED (BUG-014): avoid blocking event loop with sync file I/O
    # Schedule the file write as a fire-and-forget background task
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            task = loop.create_task(asyncio.to_thread(_add_to_whitelist_sync, h))
            _track_task(task)
        else:
            _add_to_whitelist_sync(h)  # fallback for non-async contexts
    except RuntimeError:
        _add_to_whitelist_sync(h)  # no event loop — write synchronously
    log.info("detection.whitelist_added", hash=h[:16])


def is_whitelisted(text: str) -> bool:
    h = hashlib.sha256(text.encode()).hexdigest()
    return h in _whitelist


MAX_PROMPT_CHARS = 4000

redis_client: Redis | None = None

# ─── Executor pools for GIL-released parallelism ─────────
# CRITICAL FIX (BUG-003/BUG-011): ProcessPoolExecutor cannot pickle bound methods
# (regex_detector.detect, ner_detector.detect, etc.).
# Switching to ThreadPoolExecutor — transformers, spacy, onnxruntime all release
# the GIL during their C-extension inference, so thread-level parallelism is
# equally effective without the serialization overhead or pickle failures.
_ml_process_pool: ProcessPoolExecutor | None = None  # Kept for non-method CPU tasks
_ml_thread_pool: ThreadPoolExecutor | None = None

# ─── Background task tracker ─────────────────────────────
_background_tasks: set[asyncio.Task] = set()


def _track_task(task: asyncio.Task) -> None:
    """Track a fire-and-forget task for graceful shutdown."""
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# ─── Detector circuit breakers ───────────────────────────
# Each detector gets its own circuit breaker to prevent
# cascading failures from a single hung detector.
_detector_circuit_breakers: dict[str, CircuitBreaker] = {
    name: CircuitBreaker(name=name, failure_threshold=5, recovery_timeout=30.0)
    for name in [
        "regex", "ner", "ml_classifier", "prompt_injection",
        "hallucination", "bias", "security_code", "regulatory",
    ]
}


# ─── Tier B via ThreadPool for GIL-released parallelism ─────────
# FIXED (BUG-003/BUG-011): Using asyncio.to_thread() instead of ProcessPoolExecutor.
# Reason: ProcessPoolExecutor uses pickle to pass functions between processes.
# Bound methods (detector.detect) are not picklable when the object contains
# re.Pattern attributes, locks, or C-extension state.
# ThreadPoolExecutor avoids pickle entirely — objects are shared in-process.
# Transformers/spacy/onnxruntime all release the GIL during C-extension calls,
# so thread-level concurrency provides the same throughput benefit.

async def _run_cpu_bound(
    fn,
    *args: Any,
    detector_name: str = "unknown",
    timeout: float = 5.0,
    pool: str = "thread",  # CHANGED: default to thread pool
) -> Any:
    """Run a CPU-bound detector function in a thread pool (no pickle required).

    Uses asyncio.to_thread() which runs in the default executor (ThreadPoolExecutor).
    All ML inference libraries (transformers, spacy, onnxruntime) release the GIL
    during their C-extension calls, making thread parallelism effective.
    """
    cb = _detector_circuit_breakers.get(detector_name)
    if cb and cb.state == CircuitBreaker.OPEN:
        add_span_event("circuit.open", {"detector": detector_name})
        raise CircuitBreakerOpenError(detector_name)

    try:
        # FIXED: asyncio.to_thread() — no pickle, same-process, GIL released by C-extensions
        result = await asyncio.wait_for(
            asyncio.to_thread(fn, *args),
            timeout=timeout,
        )
        if cb:
            cb.record_success()
        return result
    except asyncio.TimeoutError:
        add_span_event("detector.timeout", {"detector": detector_name, "timeout": timeout})
        raise
    except Exception as e:
        if cb:
            cb.record_failure()
        add_span_event("detector.error", {"detector": detector_name, "error": str(e)})
        raise


async def _run_tier_b_detector(
    fn,
    text: str,
    detector_name: str,
    timeout: float = 5.0,
) -> DetectionResult:
    """Run a single Tier B detector with circuit breaker, timeout, and graceful error handling.

    Returns a zero-risk DetectionResult on failure (fail-open, never blocks request).
    """
    start_t = time.perf_counter()
    try:
        result = await _run_cpu_bound(
            fn, text,
            detector_name=detector_name,
            timeout=timeout,
            pool="thread",  # FIXED: always use thread pool
        )
        return result
    except asyncio.TimeoutError:
        log.warning("detector.timeout", detector=detector_name, timeout=timeout)
    except CircuitBreakerOpenError:
        log.warning("detector.circuit_open", detector=detector_name)
        add_span_event("detector.skipped", {"detector": detector_name, "reason": "circuit_open"})
    except Exception as e:
        log.warning("detector.failed", detector=detector_name, error=str(e))
    return DetectionResult(
        detector_name=detector_name,
        spans=[],
        risk_score=0,
        processing_time_ms=(time.perf_counter() - start_t) * 1000,
    )


# ─── Tier D: Async fire-and-forget enrichment ─────────────

async def _run_tier_d_async(text: str, session_id: str, redis: Redis | None) -> None:
    """Fire-and-forget Tier D detectors. Results stored in Redis for audit enrichment.

    Runs the detectors sequentially within the background task to avoid
    overloading the process pool during request processing.
    """
    with span("tier_d.enrichment", attributes={"session_id": session_id[:16]}):
        tier_d_detectors = [
            ("hallucination", hallucination_detector.detect, 1.0),
            ("bias", bias_detector.detect, 1.0),
            ("regulatory", regulatory_detector.detect, 1.0),
            ("security_code", security_code_detector.detect, 1.0),
        ]

        enrichment: dict[str, Any] = {}
        for name, fn, timeout in tier_d_detectors:
            try:
                result = await _run_cpu_bound(
                    fn, text,
                    detector_name=name,
                    timeout=timeout,
                    pool="thread",  # Tier D uses thread pool — lower priority than Tier B
                )
                if result.spans:
                    enrichment[name] = {
                        "risk_score": result.risk_score,
                        "spans": [s.model_dump() for s in result.spans],
                    }
            except Exception:
                pass

        if enrichment and redis:
            try:
                await redis.setex(
                    f"tier_d:enrichment:{session_id}",
                    3600,
                    json.dumps(enrichment, default=str),
                )
                log.info("tier_d.enrichment_stored", session_id=session_id[:16], detectors=list(enrichment.keys()))
            except Exception:
                log.warning("tier_d.redis_write_failed")


# ─── Tier 0: Semantic Fast-Path ───────────────────────────

_CODE_BLOCK_RE = _re.compile(
    r"(?:```|~~~|\bimport\b|\bfrom\b\s+\w+\s+\bimport\b|"
    r"\bfunction\b|\bclass\b\s+\w+[\s:{(]|\bdef\b\s+\w+\s*\(|"
    r"\bconst\b|\blet\b|\bvar\b\s+\w+\s*=|"
    r"\b(?:public|private|protected)\b\s+(?:static\s+)?\w+|"
    r"\bSELECT\b.*\bFROM\b|\bINSERT\s+INTO\b|\bUPDATE\b.*\bSET\b|"
    r"\$\{|=>\s*\{|->\s*\{)",
    _re.IGNORECASE | _re.DOTALL,
)

_STRUCTURED_DATA_RE = _re.compile(
    r"(?:https?://|ftp://|ssh://|git@|mongodb\+srv://|postgresql://|"
    r"redis://|amqp://|-----BEGIN|\bAKIA[A-Z0-9]{16}\b|"
    r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+)",
)


def classify_input_context(text: str) -> str:
    has_code = bool(_CODE_BLOCK_RE.search(text))
    has_structured = bool(_STRUCTURED_DATA_RE.search(text))
    if has_code or has_structured:
        sentence_count = len(_re.findall(r"[.!?]\s", text))
        word_count = len(text.split())
        nl_ratio = sentence_count / max(word_count, 1)
        if nl_ratio > 0.05 and not has_code:
            return "mixed"
        return "code"
    return "natural_language"


# ─── Cache write helper (fire-and-forget) ─────────────────

async def _write_cache_async(
    redis: Redis | None,
    cache_key: str,
    response_obj: DetectResponse,
    results: list[DetectionResult],
    prompt_hash: str,
) -> None:
    """Write detection results to Redis cache in a background task.

    Moved off the critical path — the response is returned before
    this completes. Previously this was awaited inline, adding ~5-10ms
    to every request.
    """
    if not redis:
        return
    try:
        safe_spans = [
            {
                "start": s.start,
                "end": s.end,
                "category": s.category.value if hasattr(s.category, "value") else str(s.category),
                "confidence": s.confidence,
                "detector": s.detector,
            }
            for s in response_obj.detected_spans
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
        _ACTION_TTL = {"ALLOW": 300, "LOG": 180, "WARN": 90, "REDACT": 45, "BLOCK": 30}
        ttl = _ACTION_TTL.get(response_obj.action.value, 60)
        await redis.setex(cache_key, ttl, safe_payload)

        # Active learning — high-uncertainty samples for retraining
        regex_hit = any(r.detector_name == "regex" and len(r.spans) > 0 for r in results)
        transformer_conf = 0.0
        for r in results:
            if r.detector_name in ("onnx_micro_model", "ml_classifier", "spacy_ner"):
                if r.spans:
                    transformer_conf = max(transformer_conf, max(s.confidence for s in r.spans))

        p = transformer_conf
        model_entropy = -(p * math.log2(p + 1e-9) + (1 - p) * math.log2(1 - p + 1e-9)) if p > 0 else 0

        if model_entropy > 0.5 or (regex_hit and transformer_conf < 0.3):
            loop_data = {
                "hash": prompt_hash,
                "final_verdict": response_obj.action.value,
                "risk_score": response_obj.risk_score,
                "timestamp": time.time(),
                "human_label": None,
                "entropy": model_entropy,
                "needs_human_review": True,
            }
            await redis.lpush("airlock:training_loop", json.dumps(loop_data))
    except Exception as e:
        log.warning("detection.cache_write_failed", error=str(e))


# ─── Request / Response Models ───────────────────────────

class DetectRequest(BaseModel):
    text: str
    user_id: str = ""
    department: str = ""
    role: str = ""
    org_id: str = ""


class DetectResponse(BaseModel):
    detection_id: str = ""
    risk_score: int
    action: ActionType
    detection_results: list[DetectionResult]
    detected_spans: list[DetectedSpan]
    processing_time_ms: float
    eu_ai_act_risk_level: str = "MINIMAL"
    regulatory_flags: list[dict[str, Any]] = []
    remediation_priority: list[str] = []


class WhitelistRequest(BaseModel):
    text: str


class FeedbackRequest(BaseModel):
    detection_id: str
    model_prediction: str
    model_confidence: float
    model_threshold: float
    user_correction: str
    user_confidence: float = 0.95
    notes: str = ""


class FeedbackResponse(BaseModel):
    status: str
    feedback_id: str
    message: str


# ─── Lifespan ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global redis_client, _ml_process_pool, _ml_thread_pool, pipeline
    setup_logging("INFO")

    # Initialize executor pools
    # ProcessPoolExecutor for true CPU parallelism (releases GIL)
    cpu_count = os.cpu_count() or 4
    _ml_process_pool = ProcessPoolExecutor(max_workers=max(2, cpu_count - 1))
    # ThreadPoolExecutor for I/O-bound model loading and Tier D enrichment
    _ml_thread_pool = ThreadPoolExecutor(max_workers=max(4, cpu_count * 2))
    log.info("detection.executors_initialized", process_workers=max(2, cpu_count - 1), thread_workers=max(4, cpu_count * 2))

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379")
    try:
        redis_client = Redis.from_url(redis_url, decode_responses=True)
    except Exception as e:
        log.warning("detection.redis_init_failed", error=str(e))

    load_whitelist()
    pipeline = DetectionPipeline(
        regex_detector=regex_detector,
        ner_detector=ner_detector,
        structural_ml=ml_classifier,
        onnx_classifier=classify_sensitivity,
        risk_aggregator=risk_aggregator,
        whitelist_checker=is_whitelisted,
        redis_getter=lambda: redis_client,
        task_tracker=_track_task,
        tier_b_runner=_run_tier_b_detector,
        cpu_runner=_run_cpu_bound,
        tier_d_timeout_runner=_run_tier_d_async,
        onnx_enabled=ONNX_ENABLED,
        max_prompt_chars=MAX_PROMPT_CHARS,
    )

    log.info("detection.startup", tiers=["tier_a_fast_path", "tier_b_parallel", "tier_c_onnx", "tier_d_async"])
    yield

    # Graceful shutdown: wait for background tasks
    if _background_tasks:
        log.info("detection.shutdown.waiting_tasks", count=len(_background_tasks))
        done, pending = await asyncio.wait(_background_tasks, timeout=5.0)
        if pending:
            for t in pending:
                t.cancel()
                log.warning("detection.shutdown.cancelled_task")

    if redis_client:
        await redis_client.aclose()
    if _ml_process_pool:
        _ml_process_pool.shutdown(wait=False)
    if _ml_thread_pool:
        _ml_thread_pool.shutdown(wait=False)
    log.info("detection.shutdown")


# ─── App ──────────────────────────────────────────────────

det_prom_registry = CollectorRegistry()
ProcessCollector(registry=det_prom_registry)
DET_DETECTIONS = Counter(
    "airlock_detections_total",
    "Total detections by tier and category",
    ["tier", "category"],
    registry=det_prom_registry,
)
DET_LATENCY = Histogram(
    "airlock_detection_latency_ms",
    "Detection pipeline latency in milliseconds",
    ["tier"],
    registry=det_prom_registry,
)
DET_CIRCUIT_BREAKER = Gauge(
    "airlock_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=open, 2=half-open)",
    ["detector"],
    registry=det_prom_registry,
)

app = FastAPI(
    title="AI Governance Firewall — Detection Engine",
    description="4-tier detection pipeline (A/B/C/D) for PII, secrets, and sensitive content",
    version="0.2.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "detection", "version": "0.2.0"}


@app.get("/metrics")
async def det_metrics() -> Response:
    return Response(
        content=generate_latest(det_prom_registry),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@app.get("/circuit-breakers")
async def circuit_breaker_status() -> list[dict[str, Any]]:
    """Return circuit breaker states for all detectors."""
    return [cb.metrics() for cb in _detector_circuit_breakers.values()]


@app.post("/detect", response_model=DetectResponse)
async def detect(request: DetectRequest) -> DetectResponse:
    if pipeline is None:
        raise RuntimeError("Detection pipeline is not initialized")

    response = await pipeline.detect(
        text=request.text,
        role=request.role,
        trace_id="",
        user_id=request.user_id,
        org_id=request.org_id,
    )
    return DetectResponse(
        detection_id=response.detection_id,
        risk_score=response.risk_score,
        action=response.action,
        detection_results=response.detection_results,
        detected_spans=response.detected_spans,
        processing_time_ms=response.processing_time_ms,
        eu_ai_act_risk_level=response.eu_ai_act_risk_level,
        regulatory_flags=response.regulatory_flags,
        remediation_priority=response.remediation_priority,
    )


# ─── ML Status ────────────────────────────────────────────

@app.get("/ml/status")
async def ml_status() -> dict[str, Any]:
    return ml_classifier.status()


@app.post("/ml/predict-raw")
async def ml_predict_raw(request: DetectRequest) -> dict[str, Any]:
    raw = ml_classifier.predict_raw(request.text)
    return {
        "text_preview": request.text[:100],
        "ensemble_scores": raw["scores"],
        "sklearn_scores": raw["sklearn"],
        "spacy_scores": raw["spacy"],
    }


# ─── Feedback Endpoints ───────────────────────────────────

@app.post("/feedback")
async def submit_feedback(feedback: FeedbackRequest) -> FeedbackResponse:
    try:
        result = feedback_store.add_feedback(
            detection_id=feedback.detection_id,
            text="",
            model_prediction=feedback.model_prediction,
            model_confidence=feedback.model_confidence,
            model_threshold=feedback.model_threshold,
            user_correction=feedback.user_correction,
            user_confidence=feedback.user_confidence,
            notes=feedback.notes,
        )
        return FeedbackResponse(
            status="success",
            feedback_id=result["id"],
            message=f"Feedback recorded: {feedback.model_prediction} \u2192 {feedback.user_correction}. This helps improve our detection accuracy!",
        )
    except Exception as e:
        log.error("feedback.submission_failed", error=str(e))
        return FeedbackResponse(status="error", feedback_id="", message=str(e))


@app.get("/feedback/stats")
async def get_feedback_stats() -> dict[str, Any]:
    try:
        stats = feedback_store.get_feedback_stats()
        return {"status": "success", **stats}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/feedback/unprocessed")
async def get_unprocessed_feedback(limit: int = 100) -> dict[str, Any]:
    try:
        feedback_list = feedback_store.get_unprocessed_feedback(limit)
        return {"status": "success", "count": len(feedback_list), "feedback": feedback_list}
    except Exception as e:
        return {"status": "error", "count": 0, "message": str(e)}


@app.post("/whitelist/add")
async def add_prompt_to_whitelist(request: WhitelistRequest) -> dict[str, Any]:
    try:
        add_to_whitelist(request.text)
        return {"status": "ok", "message": "Prompt added to whitelist", "hash": hashlib.sha256(request.text.encode()).hexdigest()[:16]}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/ml/retrain")
async def retrain_thresholds(apply: bool = True) -> dict[str, Any]:
    try:
        tuner = RLThresholdTuner()

        def _run_tuner():
            return tuner.run(apply=apply, verbose=False)

        result = await _run_cpu_bound(_run_tuner, detector_name="rl_tuner", timeout=30.0, pool="thread")
        return {"status": "ok", "feedback_processed": result["feedback_count"], "applied": result["applied"], "adjustments": result["adjustments"], "new_thresholds": result["new_thresholds"]}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─── Global Exception Handler ─────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error("detection.unhandled_exception", error=str(exc), exc_info=exc)
    record_exception(exc, {"path": str(request.url)})
    return JSONResponse(
        status_code=500,
        content={"error": "Internal detection engine error", "detail": str(exc)},
    )
