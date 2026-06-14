"""
Active Learning Loop
====================
Flags uncertain predictions for human review, manages retraining queues,
tracks FPR/FNR/correction rate over time, and integrates with the RL
threshold tuner for continuous self-improvement.

Components:
  - UncertaintyFlagger: pushes 0.40 < score < 0.65 predictions to Redis
  - ReviewQueue: Redis-backed batch retrieval (batches of 10)
  - RetrainingManager: accumulates labeled corrections, triggers retrain at 200+
  - MetricsTracker: rolling FPR, FNR, correction rate
  - RLIntegration: adjusts thresholds when corrections cluster in a score range
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

import structlog

logger = structlog.get_logger()

# ─── Configuration ────────────────────────────────────────────────────────────

UNCERTAINTY_LOW = 0.40
UNCERTAINTY_HIGH = 0.65
REVIEW_BATCH_SIZE = 10
RETRAIN_QUEUE_THRESHOLD = 200
RETRAIN_QUEUE_KEY = "airlock:retrain_queue"
REVIEW_QUEUE_KEY = "airlock:review_queue"
METRICS_HISTORY_KEY = "airlock:metrics_history"
SCORE_CLUSTER_THRESHOLD = 5  # min corrections in a score bin to trigger RL adjust
SCORE_BIN_SIZE = 0.05        # width of each score bin


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class UncertainSample:
    sample_id: str
    text: str
    predicted_category: str
    predicted_score: float
    all_scores: dict[str, float] = field(default_factory=dict)
    timestamp: float = 0.0
    risk_score: int = 0
    action: str = ""
    flagged_for_review: bool = True
    reviewed: bool = False
    reviewer_label: str = ""
    review_timestamp: float = 0.0


@dataclass
class RetrainingSample:
    sample_id: str
    text: str
    true_label: str
    model_prediction: str
    model_score: float
    source: str = "human_review"
    timestamp: float = 0.0


@dataclass
class MetricsSnapshot:
    timestamp: float
    total_predictions: int
    uncertain_count: int
    reviewed_count: int
    correction_count: int
    false_positives: int
    false_negatives: int
    true_positives: int
    true_negatives: int
    fpr: float = 0.0
    fnr: float = 0.0
    correction_rate: float = 0.0
    retrain_queue_size: int = 0


# ─── Uncertainty Flagger ──────────────────────────────────────────────────────

class UncertaintyFlagger:
    def __init__(self, redis_client: Any = None):
        self._redis = redis_client

    def update_redis(self, redis_client: Any) -> None:
        self._redis = redis_client

    def is_uncertain(self, scores: dict[str, float]) -> bool:
        non_safe = {k: v for k, v in scores.items() if k != "SAFE"}
        if not non_safe:
            return False
        top_score = max(non_safe.values())
        return UNCERTAINTY_LOW < top_score < UNCERTAINTY_HIGH

    def flag(
        self,
        detection_id: str,
        text: str,
        scores: dict[str, float],
        risk_score: int = 0,
        action: str = "",
    ) -> Optional[UncertainSample]:
        non_safe = {k: v for k, v in scores.items() if k != "SAFE"}
        if not non_safe:
            return None

        top_cat = max(non_safe, key=non_safe.get)
        top_score = non_safe[top_cat]

        if not (UNCERTAINTY_LOW < top_score < UNCERTAINTY_HIGH):
            return None

        sample = UncertainSample(
            sample_id=detection_id,
            text=text[:500],
            predicted_category=top_cat,
            predicted_score=round(top_score, 4),
            all_scores={k: round(v, 4) for k, v in scores.items()},
            timestamp=time.time(),
            risk_score=risk_score,
            action=action,
        )

        if self._redis is not None:
            try:
                now = time.time()
                window_key = f"airlock:uncertainty:{int(now // 86400)}"
                current_count = self._redis.get(window_key)
                if current_count and int(current_count) >= 50:
                    return sample

                pipe = self._redis.pipeline()
                pipe.lpush(REVIEW_QUEUE_KEY, json.dumps(asdict(sample)))
                pipe.ltrim(REVIEW_QUEUE_KEY, 0, 499)
                pipe.incr(window_key)
                pipe.expire(window_key, 86400)
                pipe.execute()

                logger.info(
                    "active_learning.flagged",
                    sample_id=detection_id[:16],
                    category=top_cat,
                    score=top_score,
                )
            except Exception as e:
                logger.warning("active_learning.redis_push_failed", error=str(e))

        return sample


# ─── Review Queue ─────────────────────────────────────────────────────────────

class ReviewQueue:
    def __init__(self, redis_client: Any = None):
        self._redis = redis_client

    def update_redis(self, redis_client: Any) -> None:
        self._redis = redis_client

    def get_batch(self, batch_size: int = REVIEW_BATCH_SIZE) -> list[dict]:
        if self._redis is None:
            return []
        batch = []
        try:
            for _ in range(batch_size):
                raw = self._redis.rpop(REVIEW_QUEUE_KEY)
                if raw is None:
                    break
                sample = json.loads(raw)
                if not sample.get("reviewed"):
                    batch.append(sample)
        except Exception as e:
            logger.warning("active_learning.review_batch_failed", error=str(e))
        return batch

    def queue_size(self) -> int:
        if self._redis is None:
            return 0
        try:
            return self._redis.llen(REVIEW_QUEUE_KEY)
        except Exception:
            return 0

    def peek_batch(self, batch_size: int = REVIEW_BATCH_SIZE) -> list[dict]:
        if self._redis is None:
            return []
        try:
            items = self._redis.lrange(REVIEW_QUEUE_KEY, 0, batch_size - 1)
            return [json.loads(item) for item in items]
        except Exception:
            return []


# ─── Retraining Manager ───────────────────────────────────────────────────────

class RetrainingManager:
    def __init__(self, redis_client: Any = None):
        self._redis = redis_client
        self._retrain_callbacks: list = []

    def update_redis(self, redis_client: Any) -> None:
        self._redis = redis_client

    def on_retrain_ready(self, callback) -> None:
        self._retrain_callbacks.append(callback)

    def add_labeled_sample(self, sample: RetrainingSample) -> int:
        if self._redis is None:
            return 0
        try:
            self._redis.lpush(RETRAIN_QUEUE_KEY, json.dumps(asdict(sample)))
            queue_size = self._redis.llen(RETRAIN_QUEUE_KEY)
            logger.info(
                "active_learning.retrain_sample_added",
                sample_id=sample.sample_id[:16],
                true_label=sample.true_label,
                queue_size=queue_size,
            )
            if queue_size >= RETRAIN_QUEUE_THRESHOLD:
                self._trigger_retrain()
            return queue_size
        except Exception as e:
            logger.warning("active_learning.retrain_add_failed", error=str(e))
            return 0

    def get_queue_size(self) -> int:
        if self._redis is None:
            return 0
        try:
            return self._redis.llen(RETRAIN_QUEUE_KEY)
        except Exception:
            return 0

    def drain_queue(self, limit: int = RETRAIN_QUEUE_THRESHOLD) -> list[RetrainingSample]:
        if self._redis is None:
            return []
        samples = []
        try:
            for _ in range(limit):
                raw = self._redis.rpop(RETRAIN_QUEUE_KEY)
                if raw is None:
                    break
                data = json.loads(raw)
                samples.append(RetrainingSample(**data))
        except Exception as e:
            logger.warning("active_learning.retrain_drain_failed", error=str(e))
        return samples

    def _trigger_retrain(self) -> None:
        logger.info(
            "active_learning.retrain_triggered",
            queue_size=self.get_queue_size(),
            callbacks=len(self._retrain_callbacks),
        )
        for cb in self._retrain_callbacks:
            try:
                cb()
            except Exception as e:
                logger.error("active_learning.retrain_callback_failed", error=str(e))


# ─── Metrics Tracker ──────────────────────────────────────────────────────────

class MetricsTracker:
    MAX_HISTORY = 1440

    def __init__(self, redis_client: Any = None):
        self._redis = redis_client
        self._counts = {
            "total_predictions": 0,
            "uncertain_count": 0,
            "reviewed_count": 0,
            "correction_count": 0,
            "false_positives": 0,
            "false_negatives": 0,
            "true_positives": 0,
            "true_negatives": 0,
        }

    def update_redis(self, redis_client: Any) -> None:
        self._redis = redis_client

    def record_prediction(
        self,
        is_uncertain: bool,
        predicted_category: str,
        true_label: Optional[str] = None,
    ) -> None:
        self._counts["total_predictions"] += 1
        if is_uncertain:
            self._counts["uncertain_count"] += 1

        if true_label is not None:
            self._counts["reviewed_count"] += 1
            pred_positive = predicted_category not in ("SAFE", "")
            true_positive = true_label not in ("SAFE", "")

            if pred_positive and not true_positive:
                self._counts["false_positives"] += 1
                self._counts["correction_count"] += 1
            elif not pred_positive and true_positive:
                self._counts["false_negatives"] += 1
                self._counts["correction_count"] += 1
            elif pred_positive and true_positive:
                self._counts["true_positives"] += 1
            else:
                self._counts["true_negatives"] += 1

    def snapshot(self, retrain_queue_size: int = 0) -> MetricsSnapshot:
        c = self._counts
        fp = c["false_positives"]
        fn = c["false_negatives"]
        tp = c["true_positives"]
        tn = c["true_negatives"]
        reviewed = c["reviewed_count"]

        snap = MetricsSnapshot(
            timestamp=time.time(),
            total_predictions=c["total_predictions"],
            uncertain_count=c["uncertain_count"],
            reviewed_count=reviewed,
            correction_count=c["correction_count"],
            false_positives=fp,
            false_negatives=fn,
            true_positives=tp,
            true_negatives=tn,
            fpr=round(fp / max(fp + tn, 1), 4),
            fnr=round(fn / max(fn + tp, 1), 4),
            correction_rate=round(c["correction_count"] / max(reviewed, 1), 4),
            retrain_queue_size=retrain_queue_size,
        )

        if self._redis is not None:
            try:
                self._redis.lpush(METRICS_HISTORY_KEY, json.dumps(asdict(snap)))
                self._redis.ltrim(METRICS_HISTORY_KEY, 0, self.MAX_HISTORY - 1)
            except Exception as e:
                logger.warning("active_learning.metrics_persist_failed", error=str(e))

        return snap

    def get_history(self, limit: int = 60) -> list[dict]:
        if self._redis is None:
            return []
        try:
            items = self._redis.lrange(METRICS_HISTORY_KEY, 0, limit - 1)
            return [json.loads(item) for item in items]
        except Exception:
            return []

    def get_current_fpr(self) -> float:
        c = self._counts
        return c["false_positives"] / max(c["false_positives"] + c["true_negatives"], 1)

    def get_current_fnr(self) -> float:
        c = self._counts
        return c["false_negatives"] / max(c["false_negatives"] + c["true_positives"], 1)


# ─── RL Threshold Integration ─────────────────────────────────────────────────

class RLIntegration:
    """
    When human corrections cluster around a score range, adjusts thresholds
    in that range via the existing RLThresholdTuner.
    """

    CLUSTER_KEY = "airlock:rl_score_clusters"

    def __init__(self, redis_client: Any = None):
        self._redis = redis_client

    def update_redis(self, redis_client: Any) -> None:
        self._redis = redis_client

    def record_correction(
        self,
        category: str,
        model_score: float,
        was_false_positive: bool,
    ) -> None:
        if self._redis is None:
            return

        bin_idx = int(model_score // SCORE_BIN_SIZE)
        bin_key = f"{category}:{bin_idx}"

        try:
            self._redis.hincrby(self.CLUSTER_KEY, bin_key, 1)
            self._redis.expire(self.CLUSTER_KEY, 86400 * 7)

            count = int(self._redis.hget(self.CLUSTER_KEY, bin_key) or 0)
            if count >= SCORE_CLUSTER_THRESHOLD and was_false_positive:
                self._apply_cluster_adjustment(category, bin_idx)
        except Exception as e:
            logger.warning("active_learning.rl_cluster_failed", error=str(e))

    def _apply_cluster_adjustment(self, category: str, bin_idx: int) -> None:
        try:
            from detection.app.rl_threshold_tuner import RLThresholdTuner
            tuner = RLThresholdTuner()
            current = tuner.load_current_thresholds()
            cat_current = current.get(category, 0.55)
            bin_center = (bin_idx + 0.5) * SCORE_BIN_SIZE

            if cat_current < bin_center:
                new_val = round(min(0.95, cat_current + 0.02), 4)
                current[category] = new_val
                tuner.apply_thresholds({
                    category: {
                        "current": cat_current,
                        "new": new_val,
                        "adjustment": round(new_val - cat_current, 4),
                        "reason": f"cluster_adjustment (bin={bin_center:.2f}, n={bin_idx})",
                    }
                })
                logger.info(
                    "active_learning.rl_threshold_adjusted",
                    category=category,
                    old=cat_current,
                    new=new_val,
                    bin_center=bin_center,
                )
            self._redis.hset(self.CLUSTER_KEY, f"{category}:{bin_idx}", 0)
        except Exception as e:
            logger.warning("active_learning.rl_apply_failed", error=str(e))


# ─── Unified Active Learning Manager ──────────────────────────────────────────

class ActiveLearningManager:
    """
    Single entry point that wires all components together.
    Used by main.py to integrate with the detection pipeline.
    """

    def __init__(self, redis_client: Any = None):
        self.redis = redis_client
        self.flagger = UncertaintyFlagger(redis_client)
        self.review_queue = ReviewQueue(redis_client)
        self.retrain_manager = RetrainingManager(redis_client)
        self.metrics = MetricsTracker(redis_client)
        self.rl_integration = RLIntegration(redis_client)

    def update_redis(self, redis_client: Any) -> None:
        self.redis = redis_client
        self.flagger.update_redis(redis_client)
        self.review_queue.update_redis(redis_client)
        self.retrain_manager.update_redis(redis_client)
        self.metrics.update_redis(redis_client)
        self.rl_integration.update_redis(redis_client)

    def on_detect(
        self,
        detection_id: str,
        text: str,
        scores: dict[str, float],
        risk_score: int = 0,
        action: str = "",
    ) -> Optional[UncertainSample]:
        is_uncertain = self.flagger.is_uncertain(scores)
        sample = self.flagger.flag(detection_id, text, scores, risk_score, action)
        self.metrics.record_prediction(is_uncertain=is_uncertain, predicted_category="")
        return sample

    def on_feedback_corrected(
        self,
        sample_id: str,
        text: str,
        model_prediction: str,
        model_score: float,
        true_label: str,
    ) -> int:
        was_fp = model_prediction not in ("SAFE", "") and true_label == "SAFE"
        was_fn = model_prediction == "SAFE" and true_label not in ("SAFE", "")

        self.metrics.record_prediction(
            is_uncertain=False,
            predicted_category=model_prediction,
            true_label=true_label,
        )

        self.rl_integration.record_correction(
            category=model_prediction,
            model_score=model_score,
            was_false_positive=was_fp,
        )

        sample = RetrainingSample(
            sample_id=sample_id,
            text=text[:500],
            true_label=true_label,
            model_prediction=model_prediction,
            model_score=model_score,
            source="human_review",
            timestamp=time.time(),
        )

        return self.retrain_manager.add_labeled_sample(sample)

    def get_metrics_snapshot(self) -> MetricsSnapshot:
        return self.metrics.snapshot(self.retrain_manager.get_queue_size())
