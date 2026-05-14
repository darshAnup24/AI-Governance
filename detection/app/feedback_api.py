"""
Feedback Collection API
Collects user corrections on detection results
Used by RL Threshold Tuning
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional
from dataclasses import dataclass, asdict
import uuid

logger = logging.getLogger(__name__)


@dataclass
class DetectionFeedback:
    """User feedback on a detection"""
    id: str
    detection_id: str
    timestamp: str
    text: str
    model_prediction: str
    model_confidence: float
    model_threshold: float
    user_correction: str
    user_confidence: float
    notes: str = ""
    status: str = "recorded"  # recorded, processed, archived


class FeedbackStore:
    """Store and manage user feedback for RL training"""
    
    def __init__(self, feedback_dir: str = "detection/data/feedback"):
        """Initialize feedback store"""
        self.feedback_dir = Path(feedback_dir)
        self.feedback_dir.mkdir(parents=True, exist_ok=True)
        
        self.feedback_file = self.feedback_dir / "user_feedback.jsonl"
        self.processed_file = self.feedback_dir / "processed_feedback.jsonl"
        
        # Ensure files exist and are writable
        try:
            self.feedback_file.touch(exist_ok=True)
            self.processed_file.touch(exist_ok=True)
        except PermissionError:
            logger.warning(f"Permission denied creating files in {self.feedback_dir}")
            logger.info("Attempting to use alternative directory structure")
            # Try to create in a user-writable location
            alt_dir = Path.home() / ".ai-governance" / "feedback"
            alt_dir.mkdir(parents=True, exist_ok=True)
            self.feedback_dir = alt_dir
            self.feedback_file = self.feedback_dir / "user_feedback.jsonl"
            self.processed_file = self.feedback_dir / "processed_feedback.jsonl"
            self.feedback_file.touch(exist_ok=True)
            self.processed_file.touch(exist_ok=True)
        
        logger.info(f"Feedback store initialized at {self.feedback_dir}")
    
    def add_feedback(self, detection_id: str, text: str, 
                    model_prediction: str, model_confidence: float,
                    model_threshold: float,
                    user_correction: str, user_confidence: float,
                    notes: str = "") -> Dict:
        """
        Record user feedback on a detection
        
        Args:
            detection_id: ID of the detection being corrected
            text: Original detected text
            model_prediction: What model predicted
            model_confidence: Model's confidence (0.0-1.0)
            model_threshold: Threshold used for detection
            user_correction: What user says is correct
            user_confidence: User's confidence (0.0-1.0)
            notes: Optional notes from user
        
        Returns:
            Feedback record with ID
        """
        feedback = DetectionFeedback(
            id=str(uuid.uuid4()),
            detection_id=detection_id,
            timestamp=datetime.now().isoformat(),
            text=text,
            model_prediction=model_prediction,
            model_confidence=model_confidence,
            model_threshold=model_threshold,
            user_correction=user_correction,
            user_confidence=user_confidence,
            notes=notes
        )
        
        # Save to feedback file
        with open(self.feedback_file, 'a') as f:
            f.write(json.dumps(asdict(feedback)) + '\n')
        
        logger.info(
            f"Feedback recorded: {feedback.id} "
            f"({feedback.model_prediction} → {feedback.user_correction})"
        )
        
        return asdict(feedback)
    
    def get_unprocessed_feedback(self, limit: int = 1000) -> list:
        """Get feedback that hasn't been used for RL training yet"""
        feedback_list = []
        
        if not self.feedback_file.exists():
            return []
        
        with open(self.feedback_file, 'r') as f:
            for i, line in enumerate(f):
                if i >= limit:
                    break
                try:
                    fb = json.loads(line)
                    if fb.get("status") == "recorded":
                        # Convert to format expected by RL trainer
                        feedback_list.append({
                            "detection_id": fb["detection_id"],
                            "text": fb["text"],
                            "model_prediction": fb["model_prediction"],
                            "model_confidence": fb["model_confidence"],
                            "model_threshold": fb["model_threshold"],
                            "true_label": fb["user_correction"],
                            "user_confidence": fb["user_confidence"],
                            "notes": fb["notes"],
                        })
                except json.JSONDecodeError:
                    logger.warning(f"Failed to parse feedback line {i}")
        
        return feedback_list
    
    def mark_feedback_processed(self, feedback_ids: list):
        """Mark feedback as processed (used for RL training)"""
        try:
            # Read all feedback
            all_feedback = []
            if self.feedback_file.exists():
                with open(self.feedback_file, 'r') as f:
                    for line in f:
                        try:
                            all_feedback.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass
            
            # Mark specified IDs as processed
            for fb in all_feedback:
                if fb.get("id") in feedback_ids:
                    fb["status"] = "processed"
            
            # Archive processed feedback
            with open(self.processed_file, 'a') as f:
                for fb in all_feedback:
                    if fb.get("status") == "processed":
                        f.write(json.dumps(fb) + '\n')
            
            # Rewrite feedback file with only unprocessed
            with open(self.feedback_file, 'w') as f:
                for fb in all_feedback:
                    if fb.get("status") != "processed":
                        f.write(json.dumps(fb) + '\n')
            
            logger.info(f"Marked {len(feedback_ids)} feedback items as processed")
        except PermissionError as e:
            logger.warning(f"Permission denied marking feedback as processed: {e}")
            logger.info("Feedback items remain in queue for next run")
        
        logger.info(f"Marked {len(feedback_ids)} feedback items as processed")
    
    def get_feedback_stats(self) -> Dict:
        """Get statistics on feedback collected"""
        stats = {
            "total_feedback": 0,
            "unprocessed": 0,
            "processed": 0,
            "by_category": {},
            "correction_rate": 0.0,
        }
        
        if not self.feedback_file.exists():
            return stats
        
        corrections = 0
        
        # Count unprocessed
        with open(self.feedback_file, 'r') as f:
            for line in f:
                try:
                    fb = json.loads(line)
                    stats["total_feedback"] += 1
                    if fb.get("status") == "recorded":
                        stats["unprocessed"] += 1
                    
                    # Track corrections
                    if fb.get("model_prediction") != fb.get("user_correction"):
                        corrections += 1
                    
                    # Count by category
                    cat = fb.get("user_correction", "unknown")
                    stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1
                except json.JSONDecodeError:
                    pass
        
        # Count processed
        if self.processed_file.exists():
            with open(self.processed_file, 'r') as f:
                for line in f:
                    try:
                        fb = json.loads(line)
                        stats["processed"] += 1
                        stats["by_category"][fb.get("user_correction", "unknown")] = \
                            stats["by_category"].get(fb.get("user_correction", "unknown"), 0) + 1
                    except json.JSONDecodeError:
                        pass
        
        if stats["total_feedback"] > 0:
            stats["correction_rate"] = corrections / stats["total_feedback"]
        
        return stats


