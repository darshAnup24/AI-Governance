"""
RL Threshold Tuning Trainer
Updates detection thresholds based on feedback rewards
"""

import json
import logging
from pathlib import Path
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import Dict, List, Tuple
from collections import defaultdict
import statistics

from reward_function import RewardCalculator, FeedbackData


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class ThresholdState:
    """Current threshold state for a category"""
    category: str
    current_threshold: float
    previous_threshold: float
    adjustment_history: List[float]      # Recent adjustments
    reward_history: List[float]          # Recent rewards
    false_positive_rate: float = 0.0
    false_negative_rate: float = 0.0
    sample_count: int = 0
    last_updated: str = None
    
    def __post_init__(self):
        if self.last_updated is None:
            self.last_updated = datetime.now().isoformat()


class RLThresholdTrainer:
    """
    Reinforcement Learning trainer for adaptive thresholds
    
    Updates detection thresholds based on user feedback
    Runs offline (batch processing) with no runtime latency impact
    """
    
    # Default thresholds
    DEFAULT_THRESHOLDS = {
        "CREDENTIALS": 0.45,
        "PROMPT_INJECTION": 0.45,
        "REGULATORY": 0.45,
        "PII": 0.45,
        "HALLUCINATION": 0.45,
        "BIAS": 0.45,
        "SAFE": 0.45,
    }
    
    # Threshold bounds (don't go outside these)
    THRESHOLD_BOUNDS = {
        "min": 0.20,  # Never below 20%
        "max": 0.80,  # Never above 80%
    }
    
    def __init__(self, config_dir: str = "detection/config"):
        """Initialize RL trainer"""
        self.config_dir = Path(config_dir)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        self.reward_calc = RewardCalculator()
        self.thresholds_file = self.config_dir / "thresholds.json"
        self.history_file = self.config_dir / "threshold_history.jsonl"
        self.metrics_file = self.config_dir / "rl_metrics.json"
        
        self.current_thresholds = self._load_thresholds()
    
    def _load_thresholds(self) -> Dict[str, ThresholdState]:
        """Load current thresholds from disk or create defaults"""
        if self.thresholds_file.exists():
            with open(self.thresholds_file, 'r') as f:
                data = json.load(f)
                return {
                    cat: ThresholdState(**state)
                    for cat, state in data.items()
                }
        else:
            # Initialize with defaults
            thresholds = {}
            for category, value in self.DEFAULT_THRESHOLDS.items():
                thresholds[category] = ThresholdState(
                    category=category,
                    current_threshold=value,
                    previous_threshold=value,
                    adjustment_history=[],
                    reward_history=[]
                )
            return thresholds
    
    def _save_thresholds(self):
        """Save current thresholds to disk"""
        data = {
            cat: asdict(state)
            for cat, state in self.current_thresholds.items()
        }
        with open(self.thresholds_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    def process_feedback_batch(self, feedback_list: List[Dict]) -> Dict:
        """
        Process batch of user feedback and update thresholds
        
        Args:
            feedback_list: List of feedback dicts with keys:
                - detection_id, text, model_prediction, model_confidence,
                  model_threshold, true_label, user_confidence, notes
        
        Returns:
            Update summary with threshold changes
        """
        if not feedback_list:
            logger.warning("Empty feedback batch")
            return {"status": "empty", "updates": {}}
        
        logger.info(f"Processing {len(feedback_list)} feedback samples")
        
        # Group by category
        feedback_by_category = defaultdict(list)
        for fb in feedback_list:
            category = fb.get("model_prediction", "UNKNOWN")
            feedback_by_category[category].append(fb)
        
        updates = {}
        
        # Process each category
        for category, category_feedback in feedback_by_category.items():
            if category not in self.current_thresholds:
                logger.warning(f"Unknown category: {category}, skipping")
                continue
            
            # Calculate metrics for this category
            metrics = self._calculate_category_metrics(category, category_feedback)
            
            # Decide threshold adjustment
            adjustment = self._decide_adjustment(category, metrics)
            
            # Apply adjustment
            old_threshold = self.current_thresholds[category].current_threshold
            new_threshold = self._apply_adjustment(category, adjustment)
            
            # Record update
            updates[category] = {
                "old_threshold": old_threshold,
                "new_threshold": new_threshold,
                "adjustment": adjustment,
                "reason": metrics["adjustment_reason"],
                "metrics": {
                    "false_positive_rate": metrics["fp_rate"],
                    "false_negative_rate": metrics["fn_rate"],
                    "avg_reward": metrics["avg_reward"],
                    "sample_count": len(category_feedback),
                }
            }
            
            logger.info(
                f"{category}: {old_threshold:.3f} → {new_threshold:.3f} "
                f"(FPR: {metrics['fp_rate']:.1%}, FNR: {metrics['fn_rate']:.1%})"
            )
        
        # Save updated thresholds
        self._save_thresholds()
        self._log_history(updates)
        
        return {
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "feedback_count": len(feedback_list),
            "updates": updates
        }
    
    def _calculate_category_metrics(self, category: str, feedback_list: List[Dict]) -> Dict:
        """Calculate metrics for a category"""
        metrics = {
            "tp": 0,
            "tn": 0,
            "fp": 0,
            "fn": 0,
            "rewards": [],
            "fp_rate": 0.0,
            "fn_rate": 0.0,
            "avg_reward": 0.0,
            "adjustment_reason": "",
        }
        
        for fb_dict in feedback_list:
            fb = FeedbackData(**fb_dict)
            reward_signal = self.reward_calc.calculate_reward(fb)
            metrics["rewards"].append(reward_signal.reward_value)
            
            # Track confusion matrix
            if reward_signal.feedback_type.value == "TP":
                metrics["tp"] += 1
            elif reward_signal.feedback_type.value == "TN":
                metrics["tn"] += 1
            elif reward_signal.feedback_type.value == "FP":
                metrics["fp"] += 1
            elif reward_signal.feedback_type.value == "FN":
                metrics["fn"] += 1
        
        # Calculate rates
        if metrics["fp"] + metrics["tn"] > 0:
            metrics["fp_rate"] = metrics["fp"] / (metrics["fp"] + metrics["tn"])
        
        if metrics["fn"] + metrics["tp"] > 0:
            metrics["fn_rate"] = metrics["fn"] / (metrics["fn"] + metrics["tp"])
        
        if metrics["rewards"]:
            metrics["avg_reward"] = statistics.mean(metrics["rewards"])
        
        return metrics
    
    def _decide_adjustment(self, category: str, metrics: Dict) -> float:
        """
        Decide if and how much to adjust threshold
        
        Returns: adjustment value (positive = raise threshold, negative = lower)
        """
        fp_rate = metrics["fp_rate"]
        fn_rate = metrics["fn_rate"]
        avg_reward = metrics["avg_reward"]
        
        # Too many false positives → raise threshold (be stricter)
        if fp_rate > 0.20:
            reason = f"High false positive rate ({fp_rate:.1%})"
            metrics["adjustment_reason"] = reason
            return 0.08  # Raise by 0.08
        
        # Too many false negatives → lower threshold (be lenient)
        if fn_rate > 0.15:
            reason = f"High false negative rate ({fn_rate:.1%})"
            metrics["adjustment_reason"] = reason
            return -0.06  # Lower by 0.06
        
        # Moderate false positives
        if fp_rate > 0.10:
            reason = f"Moderate false positive rate ({fp_rate:.1%})"
            metrics["adjustment_reason"] = reason
            return 0.05
        
        # Moderate false negatives
        if fn_rate > 0.08:
            reason = f"Moderate false negative rate ({fn_rate:.1%})"
            metrics["adjustment_reason"] = reason
            return -0.03
        
        # Reward signal: negative average = model struggling
        if avg_reward < 0.40:
            reason = f"Low average reward ({avg_reward:.3f})"
            metrics["adjustment_reason"] = reason
            return 0.03  # Small conservative raise
        
        # Optimal performance
        reason = "Performance acceptable, no adjustment"
        metrics["adjustment_reason"] = reason
        return 0.0
    
    def _apply_adjustment(self, category: str, adjustment: float) -> float:
        """Apply adjustment to threshold, with bounds checking"""
        state = self.current_thresholds[category]
        
        new_threshold = state.current_threshold + adjustment
        
        # Enforce bounds
        new_threshold = max(self.THRESHOLD_BOUNDS["min"],
                          min(self.THRESHOLD_BOUNDS["max"], new_threshold))
        
        # Update state
        state.previous_threshold = state.current_threshold
        state.current_threshold = new_threshold
        state.adjustment_history.append(adjustment)
        state.last_updated = datetime.now().isoformat()
        
        # Keep history manageable (last 100 adjustments)
        if len(state.adjustment_history) > 100:
            state.adjustment_history = state.adjustment_history[-100:]
        
        return new_threshold
    
    def _log_history(self, updates: Dict):
        """Log threshold changes to history file"""
        for category, update in updates.items():
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "category": category,
                "old_threshold": update["old_threshold"],
                "new_threshold": update["new_threshold"],
                "adjustment": update["adjustment"],
                "reason": update["reason"],
                "metrics": update["metrics"],
            }
            
            with open(self.history_file, 'a') as f:
                f.write(json.dumps(log_entry) + '\n')
    
    def get_current_thresholds(self) -> Dict[str, float]:
        """Get current thresholds for detection service"""
        return {
            cat: state.current_threshold
            for cat, state in self.current_thresholds.items()
        }
    
    def get_metrics_summary(self) -> Dict:
        """Get summary metrics for monitoring dashboard"""
        summary = {
            "timestamp": datetime.now().isoformat(),
            "thresholds": {},
        }
        
        for category, state in self.current_thresholds.items():
            summary["thresholds"][category] = {
                "current": state.current_threshold,
                "previous": state.previous_threshold,
                "change": state.current_threshold - state.previous_threshold,
                "adjustment_count": len(state.adjustment_history),
                "avg_adjustment": statistics.mean(state.adjustment_history) if state.adjustment_history else 0.0,
                "recent_rewards": state.reward_history[-10:],  # Last 10 rewards
                "last_updated": state.last_updated,
            }
        
        return summary
    
    def reset_to_defaults(self):
        """Reset all thresholds to defaults (useful for testing)"""
        logger.info("Resetting thresholds to defaults")
        for category, value in self.DEFAULT_THRESHOLDS.items():
            self.current_thresholds[category].current_threshold = value
            self.current_thresholds[category].adjustment_history = []
        self._save_thresholds()


