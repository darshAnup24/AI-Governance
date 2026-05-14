#!/bin/bash
# Phase 4 RL Threshold Tuning - Automated Cron Job
# Run daily/weekly to process feedback and update thresholds
# NO RUNTIME LATENCY - runs offline in background

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/rl"
PYTHON_CMD="python3"

# Create log directory
mkdir -p "${LOG_DIR}"

# Timestamp for log files
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="${LOG_DIR}/rl_pipeline_${TIMESTAMP}.log"

# Function to log messages
log_message() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log_message "=========================================="
log_message "Phase 4 RL Threshold Tuning Pipeline"
log_message "=========================================="
log_message "Project root: ${PROJECT_ROOT}"
log_message "Log file: ${LOG_FILE}"

# Change to project root
cd "${PROJECT_ROOT}" || exit 1

# Run RL pipeline
log_message "Starting RL pipeline..."
"${PYTHON_CMD}" detection/ml/rl/rl_pipeline.py >> "${LOG_FILE}" 2>&1

if [ $? -eq 0 ]; then
    log_message "✓ RL pipeline completed successfully"
    
    # Optionally: Send success notification
    # curl -X POST http://monitoring-service/notify \
    #   -d "message=RL threshold tuning completed"
else
    log_message "✗ RL pipeline failed with error"
    
    # Optionally: Send error notification
    # curl -X POST http://monitoring-service/notify \
    #   -d "message=RL threshold tuning FAILED"
    exit 1
fi

# Display metrics summary
log_message ""
log_message "Displaying metrics summary..."
"${PYTHON_CMD}" detection/ml/rl/rl_monitoring.py >> "${LOG_FILE}" 2>&1

log_message "=========================================="
log_message "Pipeline run complete"
log_message "Log: ${LOG_FILE}"

# Keep only last 30 days of logs
find "${LOG_DIR}" -name "rl_pipeline_*.log" -mtime +30 -delete
log_message "Cleaned old logs (>30 days)"
