from __future__ import annotations

import asyncio
import hashlib
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from detection.app.preprocessor import fast_path_route, length_defense, sanitize
from proxy.app.models import ActionType, DetectionCategory, DetectionResult, DetectedSpan

try:
    from detection.config import CALIBRATION
except ImportError:
    from dataclasses import dataclass as _dc

    @_dc(frozen=True)
    class _RecallFallback:
        enabled: bool = True
        low_threshold: float = 0.45
        soft_vote_min_detectors: int = 2
        soft_vote_threshold: float = 0.40

    @_dc(frozen=True)
    class _CalFallback:
        recall: _RecallFallback = _RecallFallback()

    CALIBRATION = _CalFallback()


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

        route, route_meta = fast_path_route(normalized, cache=None)
        if route == "SAFE" and route_meta.get("route") in {"empty", "cache_hit"}:
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

        # ── Recall Gate: OR-gate + Soft Vote escalation ───────────────────────
        # If RECALL_MODE is enabled and any tier scores above low_threshold
        # (or 2+ detectors agree above soft_vote_threshold), ensure ONNX runs
        # to validate — even if it was disabled or wouldn't normally fire.
        recall_escalated = False
        if CALIBRATION.recall.enabled and self.onnx_enabled:
            if self._recall_gate_positive(detection_results):
                recall_escalated = True
                # If ONNX wasn't in the results yet (e.g. onnx_enabled was
                # toggled mid-flight), run it now
                has_onnx = any(r.detector_name == "onnx_micro_model" for r in detection_results)
                if not has_onnx:
                    onnx_result = await self.cpu_runner(
                        self.onnx_classifier,
                        defended_text,
                        detector_name="onnx_micro_model",
                        timeout=10.0,
                        pool="thread",
                    )
                    detection_results.append(self._onnx_to_result(onnx_result))

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

    # ─── Recall Gate (OR-gate + Soft Vote) ────────────────────────────────────

    @staticmethod
    def _tier_max_score(result: DetectionResult) -> float:
        """Return the maximum confidence across all spans in a detection result."""
        if not result.spans:
            return 0.0
        return max(s.confidence for s in result.spans)

    def _or_gate_escalation(
        self, tier_results: list[DetectionResult]
    ) -> bool:
        """OR-gate: return True if ANY tier result scores above low_threshold.

        This catches edge cases where one detector finds something suspicious
        even though its own threshold wouldn't trigger a positive — the next
        tier (ONNX) gets a chance to validate.
        """
        threshold = CALIBRATION.recall.low_threshold
        for result in tier_results:
            if self._tier_max_score(result) >= threshold:
                return True
        return False

    def _soft_vote_positive(
        self, tier_results: list[DetectionResult]
    ) -> bool:
        """Soft vote: return True if 2+ detectors agree with score > threshold.

        Even if no single detector crosses its own threshold, unanimous
        mild suspicion from multiple detectors is a strong signal.
        """
        min_detectors = CALIBRATION.recall.soft_vote_min_detectors
        vote_threshold = CALIBRATION.recall.soft_vote_threshold
        agreeing = sum(
            1 for r in tier_results
            if self._tier_max_score(r) >= vote_threshold
        )
        return agreeing >= min_detectors

    def _recall_gate_positive(
        self, tier_results: list[DetectionResult]
    ) -> bool:
        """Combined recall gate: OR-gate OR soft-vote triggers escalation."""
        if not CALIBRATION.recall.enabled:
            return False
        return self._or_gate_escalation(tier_results) or self._soft_vote_positive(tier_results)
