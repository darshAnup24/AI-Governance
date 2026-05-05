# AI Governance Test Results

- Generated: 2026-05-01 20:12:50 IST
- Repo: `/home/madhav/Documents/codehemangstyle/AI-Governance`

## Result Meaning
- **PASS**: Feature works for the tested scenario.
- **FAIL**: Feature did not work or command errored.
- **SKIPPED**: Could not test due to missing tool/service.

## Python Core Integration Tests
- **Meaning**: Checks proxy auth, health, regex secrets detection, risk scoring, redaction, and policy evaluation.
- **Command**: `poetry run pytest tests/test_integration.py -v -k 'not PolicyAPI'`
- **Result**: PASS
- **Output**:
```text
============================= test session starts ==============================
platform linux -- Python 3.11.15, pytest-8.4.2, pluggy-1.6.0 -- /home/madhav/Documents/codehemangstyle/AI-Governance/.cache/pypoetry/virtualenvs/ai-governance-firewall-RYhuNIXZ-py3.11/bin/python
cachedir: .pytest_cache
rootdir: /home/madhav/Documents/codehemangstyle/AI-Governance
configfile: pyproject.toml
plugins: anyio-4.13.0, asyncio-0.25.3, cov-6.3.0, locust-2.43.4, respx-0.23.1
asyncio: mode=Mode.AUTO, asyncio_default_fixture_loop_scope=None
collecting ... collected 24 items / 3 deselected / 21 selected

tests/test_integration.py::TestHealthEndpoints::test_proxy_health PASSED [  4%]
tests/test_integration.py::TestHealthEndpoints::test_proxy_root PASSED   [  9%]
tests/test_integration.py::TestHealthEndpoints::test_metrics PASSED      [ 14%]
tests/test_integration.py::TestAuth::test_missing_auth_returns_401 PASSED [ 19%]
tests/test_integration.py::TestAuth::test_dev_token_accepted PASSED      [ 23%]
tests/test_integration.py::TestRegexDetector::test_openai_key_detected PASSED [ 28%]
tests/test_integration.py::TestRegexDetector::test_aws_key_detected PASSED [ 33%]
tests/test_integration.py::TestRegexDetector::test_github_pat_detected PASSED [ 38%]
tests/test_integration.py::TestRegexDetector::test_ssn_detected PASSED   [ 42%]
tests/test_integration.py::TestRegexDetector::test_credit_card_luhn_valid PASSED [ 47%]
tests/test_integration.py::TestRegexDetector::test_connection_string_detected PASSED [ 52%]
tests/test_integration.py::TestRegexDetector::test_private_key_detected PASSED [ 57%]
tests/test_integration.py::TestRegexDetector::test_clean_text_no_detections PASSED [ 61%]
tests/test_integration.py::TestRegexDetector::test_email_in_code_context_low_confidence PASSED [ 66%]
tests/test_integration.py::TestRiskScorer::test_empty_results_score_zero PASSED [ 71%]
tests/test_integration.py::TestRiskScorer::test_api_key_scores_high PASSED [ 76%]
tests/test_integration.py::TestRiskScorer::test_admin_role_reduces_score PASSED [ 80%]
tests/test_integration.py::TestRedaction::test_redact_replaces_spans PASSED [ 85%]
tests/test_integration.py::TestPolicyEngine::test_high_risk_api_key_blocked PASSED [ 90%]
tests/test_integration.py::TestPolicyEngine::test_medium_risk_warned PASSED [ 95%]
tests/test_integration.py::TestPolicyEngine::test_low_risk_allowed PASSED [100%]

=============================== warnings summary ===============================
proxy/app/models.py:91
  /home/madhav/Documents/codehemangstyle/AI-Governance/proxy/app/models.py:91: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.13/migration/
    class ChatCompletionRequest(BaseModel):

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
================= 21 passed, 3 deselected, 1 warning in 0.89s ==================
```

## Proxy Secrets Detection Smoke
- **Meaning**: Validates README detection coverage for API keys, PII, credentials, and clean prompts.
- **Command**: `poetry run python -c "from detection.app.regex_detector import RegexDetector; d=RegexDetector(); assert any(s.category.value=='API_KEY' for s in d.detect('sk-abc123def456ghi789jklmnopqrstuv').spans); assert any(s.category.value=='PII' for s in d.detect('SSN 123-45-6789').spans); assert any(s.category.value=='CREDENTIALS' for s in d.detect('DATABASE_URL=postgresql://u:p@h:5432/db').spans); assert len(d.detect('Hello world').spans)==0; print('Regex detector smoke checks passed')"`
- **Result**: PASS
- **Output**:
```text
Regex detector smoke checks passed
```

