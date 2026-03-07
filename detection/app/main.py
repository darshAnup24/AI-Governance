"""
AI Governance Firewall — Detection Service (ShieldAI Extended)
Full multi-tier detection pipeline: Regex → NER → Hallucination → Bias →
Security → Regulatory → Prompt Injection → Llama classifier.
"""

from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import structlog
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

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

TIER3_THRESHOLD_LOW = 40
TIER3_THRESHOLD_HIGH = 70


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


# ─── Lifespan ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging("INFO")
    log.info("detection.startup", tiers=["regex", "ner", "llama"])
    yield
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

    # ─── Run ALL detectors in parallel ─────────────────────
    loop = asyncio.get_event_loop()
    futures = [
        loop.run_in_executor(None, regex_detector.detect, request.text),
        loop.run_in_executor(None, ner_detector.detect, request.text),
        loop.run_in_executor(None, hallucination_detector.detect, request.text),
        loop.run_in_executor(None, bias_detector.detect, request.text),
        loop.run_in_executor(None, security_code_detector.detect, request.text),
        loop.run_in_executor(None, regulatory_detector.detect, request.text),
        loop.run_in_executor(None, prompt_injection_detector.detect, request.text),
    ]

    results = list(await asyncio.gather(*futures))

    # Aggregate all detectors
    intermediate_score = risk_aggregator.aggregate(results, request.role)

    # ─── Tier 3: Llama (only for ambiguous scores) ────────
    if TIER3_THRESHOLD_LOW <= intermediate_score.score <= TIER3_THRESHOLD_HIGH:
        try:
            tier3_result = await llama_classifier.classify(request.text, redis=None)
            results.append(tier3_result)
        except Exception as e:
            log.warning("tier3.failed", error=str(e))

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

    return DetectResponse(
        risk_score=final_score.score,
        action=final_score.recommended_action,
        detection_results=results,
        detected_spans=final_score.detected_spans,
        processing_time_ms=round(duration_ms, 2),
        eu_ai_act_risk_level=final_score.eu_ai_act_risk_level,
        regulatory_flags=final_score.regulatory_flags,
        remediation_priority=final_score.remediation_priority,
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error("detection.unhandled_exception", error=str(exc), exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal detection engine error", "detail": str(exc)},
    )
