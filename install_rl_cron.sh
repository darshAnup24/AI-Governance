#!/bin/bash
# Setup Phase 4 RL Threshold Tuning - Cron Job Installation
# This script sets up automated daily processing of user feedback

set -e  # Exit on error

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="${PROJECT_ROOT}/detection/ml/rl/run_rl_pipeline.sh"
LOG_DIR="${PROJECT_ROOT}/logs/rl"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Phase 4 RL Cron Job Setup${NC}"
echo -e "${GREEN}================================${NC}"
echo ""

# Step 1: Create log directory
echo -e "${YELLOW}[1/5] Creating log directory...${NC}"
mkdir -p "${LOG_DIR}"
echo -e "${GREEN}✓ Log directory created: ${LOG_DIR}${NC}"
echo ""

# Step 2: Make script executable
echo -e "${YELLOW}[2/5] Making pipeline script executable...${NC}"
chmod +x "${SCRIPT_PATH}"
echo -e "${GREEN}✓ Script made executable: ${SCRIPT_PATH}${NC}"
echo ""

# Step 3: Test the script
echo -e "${YELLOW}[3/5] Testing RL pipeline (dry-run)...${NC}"
cd "${PROJECT_ROOT}"

if python3 detection/ml/rl/rl_pipeline.py --dry-run > /tmp/rl_test.log 2>&1; then
    echo -e "${GREEN}✓ Pipeline test passed${NC}"
    cat /tmp/rl_test.log | head -20
else
    echo -e "${RED}✗ Pipeline test failed${NC}"
    cat /tmp/rl_test.log
    exit 1
fi
echo ""

# Step 4: Install cron job
echo -e "${YELLOW}[4/5] Installing cron job...${NC}"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "run_rl_pipeline.sh"; then
    echo -e "${YELLOW}ⓘ Cron job already installed${NC}"
else
    # Add cron job: Run daily at 2 AM
    CRON_CMD="0 2 * * * ${SCRIPT_PATH} >> /dev/null 2>&1"
    (crontab -l 2>/dev/null || true; echo "${CRON_CMD}") | crontab -
    echo -e "${GREEN}✓ Cron job installed: Daily at 2:00 AM${NC}"
fi
echo ""

# Step 5: Verification
echo -e "${YELLOW}[5/5] Verifying cron job...${NC}"
if crontab -l 2>/dev/null | grep -q "run_rl_pipeline.sh"; then
    echo -e "${GREEN}✓ Cron job installed successfully${NC}"
    echo ""
    echo -e "${GREEN}Current cron jobs:${NC}"
    crontab -l 2>/dev/null | grep "run_rl_pipeline.sh"
else
    echo -e "${RED}✗ Cron job verification failed${NC}"
    exit 1
fi
echo ""

# Summary
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "${GREEN}Phase 4 RL Threshold Tuning is now LIVE!${NC}"
echo ""
echo -e "Schedule: Daily at 2:00 AM"
echo -e "Log directory: ${LOG_DIR}"
echo -e "Feedback API: http://localhost:8001/feedback"
echo -e "Stats endpoint: http://localhost:8001/feedback/stats"
echo ""
echo -e "To view logs:"
echo -e "  tail -f ${LOG_DIR}/rl_pipeline_*.log"
echo ""
echo -e "To manually run the pipeline:"
echo -e "  python3 ${PROJECT_ROOT}/detection/ml/rl/rl_pipeline.py"
echo ""
echo -e "To uninstall the cron job:"
echo -e "  crontab -e  # and delete the line containing 'run_rl_pipeline.sh'"
echo ""
