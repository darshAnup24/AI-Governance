"""
Phase 4 RL Monitoring Dashboard Backend
Real-time metrics and visualizations for RL threshold tuning
"""

import json
import sys
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List
import statistics

# Add necessary directories to path for imports
rl_dir = Path(__file__).parent
detection_dir = rl_dir.parent.parent
sys.path.insert(0, str(rl_dir))
sys.path.insert(0, str(detection_dir / 'app'))

from rl_trainer import RLThresholdTrainer
from feedback_api import FeedbackStore


class RLMetricsCollector:
    """Collects and aggregates RL metrics for dashboard"""
    
    def __init__(self,
                 feedback_dir: str = "detection/data/feedback",
                 config_dir: str = "detection/config"):
        """Initialize metrics collector"""
        self.feedback_store = FeedbackStore(feedback_dir)
        self.rl_trainer = RLThresholdTrainer(config_dir)
        self.history_file = Path(config_dir) / "threshold_history.jsonl"
    
    def get_dashboard_data(self) -> Dict:
        """
        Get complete dashboard data
        
        Returns metrics organized for UI display
        """
        return {
            "current_thresholds": self._get_current_thresholds_with_stats(),
            "threshold_history": self._get_threshold_history(),
            "feedback_metrics": self._get_feedback_metrics(),
            "performance_trends": self._get_performance_trends(),
            "adjustment_summary": self._get_adjustment_summary(),
        }
    
    def _get_current_thresholds_with_stats(self) -> Dict:
        """Get current thresholds with recent statistics"""
        metrics = self.rl_trainer.get_metrics_summary()
        
        thresholds_data = {}
        for category, data in metrics["thresholds"].items():
            thresholds_data[category] = {
                "current_threshold": data["current"],
                "previous_threshold": data["previous"],
                "change": data["change"],
                "change_percent": (data["change"] / data["previous"]) * 100 if data["previous"] > 0 else 0,
                "direction": "stricter" if data["change"] > 0 else "lenient" if data["change"] < 0 else "stable",
                "adjustment_count": data["adjustment_count"],
                "last_updated": data["last_updated"],
                "trend": "↑" if data["change"] > 0 else "↓" if data["change"] < 0 else "→",
            }
        
        return thresholds_data
    
    def _get_threshold_history(self) -> Dict:
        """Get threshold history for chart display"""
        history = {}
        
        if not self.history_file.exists():
            return history
        
        # Read history and organize by category
        with open(self.history_file, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line)
                    category = entry.get("category")
                    
                    if category not in history:
                        history[category] = {
                            "timestamps": [],
                            "thresholds": [],
                            "adjustments": [],
                            "metrics": []
                        }
                    
                    history[category]["timestamps"].append(entry.get("timestamp"))
                    history[category]["thresholds"].append(entry.get("new_threshold"))
                    history[category]["adjustments"].append(entry.get("adjustment"))
                    history[category]["metrics"].append(entry.get("metrics", {}))
                except:
                    pass
        
        return history
    
    def _get_feedback_metrics(self) -> Dict:
        """Get feedback collection metrics"""
        stats = self.feedback_store.get_feedback_stats()
        
        return {
            "total_collected": stats["total_feedback"],
            "unprocessed": stats["unprocessed"],
            "processed": stats["processed"],
            "correction_rate": stats["correction_rate"],
            "by_category": stats["by_category"],
        }
    
    def _get_performance_trends(self) -> Dict:
        """Calculate performance trends from history"""
        trends = {}
        
        if not self.history_file.exists():
            return trends
        
        # Group by category and calculate trends
        category_metrics = {}
        
        with open(self.history_file, 'r') as f:
            for line in f:
                try:
                    entry = json.loads(line)
                    category = entry.get("category")
                    metrics = entry.get("metrics", {})
                    
                    if category not in category_metrics:
                        category_metrics[category] = {
                            "fpr": [],
                            "fnr": [],
                            "rewards": [],
                        }
                    
                    category_metrics[category]["fpr"].append(metrics.get("false_positive_rate", 0))
                    category_metrics[category]["fnr"].append(metrics.get("false_negative_rate", 0))
                    category_metrics[category]["rewards"].append(metrics.get("avg_reward", 0))
                except:
                    pass
        
        # Calculate statistics
        for category, values in category_metrics.items():
            if values["fpr"]:
                trends[category] = {
                    "false_positive_trend": {
                        "latest": values["fpr"][-1],
                        "average": statistics.mean(values["fpr"]),
                        "min": min(values["fpr"]),
                        "max": max(values["fpr"]),
                        "direction": "improving" if values["fpr"][-1] < statistics.mean(values["fpr"]) else "worsening"
                    },
                    "false_negative_trend": {
                        "latest": values["fnr"][-1],
                        "average": statistics.mean(values["fnr"]),
                        "min": min(values["fnr"]),
                        "max": max(values["fnr"]),
                        "direction": "improving" if values["fnr"][-1] < statistics.mean(values["fnr"]) else "worsening"
                    },
                    "reward_trend": {
                        "latest": values["rewards"][-1] if values["rewards"] else 0,
                        "average": statistics.mean(values["rewards"]) if values["rewards"] else 0,
                    }
                }
        
        return trends
    
    def _get_adjustment_summary(self) -> Dict:
        """Summarize recent threshold adjustments"""
        state = self.rl_trainer.current_thresholds
        
        summary = {
            "total_adjustments": 0,
            "categories_adjusted": 0,
            "increase_count": 0,
            "decrease_count": 0,
            "stable_count": 0,
            "recent_changes": []
        }
        
        for category, threshold_state in state.items():
            if threshold_state.adjustment_history:
                summary["total_adjustments"] += len(threshold_state.adjustment_history)
                summary["categories_adjusted"] += 1
                
                last_adj = threshold_state.adjustment_history[-1]
                if last_adj > 0:
                    summary["increase_count"] += 1
                elif last_adj < 0:
                    summary["decrease_count"] += 1
                else:
                    summary["stable_count"] += 1
                
                summary["recent_changes"].append({
                    "category": category,
                    "adjustment": last_adj,
                    "from": threshold_state.previous_threshold,
                    "to": threshold_state.current_threshold,
                    "timestamp": threshold_state.last_updated,
                })
        
        return summary


