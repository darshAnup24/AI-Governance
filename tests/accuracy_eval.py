"""
ShieldAI Accuracy & Performance Evaluation Harness
==================================================
Runs the full detection pipeline (all available detectors) over the labeled
sample feed and reports classification metrics:

  • Per-category Precision / Recall / F1
  • Overall Accuracy
  • Macro / Micro / Weighted F1
  • Confusion-matrix-style TP / FP / FN per category
  • False Positive Rate on the SAFE corpus
  • Latency stats (mean, median, p95, p99) overall and per-detector
  • Action distribution (ALLOW / WARN / REDACT / BLOCK)

Run:
    poetry run python tests/accuracy_eval.py
"""
from __future__ import annotations

import statistics
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable

sys.path.insert(0, ".")

from tests.sample_feed_runner import SAMPLES, Case
from detection.app.regex_detector import RegexDetector
from detection.app.preprocessor import fast_path_route
from detection.app.risk_scorer import RiskScoreAggregator
from detection.app.detectors.prompt_injection_detector import PromptInjectionDetector
from detection.app.detectors.regulatory_detector import RegulatoryDetector
from detection.app.detectors.security_code_detector import SecurityCodeDetector
from detection.app.detectors.bias_detector import BiasDetector
from detection.app.detectors.hallucination_detector import HallucinationDetector

from proxy.app.models import DetectionResult


# ─── Optional / heavy detectors ──────────────────────────────────────────────
# These either depend on large models (spaCy / DeBERTa / sklearn pickles)
# or external services. Loaded best-effort; missing deps don't fail the run.

OPTIONAL_DETECTORS: dict[str, Any] = {}


def _try_load_optional() -> None:
    """Attempt to load NER + ML classifier; fail gracefully if missing."""
    try:
        from detection.app.ner_detector import DebertaNERDetector
        OPTIONAL_DETECTORS["ner"] = DebertaNERDetector()
    except Exception as e:
        print(f"  [skip] NER detector not available: {type(e).__name__}: {e}")

    try:
        from detection.app.ml_classifier import MLClassifier
        ml = MLClassifier()
        # Probe load to surface failures up-front
        ml.status()
        if ml.is_loaded:
            OPTIONAL_DETECTORS["ml_classifier"] = ml
        else:
            print(f"  [skip] ML classifier loaded no models")
    except Exception as e:
        print(f"  [skip] ML classifier not available: {type(e).__name__}: {e}")


# ─── Eval harness ────────────────────────────────────────────────────────────

@dataclass
class CaseResult:
    name: str
    expected: set[str]
    predicted: set[str]
    expect_safe: bool
    action: str
    risk_score: int
    latency_ms: float
    per_detector_ms: dict[str, float] = field(default_factory=dict)
    spans_total: int = 0
    tags: list[str] = field(default_factory=list)


def _run_detectors(
    text: str,
    detectors: dict[str, Callable[[str], DetectionResult]],
) -> tuple[list[DetectionResult], dict[str, float]]:
    """Run all detectors sequentially, returning results and per-detector ms."""
    results = []
    timings = {}
    for name, fn in detectors.items():
        t0 = time.perf_counter()
        try:
            result = fn(text)
            results.append(result)
        except Exception as e:
            print(f"    [warn] {name} threw {type(e).__name__}: {e}")
        timings[name] = (time.perf_counter() - t0) * 1000
    return results, timings


def evaluate_case(
    case: Case,
    detectors: dict[str, Callable[[str], DetectionResult]],
    aggregator: RiskScoreAggregator,
) -> CaseResult:
    """Run the full pipeline for one case and collect metrics."""
    expected = set(case.expect_cats) if not case.expect_safe else set()

    t_start = time.perf_counter()
    _, fpv = fast_path_route(case.text)
    if fpv.get("route") == "natural_language":
        input_context = "natural_language"
    elif fpv.get("code_markers") or fpv.get("secret_context") or fpv.get("vuln_signal"):
        input_context = "code"
    else:
        input_context = "natural_language"

    if fpv.get("route") == "empty":
        return CaseResult(
            name=case.name, expected=expected, predicted=set(),
            expect_safe=case.expect_safe, action="ALLOW", risk_score=0,
            latency_ms=(time.perf_counter() - t_start) * 1000,
            tags=case.tags,
        )

    results, per_det_ms = _run_detectors(case.text, detectors)
    final = aggregator.aggregate(results, user_role="", input_context=input_context)
    latency_ms = (time.perf_counter() - t_start) * 1000

    predicted = {s.category.value for s in final.detected_spans}

    return CaseResult(
        name=case.name,
        expected=expected,
        predicted=predicted,
        expect_safe=case.expect_safe,
        action=final.recommended_action.value,
        risk_score=final.score,
        latency_ms=latency_ms,
        per_detector_ms=per_det_ms,
        spans_total=len(final.detected_spans),
        tags=case.tags,
    )


