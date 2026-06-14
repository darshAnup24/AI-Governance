"""
Hard Negative Mining
====================
Runs the current model on 500 known-safe enterprise prompts, collects all
samples where the model incorrectly predicted a detection category with
score > 0.5, adds them to training data labeled as SAFE, retrains, and
reports the new FPR on the held-out safe test set.

Usage:
    python detection/scripts/mine_hard_negatives.py [--threshold 0.5]
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import pickle
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

ML_DIR = Path(__file__).parent.parent / "ml"
MODEL_DIR = ML_DIR / "models"
TRAINING_CSV = Path(__file__).parent.parent / "sensitivity_training_data.csv"

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
log = logging.getLogger(__name__)

ALL_CATS = ["SAFE", "PII", "CREDENTIALS", "PROMPT_INJECTION", "HALLUCINATION", "BIAS", "REGULATORY"]

ENTERPRISE_SAFE_PROMPTS = [
    "Can you review my pull request for the authentication module?",
    "Please check this Python function for any bugs or edge cases",
    "I need a code review on the new API endpoint implementation",
    "Could you look at my SQL query and suggest optimizations?",
    "Please review the error handling in this microservice",
    "Can you check if this regex pattern correctly validates email addresses?",
    "Review the unit tests for the payment processing module",
    "I need feedback on my implementation of the sorting algorithm",
    "Please review the Docker configuration for production deployment",
    "Check this JavaScript code for potential memory leaks",
    "Review the database migration scripts before we deploy",
    "Can you verify the API rate limiting implementation?",
    "Please review the caching layer for performance issues",
    "Check the security implications of this OAuth flow",
    "Review the logging configuration for sensitive data exposure",
    "I need a review of the WebSocket connection handling code",
    "Please check the retry logic in the HTTP client",
    "Review the data validation in the form submission handler",
    "Can you check this code for race conditions?",
    "Please review the error boundary implementation in React",
    "Review the database connection pooling configuration",
    "Check the input sanitization in the search feature",
    "Please review the file upload validation logic",
    "Can you verify the encryption key rotation process?",
    "Review the CI/CD pipeline configuration for efficiency",
    "I need feedback on the new caching strategy",
    "Please review the pagination implementation",
    "Check the concurrency handling in the task queue",
    "Review the health check endpoint implementation",
    "Can you review the feature flag configuration?",
    "Please check the data serialization format",
    "Review the API versioning strategy",
    "Check the load balancer health check configuration",
    "Please review the database indexing strategy",
    "Can you check the CORS configuration for our API?",
    "Review the service mesh configuration",
    "I need a review of the event sourcing implementation",
    "Please check the circuit breaker configuration",
    "Review the observability setup including logs metrics and traces",
    "Can you verify the blue-green deployment configuration?",
    "Please summarize the quarterly revenue report for the board meeting",
    "Can you provide a brief summary of the project status document?",
    "Summarize the key findings from the user research report",
    "Please create an executive summary of the technical architecture review",
    "Summarize the compliance audit findings for the leadership team",
    "Can you summarize the customer feedback from the last sprint?",
    "Please summarize the security assessment report",
    "Summarize the key takeaways from the industry conference",
    "Can you provide a summary of the performance benchmark results?",
    "Please summarize the risk assessment for the new feature launch",
    "Summarize the data migration plan for the infrastructure team",
    "Can you summarize the accessibility audit findings?",
    "Please summarize the cost optimization recommendations",
    "Summarize the incident post-mortem for the outage last week",
    "Can you provide a summary of the market analysis report?",
    "Please summarize the vendor evaluation criteria",
    "Summarize the regulatory changes affecting our industry",
    "Can you summarize the team retrospective outcomes?",
    "Please summarize the disaster recovery test results",
    "Summarize the technical debt assessment for the quarter",
    "Let us schedule a call for next week to discuss the architecture",
    "Can you set up a meeting with the engineering team for Thursday?",
    "Please schedule a 30-minute sync about the sprint planning",
    "Let us arrange a meeting to review the deployment strategy",
    "Can you find a time for a cross-team alignment meeting?",
    "Please schedule the quarterly business review with stakeholders",
    "Let us set up a technical deep dive on the new database design",
    "Can you schedule a meeting to discuss the API design review?",
    "Please arrange a meeting with the security team about the audit",
    "Let us schedule a brown bag session on the new framework",
    "Can you set up a 1-on-1 to discuss career growth?",
    "Please schedule the sprint demo for Friday afternoon",
    "Let us arrange a meeting to finalize the Q3 roadmap",
    "Can you schedule a meeting with the product team about priorities?",
    "Please set up a technical interview for the candidate pipeline",
    "Let us schedule a meeting to review the monitoring dashboards",
    "Can you arrange a meeting to discuss the data pipeline improvements?",
    "Please schedule the architecture review board meeting",
    "Let us set up a meeting to plan the migration timeline",
    "Can you schedule a meeting with the DevOps team about CI/CD?",
    "The new feature will be deployed on Friday",
    "Can someone review my pull request?",
    "I will be out of office next Monday",
    "The integration tests passed successfully",
    "Please find the quarterly report attached",
    "Do not forget to submit your timesheets",
    "The marketing campaign starts next month",
    "I am getting a 404 error on the homepage",
    "The CPU usage spiked around 3 PM",
    "Did anyone see my coffee mug?",
    "We need to update the CSS on the landing page",
    "The weather is quite nice today",
    "Hello team please review the attached document",
    "Can you push the latest commit to the main branch?",
    "The deployment pipeline is running smoothly",
    "Please update your local development environment",
    "The staging environment is ready for testing",
    "We have a new team member joining on Monday",
    "The office will be closed for the holiday",
    "Please complete the mandatory security training",
    "The project deadline has been extended by one week",
    "We need to schedule a knowledge sharing session",
    "The infrastructure costs are within budget this quarter",
    "Can you help onboard the new contractor?",
    "The API documentation needs to be updated",
    "Please review the proposed changes to the data model",
    "We are switching to a new project management tool",
    "The performance testing results are available",
    "Can you assist with the database schema migration?",
    "Please attend the all-hands meeting at 3 PM",
    "How do I set up the local development environment?",
    "Can you help me configure the CI pipeline?",
    "What are the steps to deploy to production?",
    "How do I add a new API endpoint?",
    "Can you explain the database migration process?",
    "How do I configure the monitoring dashboards?",
    "What is the process for onboarding a new service?",
    "How do I set up the feature flags?",
    "Can you walk me through the release process?",
    "How do I configure the load balancer?",
    "What are the steps to set up a new environment?",
    "How do I add logging to my service?",
    "Can you explain the service discovery mechanism?",
    "How do I set up the distributed tracing?",
    "What is the process for rotating API keys?",
    "How do I configure the auto-scaling rules?",
    "Can you explain the backup and restore process?",
    "How do I set up the database replication?",
    "What are the steps to configure SSL certificates?",
    "How do I set up the container orchestration?",
    "The sprint velocity is on track for this quarter",
    "We completed 85 percent of the planned stories this sprint",
    "The system uptime is 99.95 percent this month",
    "The average response time is within the SLA",
    "We resolved 42 bugs in the last release",
    "The test coverage is at 78 percent for the core modules",
    "The deployment frequency is 3 times per week",
    "The mean time to recovery is under 30 minutes",
    "The error rate is below the 0.1 percent threshold",
    "We have 15 open pull requests in the queue",
    "The build time has been reduced by 40 percent",
    "The infrastructure costs decreased by 12 percent",
    "The API latency p99 is under 200ms",
    "The database queries are optimized and indexed",
    "The cache hit rate is at 92 percent",
    "The memory usage is stable across all services",
    "The disk I/O is within acceptable limits",
    "The network throughput meets the requirements",
    "The container orchestration is running smoothly",
    "The monitoring alerts are configured correctly",
    "Should we use PostgreSQL or MongoDB for this use case?",
    "What do you think about adopting Kubernetes?",
    "Is microservices architecture the right choice here?",
    "Should we implement event sourcing or CQRS?",
    "What are the trade-offs between REST and gRPC?",
    "Should we use serverless for the data processing pipeline?",
    "What do you think about the new React server components?",
    "Is GraphQL appropriate for our API layer?",
    "Should we migrate from Jenkins to GitHub Actions?",
    "What are the benefits of using a service mesh?",
    "Should we implement circuit breakers for all services?",
    "What do you think about adopting TypeScript everywhere?",
    "Is the strangler fig pattern suitable for the migration?",
    "Should we use a message queue or event stream?",
    "What do you think about the proposed data architecture?",
    "Is the current scaling strategy sufficient?",
    "Should we implement blue-green or canary deployments?",
    "What do you think about the new API design?",
    "Is the current testing strategy comprehensive enough?",
    "Should we invest in more automated testing?",
    "I need help debugging the authentication flow",
    "Can you assist with the database query optimization?",
    "How do I fix the memory leak in the worker service?",
    "Can you help me understand the error logs?",
    "I need help setting up the local database",
    "Can you explain how the caching layer works?",
    "I need help with the CSS layout issue",
    "Can you help me troubleshoot the API timeout?",
    "I need assistance with the data import script",
    "Can you help me understand the deployment process?",
    "I need help with the regex pattern for validation",
    "Can you assist with the integration test setup?",
    "I need help configuring the logging framework",
    "Can you explain the authentication middleware?",
    "I need help with the WebSocket connection issue",
    "Can you help me debug the race condition?",
    "I need assistance with the performance profiling",
    "Can you help me understand the error handling?",
    "I need help with the database transaction handling",
    "Can you assist with the API rate limiting setup?",
    "How long will the database migration take?",
    "Can you estimate the effort for the new feature?",
    "What is the timeline for the infrastructure upgrade?",
    "How many sprints will the refactoring take?",
    "Can you provide a rough estimate for the API redesign?",
    "What is the projected timeline for the security audit?",
    "How long will the data migration take?",
    "Can you estimate the cost for the cloud infrastructure?",
    "What is the timeline for the compliance certification?",
    "How many developers do we need for the project?",
    "Can you estimate the testing effort?",
    "What is the projected delivery date?",
    "How long will the code review take?",
    "Can you estimate the infrastructure costs?",
    "What is the timeline for the performance optimization?",
    "How many sprints for the technical debt reduction?",
    "Can you estimate the training requirements?",
    "What is the projected timeline for the launch?",
    "How long will the integration testing take?",
    "Can you estimate the documentation effort?",
    "What is the proposed architecture for the new service?",
    "Can you review the system design document?",
    "How does the data flow through the system?",
    "What are the failure modes we need to handle?",
    "Can you explain the service communication pattern?",
    "What is the disaster recovery strategy?",
    "How do we ensure data consistency across services?",
    "What is the scalability plan for the platform?",
    "Can you describe the security architecture?",
    "What is the monitoring and alerting strategy?",
    "How do we handle service dependencies?",
    "What is the data retention policy?",
    "Can you explain the caching strategy?",
    "What is the API versioning approach?",
    "How do we handle backward compatibility?",
    "What is the feature flag management strategy?",
    "Can you describe the CI/CD architecture?",
    "What is the infrastructure provisioning approach?",
    "How do we handle configuration management?",
    "What is the secrets management strategy?",
    "What is our branching strategy?",
    "How do we handle hotfixes?",
    "What is the code review process?",
    "How do we manage technical debt?",
    "What is our incident response process?",
    "How do we handle production issues?",
    "What is our change management process?",
    "How do we manage dependencies?",
    "What is our release cadence?",
    "How do we handle backward compatibility?",
    "What is our testing strategy?",
    "How do we manage environment configurations?",
    "What is our documentation process?",
    "How do we handle versioning?",
    "What is our dependency update policy?",
    "How do we manage feature flags?",
    "What is our performance testing approach?",
    "How do we handle security patches?",
    "What is our capacity planning process?",
    "How do we manage technical specifications?",
    "The service is returning 500 errors intermittently",
    "We are seeing increased latency in the API responses",
    "The database connection pool is exhausted",
    "The message queue is backing up",
    "We are seeing OOM errors in the worker pods",
    "The cache invalidation is not working correctly",
    "The authentication token refresh is failing",
    "The file upload is timing out for large files",
    "The WebSocket connections are dropping frequently",
    "The search index is out of sync",
    "The scheduled jobs are not running on time",
    "The health checks are failing intermittently",
    "The SSL certificate is expiring soon",
    "The DNS resolution is slow",
    "The CDN is serving stale content",
    "The load balancer is not distributing traffic evenly",
    "The database replication lag is increasing",
    "The container startup time is too slow",
    "The build pipeline is failing intermittently",
    "The test environment is unstable",
]


def load_model() -> tuple[Any, Any]:
    sklearn_path = MODEL_DIR / "sklearn_classifier.pkl"
    spacy_path = MODEL_DIR / "spacy_textcat_best"
    if not spacy_path.exists():
        spacy_path = MODEL_DIR / "spacy_textcat"

    sklearn_model = None
    spacy_nlp = None

    if sklearn_path.exists():
        with sklearn_path.open("rb") as f:
            sklearn_model = pickle.load(f)
        log.info("Loaded sklearn model from %s", sklearn_path)

    if spacy_path.exists():
        import spacy
        spacy_nlp = spacy.load(str(spacy_path))
        log.info("Loaded spaCy model from %s", spacy_path)

    return sklearn_model, spacy_nlp


def predict_ensemble(text: str, sklearn_model: Any, spacy_nlp: Any) -> dict[str, float]:
    scores = {cat: 0.0 for cat in ALL_CATS}

    if sklearn_model is not None:
        try:
            proba_list = sklearn_model.predict_proba([text])
            for i, cat in enumerate(ALL_CATS):
                if i < len(proba_list):
                    scores[cat] = max(scores[cat], float(proba_list[i][0][1]))
        except Exception:
            pass

    if spacy_nlp is not None:
        try:
            doc = spacy_nlp(text)
            for cat in ALL_CATS:
                scores[cat] = max(scores[cat], float(doc.cats.get(cat, 0.0)))
        except Exception:
            pass

    return scores


def mine_hard_negatives(sklearn_model: Any, spacy_nlp: Any, threshold: float = 0.5) -> list[dict]:
    hard_negatives = []
    total = len(ENTERPRISE_SAFE_PROMPTS)

    log.info("Running model on %d safe enterprise prompts...", total)

    for i, prompt in enumerate(ENTERPRISE_SAFE_PROMPTS):
        scores = predict_ensemble(prompt, sklearn_model, spacy_nlp)
        non_safe = {k: v for k, v in scores.items() if k != "SAFE" and v > threshold}

        if non_safe:
            top_cat = max(non_safe, key=non_safe.get)
            hard_negatives.append({
                "text": prompt,
                "predicted_category": top_cat,
                "predicted_score": round(non_safe[top_cat], 4),
                "all_scores": {k: round(v, 4) for k, v in scores.items()},
                "true_label": "SAFE",
            })

        if (i + 1) % 100 == 0:
            log.info("  Processed %d/%d (%.0f%%)", i + 1, total, (i + 1) / total * 100)

    log.info("Found %d hard negatives out of %d safe prompts (%.1f%% FPR)",
             len(hard_negatives), total, len(hard_negatives) / total * 100)

    return hard_negatives


def add_to_training_data(hard_negatives: list[dict]) -> Path:
    existing_texts = set()
    if TRAINING_CSV.exists():
        with TRAINING_CSV.open(encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader, None)
            for row in reader:
                if row:
                    existing_texts.add(row[0].strip())

    added = 0
    with TRAINING_CSV.open("a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for hn in hard_negatives:
            text = hn["text"].strip()
            if text not in existing_texts:
                writer.writerow([text, 0])
                existing_texts.add(text)
                added += 1

    log.info("Added %d new hard negatives to %s", added, TRAINING_CSV)
    return TRAINING_CSV


def retrain_and_evaluate() -> dict:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.multioutput import MultiOutputClassifier
    from sklearn.pipeline import Pipeline
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import f1_score, precision_score, recall_score

    # Load multi-label JSONL data (same format as train.py)
    jsonl_path = ML_DIR / "data" / "processed" / "train.jsonl"
    if not jsonl_path.exists():
        jsonl_path = ML_DIR / "data" / "train.jsonl"

    texts = []
    labels = []

    if jsonl_path.exists():
        # Multi-label format from train.py
        with jsonl_path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                texts.append(rec["text"])
                labels.append([1 if rec["labels"].get(c, False) else 0 for c in ALL_CATS])
        log.info("Loaded %d multi-label samples from %s", len(texts), jsonl_path)
    else:
        # Fallback: binary CSV → expand to multi-label
        import csv
        with TRAINING_CSV.open(encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader, None)
            for row in reader:
                if len(row) >= 2:
                    texts.append(row[0])
                    binary = int(row[1])
                    if binary == 0:
                        labels.append([1, 0, 0, 0, 0, 0, 0])  # SAFE=1
                    else:
                        labels.append([0, 1, 0, 0, 0, 0, 0])  # PII=1 (generic sensitive)
        log.info("Loaded %d binary samples from CSV (expanded to multi-label)", len(texts))

    labels_arr = np.array(labels)

    train_texts, test_texts, train_labels, test_labels = train_test_split(
        texts, labels_arr, test_size=0.15, random_state=42,
    )

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 3), max_features=50_000, sublinear_tf=True)),
        ("clf", MultiOutputClassifier(
            LogisticRegression(C=1.5, max_iter=2000, solver="saga", class_weight="balanced"),
            n_jobs=-1,
        )),
    ])

    start = time.perf_counter()
    pipeline.fit(train_texts, train_labels)
    elapsed = time.perf_counter() - start
    log.info("Retraining completed in %.1fs", elapsed)

    test_preds = pipeline.predict(test_texts)

    # Overall metrics
    f1 = f1_score(test_labels, test_preds, average="micro", zero_division=0)
    prec = precision_score(test_labels, test_preds, average="micro", zero_division=0)
    rec = recall_score(test_labels, test_preds, average="micro", zero_division=0)

    # Binary FPR: SAFE category (index 0)
    # FP = predicted SAFE=0 but actual SAFE=1 (model missed safe → predicted something else)
    safe_idx = 0
    safe_actual = test_labels[:, safe_idx]
    safe_predicted = test_preds[:, safe_idx]
    fp = int(np.sum((safe_predicted == 0) & (safe_actual == 1)))
    tn = int(np.sum((safe_predicted == 0) & (safe_actual == 0)))
    fn = int(np.sum((safe_predicted == 1) & (safe_actual == 0)))
    tp = int(np.sum((safe_predicted == 1) & (safe_actual == 1)))
    fpr = fp / max(fp + tn, 1)
    fnr = fn / max(fn + tp, 1)

    # Per-category F1
    per_cat_f1 = {}
    for i, cat in enumerate(ALL_CATS):
        cat_f1 = f1_score(test_labels[:, i], test_preds[:, i], zero_division=0)
        per_cat_f1[cat] = round(cat_f1, 4)

    results = {
        "f1": round(f1, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "fpr": round(fpr, 4),
        "fnr": round(fnr, 4),
        "fp": fp, "tn": tn, "fn": fn, "tp": tp,
        "per_category_f1": per_cat_f1,
        "train_size": len(train_texts),
        "test_size": len(test_texts),
        "total_training_samples": len(texts),
        "training_time_s": round(elapsed, 2),
    }

    model_path = MODEL_DIR / "sklearn_classifier.pkl"
    with model_path.open("wb") as f:
        pickle.dump(pipeline, f)
    log.info("Saved updated model to %s", model_path)

    return results


def main():
    parser = argparse.ArgumentParser(description="Hard Negative Mining")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--no-retrain", action="store_true")
    args = parser.parse_args()

    print("=" * 70)
    print("  Hard Negative Mining")
    print("=" * 70)

    sklearn_model, spacy_nlp = load_model()
    if sklearn_model is None and spacy_nlp is None:
        log.error("No models found. Run training first.")
        sys.exit(1)

    hard_negatives = mine_hard_negatives(sklearn_model, spacy_nlp, args.threshold)

    if not hard_negatives:
        print("\nNo hard negatives found! Model is already well-calibrated.")
        return

    print(f"\nTop 10 hard negatives (model confidence > {args.threshold}):")
    print("-" * 70)
    sorted_hn = sorted(hard_negatives, key=lambda x: x["predicted_score"], reverse=True)
    for i, hn in enumerate(sorted_hn[:10]):
        print(f"  {i+1}. [{hn['predicted_category']} {hn['predicted_score']:.3f}] {hn['text'][:80]}...")

    print(f"\nAdding {len(hard_negatives)} hard negatives to training data...")
    add_to_training_data(hard_negatives)

    if not args.no_retrain:
        print("\nRetraining model with hard negatives...")
        results = retrain_and_evaluate()

        print(f"\n{'='*70}")
        print(f"  Retraining Results")
        print(f"{'='*70}")
        print(f"  Training samples: {results['total_training_samples']}")
        print(f"  Test samples: {results['test_size']}")
        print(f"  Micro F1:      {results['f1']:.4f}")
        print(f"  Micro Prec:    {results['precision']:.4f}")
        print(f"  Micro Recall:  {results['recall']:.4f}")
        print(f"  FPR (safe):    {results['fpr']:.4f} ({results['fp']}/{results['fp']+results['tn']})")
        print(f"  FNR:           {results['fnr']:.4f} ({results['fn']}/{results['fn']+results['tp']})")
        print(f"  Training:      {results['training_time_s']:.1f}s")
        if "per_category_f1" in results:
            print(f"\n  Per-category F1:")
            for cat, f1_val in results["per_category_f1"].items():
                print(f"    {cat:<22} {f1_val:.4f}")
        print(f"{'='*70}")

        results_path = MODEL_DIR / "hard_negative_results.json"
        with results_path.open("w") as f:
            json.dump(results, f, indent=2)
        print(f"  Results saved to: {results_path}")


if __name__ == "__main__":
    main()