# Example FastAPI endpoints for dashboard
"""
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()
metrics = RLMetricsCollector()


@app.get("/api/rl/dashboard")
async def get_dashboard_data():
    '''Get complete dashboard data'''
    return JSONResponse(metrics.get_dashboard_data())


@app.get("/api/rl/thresholds/current")
async def get_current_thresholds():
    '''Get current thresholds with stats'''
    return JSONResponse(metrics._get_current_thresholds_with_stats())


@app.get("/api/rl/history/{category}")
async def get_category_history(category: str):
    '''Get threshold history for a specific category'''
    history = metrics._get_threshold_history()
    if category in history:
        return JSONResponse(history[category])
    return JSONResponse({"error": f"No history for category {category}"}, status_code=404)


@app.get("/api/rl/trends")
async def get_performance_trends():
    '''Get performance trends across categories'''
    return JSONResponse(metrics._get_performance_trends())


@app.get("/api/rl/feedback/metrics")
async def get_feedback_metrics():
    '''Get feedback collection metrics'''
    return JSONResponse(metrics._get_feedback_metrics())
"""


# CLI commands for checking metrics
def print_dashboard_summary():
    """Print dashboard summary to console"""
    collector = RLMetricsCollector()
    data = collector.get_dashboard_data()
    
    print("\n" + "=" * 80)
    print("RL THRESHOLD TUNING DASHBOARD")
    print("=" * 80)
    
    # Current thresholds
    print("\n📊 CURRENT THRESHOLDS:")
    print("-" * 80)
    for cat, metrics in data["current_thresholds"].items():
        print(f"  {cat:20} {metrics['current_threshold']:.3f} "
              f"{metrics['trend']} (change: {metrics['change']:+.3f})")
    
    # Feedback metrics
    print("\n📝 FEEDBACK METRICS:")
    print("-" * 80)
    fb = data["feedback_metrics"]
    print(f"  Total collected: {fb['total_collected']}")
    print(f"  Unprocessed: {fb['unprocessed']}")
    print(f"  Processed: {fb['processed']}")
    print(f"  Correction rate: {fb['correction_rate']:.1%}")
    
    # Adjustment summary
    print("\n⚙️  ADJUSTMENTS:")
    print("-" * 80)
    adj = data["adjustment_summary"]
    print(f"  Total adjustments: {adj['total_adjustments']}")
    print(f"  Categories adjusted: {adj['categories_adjusted']}")
    print(f"  Increases (stricter): {adj['increase_count']}")
    print(f"  Decreases (lenient): {adj['decrease_count']}")
    
    # Recent changes
    if adj["recent_changes"]:
        print("\n  Recent changes:")
        for change in adj["recent_changes"][-5:]:
            print(f"    {change['category']:20} {change['from']:.3f} → {change['to']:.3f}")
    
    # Performance trends
    print("\n📈 PERFORMANCE TRENDS:")
    print("-" * 80)
    for cat, trends in data["performance_trends"].items():
        fpr = trends["false_positive_trend"]
        fnr = trends["false_negative_trend"]
        print(f"  {cat}:")
        print(f"    FPR: {fpr['latest']:.1%} (avg: {fpr['average']:.1%}) - {fpr['direction']}")
        print(f"    FNR: {fnr['latest']:.1%} (avg: {fnr['average']:.1%}) - {fnr['direction']}")
    
    print("\n" + "=" * 80)


if __name__ == "__main__":
    print_dashboard_summary()