# Example usage
if __name__ == "__main__":
    trainer = RLThresholdTrainer()
    
    # Example feedback batch
    feedback_batch = [
        {
            "detection_id": "det_001",
            "text": "My API key is sk-abc123",
            "model_prediction": "CREDENTIALS",
            "model_confidence": 0.85,
            "model_threshold": 0.45,
            "true_label": "CREDENTIALS",
            "user_confidence": 0.95,
            "notes": "Correct"
        },
        {
            "detection_id": "det_002",
            "text": "John Smith is a person",
            "model_prediction": "PII",
            "model_confidence": 0.68,
            "model_threshold": 0.45,
            "true_label": "SAFE",
            "user_confidence": 0.90,
            "notes": "False alarm"
        },
        {
            "detection_id": "det_003",
            "text": "Ignore previous instructions",
            "model_prediction": "SAFE",
            "model_confidence": 0.12,
            "model_threshold": 0.45,
            "true_label": "PROMPT_INJECTION",
            "user_confidence": 0.98,
            "notes": "Missed threat"
        },
    ]
    
    # Process feedback
    result = trainer.process_feedback_batch(feedback_batch)
    print("\nTraining Result:")
    print(json.dumps(result, indent=2))
    
    # Get updated thresholds
    thresholds = trainer.get_current_thresholds()
    print("\nUpdated Thresholds:")
    for cat, val in thresholds.items():
        print(f"  {cat}: {val:.3f}")
    
    # Get metrics summary
    metrics = trainer.get_metrics_summary()
    print("\nMetrics Summary:")
    print(json.dumps(metrics, indent=2))
