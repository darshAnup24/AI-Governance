from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from detection.app.preprocessor import fast_path_route, length_defense, sanitize
from proxy.app.models import ActionType, DetectionCategory, DetectionResult, DetectedSpan


@dataclass
class PipelineResponse:
    detection_id: str
    risk_score: int
    action: ActionType
    detection_results: list[DetectionResult]
    detected_spans: list[DetectedSpan]
    processing_time_ms: float
    eu_ai_act_risk_level: str
    regulatory_flags: list[dict[str, Any]]
    remediation_priority: list[str]


class DetectionPipeline:
    def __init__(
        self,
        *,
        regex_detector: Any,
        ner_detector: Any,
        structural_ml: Any,
        onnx_classifier: Callable[[str], dict[str, Any]],
        risk_aggregator: Any,
        whitelist_checker: Callable[[str], bool],
        redis_getter: Callable[[], Any],
        task_tracker: Callable[[asyncio.Task[Any]], None],
        tier_b_runner: Callable[..., Awaitable[DetectionResult]],
        cpu_runner: Callable[..., Awaitable[Any]],
        tier_d_timeout_runner: Callable[[str, str, Any], Awaitable[None]],
        onnx_enabled: bool,
        max_prompt_chars: int,
    ) -> None:
        self.regex_detector = regex_detector
        self.ner_detector = ner_detector
        self.structural_ml = structural_ml
        self.onnx_classifier = onnx_classifier
        self.risk_aggregator = risk_aggregator
        self.whitelist_checker = whitelist_checker
        self.redis_getter = redis_getter
        self.task_tracker = task_tracker
        self.tier_b_runner = tier_b_runner
        self.cpu_runner = cpu_runner
        self.tier_d_timeout_runner = tier_d_timeout_runner
        self.onnx_enabled = onnx_enabled
        self.max_prompt_chars = max_prompt_chars

    async def detect(
        self,
        *,
        text: str,
        role: str = "",
        trace_id: str = "",
        user_id: str = "",
        org_id: str = "",
    ) -> PipelineResponse:
        start = time.perf_counter()
        normalized, _ = sanitize(text or "")
        detection_id = hashlib.sha256(normalized.encode()).hexdigest()

        if not normalized:
            return self._safe_response(detection_id, [], start)

        if self.whitelist_checker(normalized):
            return self._safe_response(detection_id, [], start)

        route, _ = fast_path_route(normalized, cache=None)
        if route == "SAFE":
            return self._safe_response(detection_id, [], start)

        defended_text, _ = length_defense(normalized, max_len=self.max_prompt_chars)

        tasks = [
            self.tier_b_runner(
                self.regex_detector.detect,
                defended_text,
                detector_name="regex",
                timeout=1.0,
            ),
            self.tier_b_runner(
                self.ner_detector.detect,
                defended_text,
                detector_name="ner",
                timeout=4.0,
            ),
            self.tier_b_runner(
                self.structural_ml.detect,
                defended_text,
                detector_name="ml_classifier",
                timeout=5.0,
            ),
        ]

        # Prompt injection detector exists in the main module's tier-B runner list.
        if hasattr(self, "prompt_injection_detector"):
            tasks.append(
                self.tier_b_runner(
                    self.prompt_injection_detector.detect,
                    defended_text,
                    detector_name="prompt_injection",
                    timeout=2.0,
                )
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)
        detection_results: list[DetectionResult] = []
        for result in results:
            if isinstance(result, DetectionResult):
                detection_results.append(result)

        if self.onnx_enabled:
            onnx_result = await self.cpu_runner(
                self.onnx_classifier,
                defended_text,
                detector_name="onnx_micro_model",
                timeout=10.0,
                pool="thread",
            )
            detection_results.append(self._onnx_to_result(onnx_result))

        final_score = self.risk_aggregator.aggregate(
            detection_results,
            user_role=role,
            input_context="code",
        )

        redis_client = self.redis_getter()
        if redis_client is not None:
            task = asyncio.create_task(
                self.tier_d_timeout_runner(defended_text, detection_id, redis_client)
            )
            self.task_tracker(task)

        return PipelineResponse(
            detection_id=detection_id,
            risk_score=final_score.score,
            action=final_score.recommended_action,
            detection_results=detection_results,
            detected_spans=final_score.detected_spans,
            processing_time_ms=round((time.perf_counter() - start) * 1000, 2),
            eu_ai_act_risk_level=final_score.eu_ai_act_risk_level,
            regulatory_flags=final_score.regulatory_flags,
            remediation_priority=final_score.remediation_priority,
        )

    def _safe_response(
        self,
        detection_id: str,
        detection_results: list[DetectionResult],
        start: float,
    ) -> PipelineResponse:
        return PipelineResponse(
            detection_id=detection_id,
            risk_score=0,
            action=ActionType.ALLOW,
            detection_results=detection_results,
            detected_spans=[],
            processing_time_ms=round((time.perf_counter() - start) * 1000, 2),
            eu_ai_act_risk_level="MINIMAL",
            regulatory_flags=[],
            remediation_priority=[],
        )

    def _onnx_to_result(self, onnx_result: dict[str, Any]) -> DetectionResult:
        confidence = float(onnx_result.get("confidence", 0.0) or 0.0)
        classification = str(onnx_result.get("classification", "SAFE"))
        if classification not in {"SENSITIVE", "RESTRICTED"} or confidence <= 0:
            return DetectionResult(detector_name="onnx_micro_model", spans=[], risk_score=0.0)

        category = (
            DetectionCategory.CONFIDENTIAL
            if classification == "SENSITIVE"
            else DetectionCategory.REGULATORY
        )
        span = DetectedSpan(
            start=0,
            end=0,
            category=category,
            confidence=min(confidence, 1.0),
            matched_text="",
            detector="onnx_micro_model",
            context=str(onnx_result.get("reason", "")),
        )
        return DetectionResult(
            detector_name="onnx_micro_model",
            spans=[span],
            risk_score=confidence * 100,
            processing_time_ms=float(onnx_result.get("latency_ms", 0.0) or 0.0),
        )
