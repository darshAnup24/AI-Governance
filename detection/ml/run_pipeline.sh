#!/usr/bin/env bash
# ============================================================
# ShieldAI ML Pipeline Runner
# ============================================================
# Usage:
#   ./detection/ml/run_pipeline.sh           — full pipeline
#   ./detection/ml/run_pipeline.sh dataset   — dataset only
#   ./detection/ml/run_pipeline.sh train     — train only
#   ./detection/ml/run_pipeline.sh evaluate  — evaluate only
#
# The trained models are saved to detection/ml/models/ and
# automatically loaded by the detection service on next start.
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Detect virtualenv
if [ -f "$PROJECT_ROOT/.venv/bin/python" ]; then
    PYTHON="$PROJECT_ROOT/.venv/bin/python"
elif command -v poetry &>/dev/null; then
    PYTHON="poetry run python"
else
    PYTHON="python3"
fi

echo "╔══════════════════════════════════════════════════════╗"
echo "║        ShieldAI ML Pipeline                         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Python: $PYTHON"
echo "  Project: $PROJECT_ROOT"
echo ""

STEP="${1:-all}"

run_dataset() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "STEP 1/3 — Build raw dataset"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cd "$PROJECT_ROOT"
    $PYTHON detection/ml/data/raw/build_dataset.py
    echo ""

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "STEP 2/3 — Preprocess & split"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    $PYTHON detection/ml/scripts/preprocess.py
    echo ""
}

run_train() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "STEP 3/3 — Train models"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cd "$PROJECT_ROOT"
    $PYTHON detection/ml/scripts/train.py --model-type both --n-iter 30
    echo ""
}

run_evaluate() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "STEP 4 — Evaluate on test set"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    cd "$PROJECT_ROOT"
    $PYTHON detection/ml/scripts/evaluate.py --model-type both
    echo ""
}

case "$STEP" in
    dataset)
        run_dataset
        ;;
    train)
        run_train
        ;;
    evaluate)
        run_evaluate
        ;;
    all|*)
        run_dataset
        run_train
        run_evaluate
        ;;
esac

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ML pipeline complete!"
echo ""
echo "  Models → detection/ml/models/"
echo "  Eval   → detection/ml/evaluation/report.md"
echo ""
echo "  The detection service will auto-load the models"
echo "  on next startup. No restart needed if using"
echo "  lazy loading (default)."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
