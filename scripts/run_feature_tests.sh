#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_FILE="$ROOT_DIR/TEST_RESULTS.md"
CACHE_DIR="$ROOT_DIR/.cache"

export POETRY_VIRTUALENVS_PATH="$CACHE_DIR/pypoetry/virtualenvs"
export POETRY_CACHE_DIR="$CACHE_DIR/pypoetry"
export VIRTUALENV_OVERRIDE_APP_DATA="$CACHE_DIR/virtualenv"

mkdir -p "$POETRY_VIRTUALENVS_PATH" "$POETRY_CACHE_DIR" "$VIRTUALENV_OVERRIDE_APP_DATA"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

append_report() {
  printf "%b\n" "$1" >> "$REPORT_FILE"
}

run_check() {
  local name="$1"
  local meaning="$2"
  local command="$3"

  append_report "## ${name}"
  append_report "- **Meaning**: ${meaning}"
  append_report "- **Command**: \`${command}\`"

  local output
  output="$(cd "$ROOT_DIR" && bash -lc "$command" 2>&1)"
  local status=$?
  local max_chars=12000
  if [[ ${#output} -gt $max_chars ]]; then
    output="${output:0:$max_chars}
[... output truncated ...]"
  fi

  if [[ $status -eq 0 ]]; then
    append_report "- **Result**: PASS"
  else
    append_report "- **Result**: FAIL (exit code ${status})"
  fi

  append_report "- **Output**:"
  append_report '```text'
  append_report "${output:-<no output>}"
  append_report '```'
  append_report ""
}

run_skip() {
  local name="$1"
  local meaning="$2"
  local reason="$3"

  append_report "## ${name}"
  append_report "- **Meaning**: ${meaning}"
  append_report "- **Result**: SKIPPED"
  append_report "- **Reason**: ${reason}"
  append_report ""
}

printf "# AI Governance Test Results\n\n" > "$REPORT_FILE"
append_report "- Generated: $(timestamp)"
append_report "- Repo: \`$ROOT_DIR\`"
append_report ""
append_report "## Result Meaning"
append_report "- **PASS**: Feature works for the tested scenario."
append_report "- **FAIL**: Feature did not work or command errored."
append_report "- **SKIPPED**: Could not test due to missing tool/service."
append_report ""

if command -v poetry >/dev/null 2>&1; then
  run_check \
    "Python Core Integration Tests" \
    "Checks proxy auth, health, regex secrets detection, risk scoring, redaction, and policy evaluation." \
    "poetry run pytest tests/test_integration.py -v -k 'not PolicyAPI'"
else
  run_skip \
    "Python Core Integration Tests" \
    "Checks proxy auth, health, regex secrets detection, risk scoring, redaction, and policy evaluation." \
    "poetry is not installed on this machine."
fi

if command -v poetry >/dev/null 2>&1; then
  run_check \
    "Proxy Secrets Detection Smoke" \
    "Validates README detection coverage for API keys, PII, credentials, and clean prompts." \
    "poetry run python -c \"from detection.app.regex_detector import RegexDetector; d=RegexDetector(); assert any(s.category.value=='API_KEY' for s in d.detect('sk-abc123def456ghi789jklmnopqrstuv').spans); assert any(s.category.value=='PII' for s in d.detect('SSN 123-45-6789').spans); assert any(s.category.value=='CREDENTIALS' for s in d.detect('DATABASE_URL=postgresql://u:p@h:5432/db').spans); assert len(d.detect('Hello world').spans)==0; print('Regex detector smoke checks passed')\""
else
  run_skip \
    "Proxy Secrets Detection Smoke" \
    "Validates README detection coverage for API keys, PII, credentials, and clean prompts." \
    "poetry is not installed on this machine."
fi

if command -v poetry >/dev/null 2>&1; then
  run_check \
    "Proxy Endpoint Smoke (TestClient)" \
    "Verifies /health, /metrics, root endpoint, and auth enforcement on chat completions." \
    "poetry run python -c \"from fastapi.testclient import TestClient; from proxy.app.main import app; c=TestClient(app); assert c.get('/health').status_code==200; assert c.get('/').status_code==200; assert c.get('/metrics').status_code==200; assert c.post('/v1/chat/completions', json={'model':'gpt-4','messages':[{'role':'user','content':'hi'}]}).status_code==401; print('Proxy endpoint smoke checks passed')\""
else
  run_skip \
    "Proxy Endpoint Smoke (TestClient)" \
    "Verifies /health, /metrics, root endpoint, and auth enforcement on chat completions." \
    "poetry is not installed on this machine."
fi

if command -v poetry >/dev/null 2>&1 && (bash -lc "echo > /dev/tcp/127.0.0.1/5432" >/dev/null 2>&1); then
  run_check \
    "Policy API Database Tests" \
    "Validates /api/v1/policies CRUD endpoints that require PostgreSQL data access." \
    "poetry run pytest tests/test_integration.py -v -k PolicyAPI"
else
  run_skip \
    "Policy API Database Tests" \
    "Validates /api/v1/policies CRUD endpoints that require PostgreSQL data access." \
    "PostgreSQL is not reachable on localhost:5432 in this environment."
fi

if [[ -f "$ROOT_DIR/dashboard/package.json" ]]; then
  run_check \
    "Dashboard TypeScript Build" \
    "Checks dashboard routes/pages compile; catches broken UI feature code." \
    "cd dashboard && npm run build"
else
  run_skip \
    "Dashboard TypeScript Build" \
    "Checks dashboard routes/pages compile; catches broken UI feature code." \
    "dashboard/package.json was not found."
fi

if [[ -f "$ROOT_DIR/governance/package.json" ]]; then
  run_check \
    "Governance Backend Build" \
    "Checks auth and governance API code compiles successfully." \
    "cd governance && npm run build"
else
  run_skip \
    "Governance Backend Build" \
    "Checks auth and governance API code compiles successfully." \
    "governance/package.json was not found."
fi

if command -v poetry >/dev/null 2>&1; then
  run_check \
    "Load Test Syntax Check" \
    "Checks load-test file is syntactically valid before performance runs." \
    "poetry run python -m py_compile tests/load_test.py"
else
  run_skip \
    "Load Test Syntax Check" \
    "Checks load-test file is syntactically valid before performance runs." \
    "poetry is not installed on this machine."
fi

append_report "## Overall Summary"
append_report "- Open this file after each run to track current feature health."
append_report "- To rerun all checks: \`bash scripts/run_feature_tests.sh\`"

echo "Test report generated at: $REPORT_FILE"
