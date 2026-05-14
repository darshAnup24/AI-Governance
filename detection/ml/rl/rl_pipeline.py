"""
Phase 4 RL Threshold Tuning - Batch Job Runner
Orchestrates the complete feedback → reward → threshold update pipeline
Runs daily/weekly offline (no runtime latency)
"""

import sys
import json
import logging
from pathlib import Path
from datetime import datetime
import argparse

# Add necessary directories to path for imports
rl_dir = Path(__file__).parent
detection_dir = rl_dir.parent.parent
sys.path.insert(0, str(rl_dir))
sys.path.insert(0, str(detection_dir / 'app'))

from reward_function import RewardCalculator
from rl_trainer import RLThresholdTrainer
from feedback_api import FeedbackStore

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RLThresholdTuningPipeline:
    """
    Complete RL pipeline: Feedback → Rewards → Threshold Updates
    
    Workflow:
    1. Collect user feedback from detection service
    2. Calculate rewards using reward function
    3. Aggregate rewards by category
    4. Update thresholds based on metrics
    5. Generate report and metrics
    6. Archive processed feedback
    """
    
    def __init__(self, 
                 feedback_dir: str = "detection/data/feedback",
                 config_dir: str = "detection/config"):
        """Initialize pipeline components"""
        self.feedback_store = FeedbackStore(feedback_dir)
        self.rl_trainer = RLThresholdTrainer(config_dir)
        self.reward_calc = RewardCalculator()
        
        self.report_file = Path(config_dir) / "rl_reports.jsonl"
    
    def run(self, dry_run: bool = False) -> Dict:
        """
        Run complete RL threshold tuning pipeline
        
        Args:
            dry_run: If True, don't save threshold changes
        
        Returns:
            Report with results
        """
        logger.info("=" * 80)
        logger.info("PHASE 4: RL THRESHOLD TUNING PIPELINE")
        logger.info("=" * 80)
        
        report = {
            "timestamp": datetime.now().isoformat(),
            "status": "running",
            "dry_run": dry_run,
            "stages": {}
        }
        
        # STAGE 1: Collect Feedback
        logger.info("\n[1/4] COLLECTING USER FEEDBACK...")
        feedback_list = self.feedback_store.get_unprocessed_feedback()
        
        if not feedback_list:
            logger.warning("No unprocessed feedback found")
            report["status"] = "no_feedback"
            report["message"] = "No feedback to process"
            return report
        
        report["stages"]["collection"] = {
            "feedback_count": len(feedback_list),
            "categories": self._count_by_category(feedback_list)
        }
        logger.info(f"✓ Collected {len(feedback_list)} feedback items")
        for cat, count in report["stages"]["collection"]["categories"].items():
            logger.info(f"  - {cat}: {count}")
        
        # STAGE 2: Calculate Rewards
        logger.info("\n[2/4] CALCULATING REWARDS...")
        reward_summary = self.rl_trainer.reward_calc.batch_calculate_rewards(feedback_list)
        
        report["stages"]["rewards"] = {
            "total_feedback": reward_summary["total_feedback"],
            "avg_reward": reward_summary["summary_stats"]["avg_reward"],
            "by_category": {},
        }
        
        for cat, data in reward_summary["rewards_by_category"].items():
            if data["count"] > 0:
                report["stages"]["rewards"]["by_category"][cat] = {
                    "count": data["count"],
                    "avg_reward": data["avg_reward"],
                    "feedback_types": self._count_feedback_types(data["feedback_types"]),
                }
        
        logger.info(f"✓ Rewards calculated (avg: {reward_summary['summary_stats']['avg_reward']:.3f})")
        
        # STAGE 3: Update Thresholds
        logger.info("\n[3/4] UPDATING THRESHOLDS...")
        
        if not dry_run:
            threshold_result = self.rl_trainer.process_feedback_batch(feedback_list)
            report["stages"]["thresholds"] = threshold_result
            
            logger.info(f"✓ Thresholds updated ({len(threshold_result['updates'])} categories)")
            for cat, update in threshold_result["updates"].items():
                old = update["old_threshold"]
                new = update["new_threshold"]
                change = new - old
                direction = "↑" if change > 0 else "↓" if change < 0 else "—"
                logger.info(
                    f"  - {cat}: {old:.3f} {direction} {new:.3f} "
                    f"(FPR: {update['metrics']['false_positive_rate']:.1%}, "
                    f"FNR: {update['metrics']['false_negative_rate']:.1%})"
                )
        else:
            logger.info("✓ DRY RUN: Threshold updates skipped")
            report["stages"]["thresholds"] = {"status": "dry_run_skipped"}
        
        # STAGE 4: Archive Feedback & Generate Report
        logger.info("\n[4/4] ARCHIVING FEEDBACK...")
        
        if not dry_run:
            feedback_ids = [fb["detection_id"] for fb in feedback_list]
            self.feedback_store.mark_feedback_processed(feedback_ids)
            logger.info(f"✓ Archived {len(feedback_ids)} feedback items")
        else:
            logger.info("✓ DRY RUN: Feedback archival skipped")
        
        # Generate summary
        report["status"] = "success"
        report["current_thresholds"] = self.rl_trainer.get_current_thresholds()
        report["metrics_summary"] = self.rl_trainer.get_metrics_summary()
        
        # Save report
        self._save_report(report)
        
        logger.info("\n" + "=" * 80)
        logger.info(f"PIPELINE COMPLETE: {report['status'].upper()}")
        logger.info("=" * 80)
        
        return report
    
    def _count_by_category(self, feedback_list: list) -> Dict[str, int]:
        """Count feedback by category"""
        counts = {}
        for fb in feedback_list:
            cat = fb.get("model_prediction", "unknown")
            counts[cat] = counts.get(cat, 0) + 1
        return counts
    
    def _count_feedback_types(self, types: list) -> Dict[str, int]:
        """Count feedback types"""
        counts = {}
        for t in types:
            counts[t] = counts.get(t, 0) + 1
        return counts
    
    def _save_report(self, report: Dict):
        """Save report to file"""
        with open(self.report_file, 'a') as f:
            f.write(json.dumps(report) + '\n')
        
        # Also save as latest report
        latest_file = self.report_file.parent / "rl_latest_report.json"
        with open(latest_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"Report saved to {latest_file}")
    
    def get_latest_report(self) -> Optional[Dict]:
        """Get latest pipeline report"""
        latest_file = self.report_file.parent / "rl_latest_report.json"
        if latest_file.exists():
            with open(latest_file, 'r') as f:
                return json.load(f)
        return None
    
    def generate_comparison_report(self) -> Dict:
        """Generate before/after threshold comparison"""
        metrics = self.rl_trainer.get_metrics_summary()
        
        comparison = {
            "timestamp": datetime.now().isoformat(),
            "categories": {}
        }
        
        for cat, data in metrics["thresholds"].items():
            comparison["categories"][cat] = {
                "previous": data["previous"],
                "current": data["current"],
                "change": data["change"],
                "change_percent": (data["change"] / data["previous"]) * 100 if data["previous"] > 0 else 0,
                "direction": "stricter" if data["change"] > 0 else "lenient" if data["change"] < 0 else "stable",
                "last_updated": data["last_updated"],
            }
        
        return comparison


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Phase 4 RL Threshold Tuning Pipeline"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without saving threshold changes"
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="Print latest report and exit"
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="Print threshold comparison and exit"
    )
    
    args = parser.parse_args()
    
    pipeline = RLThresholdTuningPipeline()
    
    if args.report:
        report = pipeline.get_latest_report()
        if report:
            print("\nLatest RL Pipeline Report:")
            print(json.dumps(report, indent=2))
        else:
            print("No report available")
        return
    
    if args.compare:
        comparison = pipeline.generate_comparison_report()
        print("\nThreshold Comparison Report:")
        print(json.dumps(comparison, indent=2))
        return
    
    # Run pipeline
    result = pipeline.run(dry_run=args.dry_run)
    
    # Print summary
    print("\n" + "=" * 80)
    print("PIPELINE RESULT SUMMARY")
    print("=" * 80)
    print(json.dumps(result, indent=2))
    
    return result


if __name__ == "__main__":
    main()