## Proxy Endpoint Smoke (TestClient)
- **Meaning**: Verifies /health, /metrics, root endpoint, and auth enforcement on chat completions.
- **Command**: `poetry run python -c "from fastapi.testclient import TestClient; from proxy.app.main import app; c=TestClient(app); assert c.get('/health').status_code==200; assert c.get('/').status_code==200; assert c.get('/metrics').status_code==200; assert c.post('/v1/chat/completions', json={'model':'gpt-4','messages':[{'role':'user','content':'hi'}]}).status_code==401; print('Proxy endpoint smoke checks passed')"`
- **Result**: PASS
- **Output**:
```text
2026-05-01 20:12:54 [info     ] request.completed              duration_ms=0.31 method=GET path=/health request_id=a8b6c3ca-dfa7-4e3a-a0c9-3d140204da9a status=200
2026-05-01 20:12:54 [info     ] request.completed              duration_ms=0.29 method=GET path=/ request_id=89e5e2a9-e360-4c9e-9a6e-df8ffddcee6d status=200
2026-05-01 20:12:54 [info     ] request.completed              duration_ms=0.63 method=GET path=/metrics request_id=08b16810-d291-494c-86e2-e761c54d439b status=200
2026-05-01 20:12:54 [info     ] request.completed              duration_ms=1.14 method=POST path=/v1/chat/completions request_id=8fbafcf7-720c-447f-b4e8-5109c5f131f0 status=401
Proxy endpoint smoke checks passed
```

## Policy API Database Tests
- **Meaning**: Validates /api/v1/policies CRUD endpoints that require PostgreSQL data access.
- **Command**: `poetry run pytest tests/test_integration.py -v -k PolicyAPI`
- **Result**: PASS
- **Output**:
```text
============================= test session starts ==============================
platform linux -- Python 3.11.15, pytest-8.4.2, pluggy-1.6.0 -- /home/madhav/Documents/codehemangstyle/AI-Governance/.cache/pypoetry/virtualenvs/ai-governance-firewall-RYhuNIXZ-py3.11/bin/python
cachedir: .pytest_cache
rootdir: /home/madhav/Documents/codehemangstyle/AI-Governance
configfile: pyproject.toml
plugins: anyio-4.13.0, asyncio-0.25.3, cov-6.3.0, locust-2.43.4, respx-0.23.1
asyncio: mode=Mode.AUTO, asyncio_default_fixture_loop_scope=None
collecting ... collected 24 items / 21 deselected / 3 selected

tests/test_integration.py::TestPolicyAPI::test_list_policies PASSED      [ 33%]
tests/test_integration.py::TestPolicyAPI::test_create_policy PASSED      [ 66%]
tests/test_integration.py::TestPolicyAPI::test_test_policy PASSED        [100%]

=============================== warnings summary ===============================
proxy/app/models.py:91
  /home/madhav/Documents/codehemangstyle/AI-Governance/proxy/app/models.py:91: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.13/migration/
    class ChatCompletionRequest(BaseModel):

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
================= 3 passed, 21 deselected, 1 warning in 0.72s ==================
```

## Dashboard TypeScript Build
- **Meaning**: Checks dashboard routes/pages compile; catches broken UI feature code.
- **Command**: `cd dashboard && npm run build`
- **Result**: PASS
- **Output**:
```text

> ai-governance-dashboard@0.1.0 build
> tsc -b && vite build

vite v6.4.2 building for production...
transforming...
✓ 2325 modules transformed.
rendering chunks...
computing gzip size...
dist/registerSW.js                0.13 kB
dist/manifest.webmanifest         1.01 kB
dist/index.html                   2.50 kB │ gzip:   1.11 kB
dist/assets/index-Obgv7i2d.css   45.03 kB │ gzip:   7.34 kB
dist/assets/index-wIFY5SlM.js   871.49 kB │ gzip: 239.39 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 5.84s

PWA v1.2.0
mode      generateSW
precache  5 entries (897.62 KiB)
files generated
  dist/sw.js
  dist/workbox-cf30f3da.js
```

## Governance Backend Build
- **Meaning**: Checks auth and governance API code compiles successfully.
- **Command**: `cd governance && npm run build`
- **Result**: PASS
- **Output**:
```text

> shieldai-governance@0.1.0 build
> tsc
```

## Load Test Syntax Check
- **Meaning**: Checks load-test file is syntactically valid before performance runs.
- **Command**: `poetry run python -m py_compile tests/load_test.py`
- **Result**: PASS
- **Output**:
```text
<no output>
```

## Overall Summary
- Open this file after each run to track current feature health.
- To rerun all checks: `bash scripts/run_feature_tests.sh`