# Example FastAPI endpoints
"""
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()
feedback_store = FeedbackStore()


class FeedbackRequest(BaseModel):
    detection_id: str
    text: str
    model_prediction: str
    model_confidence: float
    model_threshold: float
    user_correction: str
    user_confidence: float
    notes: str = ""


@app.post("/api/feedback")
async def submit_feedback(feedback: FeedbackRequest):
    '''Record user feedback on a detection'''
    try:
        result = feedback_store.add_feedback(
            detection_id=feedback.detection_id,
            text=feedback.text,
            model_prediction=feedback.model_prediction,
            model_confidence=feedback.model_confidence,
            model_threshold=feedback.model_threshold,
            user_correction=feedback.user_correction,
            user_confidence=feedback.user_confidence,
            notes=feedback.notes
        )
        return {
            "status": "success",
            "feedback_id": result["id"],
            "message": f"Feedback recorded: {feedback.model_prediction} → {feedback.user_correction}"
        }
    except Exception as e:
        logger.error(f"Error recording feedback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/feedback/stats")
async def get_stats():
    '''Get feedback statistics'''
    return feedback_store.get_feedback_stats()


@app.get("/api/feedback/unprocessed")
async def get_unprocessed(limit: int = 100):
    '''Get unprocessed feedback for RL training'''
    return {
        "feedback": feedback_store.get_unprocessed_feedback(limit),
        "count": len(feedback_store.get_unprocessed_feedback(limit))
    }
"""

# Example usage
if __name__ == "__main__":
    store = FeedbackStore()
    
    # Add example feedback
    print("Adding example feedback...\n")
    
    fb1 = store.add_feedback(
        detection_id="det_001",
        text="My API key is sk-abc123def456",
        model_prediction="CREDENTIALS",
        model_confidence=0.87,
        model_threshold=0.45,
        user_correction="CREDENTIALS",
        user_confidence=0.95,
        notes="Correct detection"
    )
    print(f"Recorded: {fb1['id']}\n")
    
    fb2 = store.add_feedback(
        detection_id="det_002",
        text="John Smith is a person",
        model_prediction="PII",
        model_confidence=0.62,
        model_threshold=0.45,
        user_correction="SAFE",
        user_confidence=0.90,
        notes="False alarm"
    )
    print(f"Recorded: {fb2['id']}\n")
    
    # Get stats
    stats = store.get_feedback_stats()
    print("Feedback Statistics:")
    print(json.dumps(stats, indent=2))
    
    # Get unprocessed for training
    unprocessed = store.get_unprocessed_feedback()
    print(f"\nUnprocessed feedback ({len(unprocessed)} items):")
    for fb in unprocessed:
        print(f"  {fb['model_prediction']} → {fb['true_label']}")