# ─── Metric computation ──────────────────────────────────────────────────────

def _safe_div(num: float, denom: float) -> float:
    return num / denom if denom else 0.0


def per_category_metrics(results: list[CaseResult]) -> dict[str, dict[str, float]]:
    """Compute TP/FP/FN/Precision/Recall/F1 per category.

    A category fires for a case if predicted, and is "expected" if in
    expect_cats. SAFE cases (expect_cats=[]) only contribute false positives.
    """
    all_cats: set[str] = set()
    for r in results:
        all_cats |= r.expected | r.predicted

    metrics: dict[str, dict[str, float]] = {}
    for cat in sorted(all_cats):
        tp = sum(1 for r in results if cat in r.expected and cat in r.predicted)
        fp = sum(1 for r in results if cat not in r.expected and cat in r.predicted)
        fn = sum(1 for r in results if cat in r.expected and cat not in r.predicted)
        support = sum(1 for r in results if cat in r.expected)

        precision = _safe_div(tp, tp + fp)
        recall    = _safe_div(tp, tp + fn)
        f1        = _safe_div(2 * precision * recall, precision + recall)

        metrics[cat] = {
            "tp": tp, "fp": fp, "fn": fn,
            "support": support,
            "precision": precision,
            "recall": recall,
            "f1": f1,
        }
    return metrics


def aggregate_f1(metrics: dict[str, dict[str, float]]) -> dict[str, float]:
    """Macro / micro / weighted F1 across all categories."""
    cats = list(metrics.keys())
    if not cats:
        return {"macro_f1": 0.0, "micro_f1": 0.0, "weighted_f1": 0.0}

    macro_f1 = statistics.mean(metrics[c]["f1"] for c in cats)

    tp = sum(metrics[c]["tp"] for c in cats)
    fp = sum(metrics[c]["fp"] for c in cats)
    fn = sum(metrics[c]["fn"] for c in cats)
    micro_p = _safe_div(tp, tp + fp)
    micro_r = _safe_div(tp, tp + fn)
    micro_f1 = _safe_div(2 * micro_p * micro_r, micro_p + micro_r)

    total_support = sum(metrics[c]["support"] for c in cats)
    if total_support:
        weighted_f1 = sum(metrics[c]["f1"] * metrics[c]["support"] for c in cats) / total_support
    else:
        weighted_f1 = 0.0

    return {
        "macro_f1": macro_f1,
        "micro_f1": micro_f1,
        "weighted_f1": weighted_f1,
        "micro_precision": micro_p,
        "micro_recall": micro_r,
    }


def overall_accuracy(results: list[CaseResult]) -> dict[str, float]:
    """Case-level accuracy and false positive rate.

    A case is "correct" if:
      • for labeled cases: every expected category appears in predicted
      • for safe cases: NO high-risk category fires
    """
    correct = 0
    safe_total = 0
    safe_fp = 0
    for r in results:
        if r.expect_safe:
            safe_total += 1
            harmful_fp = r.predicted & {
                "API_KEY", "PII", "CREDENTIALS", "PROMPT_INJECTION",
                "REGULATORY", "SECURITY_VULN",
            }
            if not harmful_fp:
                correct += 1
            else:
                safe_fp += 1
        else:
            if r.expected.issubset(r.predicted):
                correct += 1

    return {
        "accuracy":            _safe_div(correct, len(results)),
        "false_positive_rate": _safe_div(safe_fp, safe_total),
        "correct_cases":       correct,
        "total_cases":         len(results),
        "safe_cases":          safe_total,
        "safe_fp":             safe_fp,
    }


def latency_stats(results: list[CaseResult]) -> dict[str, float]:
    """Mean / median / p95 / p99 latency in ms (end-to-end)."""
    lats = sorted(r.latency_ms for r in results)
    if not lats:
        return {}
    n = len(lats)
    return {
        "mean":   statistics.mean(lats),
        "median": statistics.median(lats),
        "p95":    lats[min(int(n * 0.95), n - 1)],
        "p99":    lats[min(int(n * 0.99), n - 1)],
        "max":    lats[-1],
        "min":    lats[0],
    }


def per_detector_latency(results: list[CaseResult]) -> dict[str, dict[str, float]]:
    """Mean / median / p95 latency per detector across all cases."""
    bucket: dict[str, list[float]] = defaultdict(list)
    for r in results:
        for det, ms in r.per_detector_ms.items():
            bucket[det].append(ms)

    stats: dict[str, dict[str, float]] = {}
    for det, vals in bucket.items():
        vals_sorted = sorted(vals)
        n = len(vals_sorted)
        stats[det] = {
            "mean":   statistics.mean(vals),
            "median": statistics.median(vals),
            "p95":    vals_sorted[min(int(n * 0.95), n - 1)],
            "max":    vals_sorted[-1],
            "calls":  n,
        }
    return stats


def action_distribution(results: list[CaseResult]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for r in results:
        counts[r.action] += 1
    return dict(counts)


# ─── Pretty-printing ─────────────────────────────────────────────────────────

def _fmt_pct(x: float) -> str:
    return f"{x * 100:6.2f}%"


def _bar(value: float, width: int = 20) -> str:
    filled = int(round(value * width))
    return "█" * filled + "░" * (width - filled)


def print_report(
    results: list[CaseResult],
    detector_names: list[str],
) -> None:
    cat_metrics = per_category_metrics(results)
    agg         = aggregate_f1(cat_metrics)
    acc         = overall_accuracy(results)
    lat         = latency_stats(results)
    det_lat     = per_detector_latency(results)
    actions     = action_distribution(results)

    print()
    print("═" * 78)
    print("  ShieldAI Detection Pipeline — Accuracy & Performance Evaluation")
    print(f"  Cases: {len(results)} • Detectors: {', '.join(detector_names)}")
    print("═" * 78)

    # ── Overall classification metrics ──
    print("\n┌─ OVERALL CLASSIFICATION ─────────────────────────────────────────────────┐")
    print(f"│  Accuracy            {_fmt_pct(acc['accuracy']):>10s}   "
          f"{_bar(acc['accuracy'])}   "
          f"({acc['correct_cases']}/{acc['total_cases']})")
    print(f"│  Macro     F1        {_fmt_pct(agg['macro_f1']):>10s}   "
          f"{_bar(agg['macro_f1'])}")
    print(f"│  Micro     F1        {_fmt_pct(agg['micro_f1']):>10s}   "
          f"{_bar(agg['micro_f1'])}")
    print(f"│  Weighted  F1        {_fmt_pct(agg['weighted_f1']):>10s}   "
          f"{_bar(agg['weighted_f1'])}")
    print(f"│  Micro Precision     {_fmt_pct(agg['micro_precision']):>10s}")
    print(f"│  Micro Recall        {_fmt_pct(agg['micro_recall']):>10s}")
    print(f"│  False Positive Rate {_fmt_pct(acc['false_positive_rate']):>10s}   "
          f"({acc['safe_fp']}/{acc['safe_cases']} safe cases)")
    print("└──────────────────────────────────────────────────────────────────────────┘")

    # ── Per-category metrics ──
    print("\n┌─ PER-CATEGORY METRICS ───────────────────────────────────────────────────┐")
    print(f"│  {'Category':<20s} {'Support':>8s} {'TP':>4s} {'FP':>4s} {'FN':>4s}  "
          f"{'Precision':>10s} {'Recall':>10s} {'F1':>10s} ")
    print("│  " + "─" * 72)
    for cat, m in sorted(cat_metrics.items(), key=lambda x: -x[1]["support"]):
        print(f"│  {cat:<20s} {int(m['support']):>8d} "
              f"{int(m['tp']):>4d} {int(m['fp']):>4d} {int(m['fn']):>4d}  "
              f"{_fmt_pct(m['precision']):>10s} {_fmt_pct(m['recall']):>10s} "
              f"{_fmt_pct(m['f1']):>10s}")
    print("└──────────────────────────────────────────────────────────────────────────┘")

    # ── Latency ──
    print("\n┌─ END-TO-END LATENCY (ms) ────────────────────────────────────────────────┐")
    print(f"│  mean={lat['mean']:6.2f}  median={lat['median']:6.2f}  "
          f"p95={lat['p95']:6.2f}  p99={lat['p99']:6.2f}  "
          f"max={lat['max']:6.2f}  min={lat['min']:6.2f}")
    print("└──────────────────────────────────────────────────────────────────────────┘")

    # ── Per-detector latency ──
    print("\n┌─ PER-DETECTOR LATENCY (ms) ──────────────────────────────────────────────┐")
    print(f"│  {'Detector':<22s} {'Calls':>6s} {'Mean':>8s} {'Median':>8s} "
          f"{'p95':>8s} {'Max':>8s}")
    print("│  " + "─" * 72)
    for det, s in sorted(det_lat.items(), key=lambda x: -x[1]["mean"]):
        print(f"│  {det:<22s} {int(s['calls']):>6d} "
              f"{s['mean']:>8.3f} {s['median']:>8.3f} "
              f"{s['p95']:>8.3f} {s['max']:>8.3f}")
    print("└──────────────────────────────────────────────────────────────────────────┘")

    # ── Action distribution ──
    print("\n┌─ ACTION DISTRIBUTION ────────────────────────────────────────────────────┐")
    total = sum(actions.values())
    for act in ("ALLOW", "LOG", "WARN", "REDACT", "BLOCK"):
        n = actions.get(act, 0)
        pct = _safe_div(n, total)
        print(f"│  {act:<8s} {n:>4d}  {_fmt_pct(pct)}  {_bar(pct, 30)}")
    print("└──────────────────────────────────────────────────────────────────────────┘")

    # ── Misclassifications ──
    fails = [r for r in results if not _case_passed(r)]
    if fails:
        print("\n┌─ MISCLASSIFICATIONS ─────────────────────────────────────────────────────┐")
        for r in fails:
            kind = "FP (safe→harmful)" if r.expect_safe else "FN (missing)"
            missing = sorted(r.expected - r.predicted)
            extra   = sorted(r.predicted - r.expected)
            print(f"│  [{kind}]  {r.name}")
            print(f"│      expected: {sorted(r.expected) or 'safe'}")
            print(f"│      predicted: {sorted(r.predicted) or 'none'}")
            if missing:
                print(f"│      missing:  {missing}")
            if extra and r.expect_safe:
                print(f"│      false positives: {extra}")
        print("└──────────────────────────────────────────────────────────────────────────┘")
    else:
        print("\n  ✓ Zero misclassifications across the full evaluation set.")

    print()


def _case_passed(r: CaseResult) -> bool:
    if r.expect_safe:
        harmful = r.predicted & {
            "API_KEY", "PII", "CREDENTIALS",
            "PROMPT_INJECTION", "REGULATORY", "SECURITY_VULN",
        }
        return not harmful
    return r.expected.issubset(r.predicted)


# ─── Entry point ─────────────────────────────────────────────────────────────

def main() -> int:
    print("Loading detectors...")
    regex_det      = RegexDetector()
    pi_det         = PromptInjectionDetector()
    reg_det        = RegulatoryDetector()
    sec_det        = SecurityCodeDetector()
    bias_det       = BiasDetector()
    hall_det       = HallucinationDetector()

    detectors: dict[str, Callable[[str], DetectionResult]] = {
        "regex":            regex_det.detect,
        "prompt_injection": pi_det.detect,
        "regulatory":       reg_det.detect,
        "security_code":    sec_det.detect,
        "bias":             bias_det.detect,
        "hallucination":    hall_det.detect,
    }

    _try_load_optional()
    if "ner" in OPTIONAL_DETECTORS:
        detectors["ner"] = OPTIONAL_DETECTORS["ner"].detect
    if "ml_classifier" in OPTIONAL_DETECTORS:
        detectors["ml_classifier"] = OPTIONAL_DETECTORS["ml_classifier"].detect

    aggregator = RiskScoreAggregator()

    print(f"Running {len(SAMPLES)} cases through {len(detectors)} detectors...\n")

    # Warm-up pass (skip first call's import / model-load latency)
    _ = evaluate_case(SAMPLES[0], detectors, aggregator)

    results = [evaluate_case(c, detectors, aggregator) for c in SAMPLES]

    print_report(results, list(detectors.keys()))

    # Exit code: nonzero if any misclassification
    return 0 if all(_case_passed(r) for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
