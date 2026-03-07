"""
Integration tests for the AI Governance Firewall.
Tests the proxy, detection, and policy engine end-to-end.
"""

import pytest
from fastapi.testclient import TestClient

from proxy.app.main import app
from detection.app.regex_detector import RegexDetector
from detection.app.ner_detector import SpacyNERDetector
from detection.app.risk_scorer import RiskScoreAggregator, redact_prompt
from proxy.app.policy_engine import PolicyEngine, RequestContext


# ─── Fixtures ─────────────────────────────────────────────

@pytest.fixture
def client():
    """Create a test client for the proxy app."""
    return TestClient(app)


@pytest.fixture
def auth_headers():
    """Dev mode auth headers."""
    return {
        "Authorization": "Bearer dev-token-test",
        "Content-Type": "application/json",
    }


@pytest.fixture
def regex_detector():
    return RegexDetector()


@pytest.fixture
def ner_detector():
    return SpacyNERDetector()


@pytest.fixture
def risk_aggregator():
    return RiskScoreAggregator()


@pytest.fixture
def policy_engine():
    return PolicyEngine()


# ─── Health & Basic Tests ─────────────────────────────────

class TestHealthEndpoints:
    def test_proxy_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

    def test_proxy_root(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "AI Governance Firewall" in resp.json()["service"]

    def test_metrics(self, client):
        resp = client.get("/metrics")
        assert resp.status_code == 200
        assert "proxy_requests_total" in resp.text


# ─── Auth Tests ───────────────────────────────────────────

class TestAuth:
    def test_missing_auth_returns_401(self, client):
        resp = client.post("/v1/chat/completions", json={
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}],
        })
        assert resp.status_code == 401

    def test_dev_token_accepted(self, client, auth_headers):
        resp = client.post("/v1/chat/completions", json={
            "model": "gpt-4",
            "messages": [{"role": "user", "content": "hello"}],
        }, headers=auth_headers)
        # Should not be 401 — might be 502 (no upstream) but auth passes
        assert resp.status_code != 401


# ─── Regex Detector Tests ────────────────────────────────

class TestRegexDetector:
    def test_openai_key_detected(self, regex_detector):
        text = "My key is sk-abc123def456ghi789jklmnopqrstuv"
        result = regex_detector.detect(text)
        assert len(result.spans) > 0
        assert any(s.category.value == "API_KEY" for s in result.spans)

    def test_aws_key_detected(self, regex_detector):
        text = "Access key: AKIAIOSFODNN7EXAMPLE"
        result = regex_detector.detect(text)
        assert any(s.category.value == "API_KEY" for s in result.spans)

    def test_github_pat_detected(self, regex_detector):
        text = "Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"
        result = regex_detector.detect(text)
        assert any(s.category.value == "API_KEY" for s in result.spans)

    def test_ssn_detected(self, regex_detector):
        text = "SSN: 123-45-6789"
        result = regex_detector.detect(text)
        assert any(s.category.value == "PII" for s in result.spans)

    def test_credit_card_luhn_valid(self, regex_detector):
        text = "Card: 4111-1111-1111-1111"
        result = regex_detector.detect(text)
        assert any(s.category.value == "PII" for s in result.spans)

    def test_connection_string_detected(self, regex_detector):
        text = "DATABASE_URL=postgresql://user:pass@host:5432/db"
        result = regex_detector.detect(text)
        assert any(s.category.value == "CREDENTIALS" for s in result.spans)

    def test_private_key_detected(self, regex_detector):
        text = "-----BEGIN RSA PRIVATE KEY-----"
        result = regex_detector.detect(text)
        assert any(s.category.value == "CREDENTIALS" for s in result.spans)

    def test_clean_text_no_detections(self, regex_detector):
        text = "What is the capital of France? Please explain in detail."
        result = regex_detector.detect(text)
        assert len(result.spans) == 0

    def test_email_in_code_context_low_confidence(self, regex_detector):
        text = "import smtplib\nfrom_addr = 'test@example.com'"
        result = regex_detector.detect(text)
        email_spans = [s for s in result.spans if s.matched_text and "@" in s.matched_text]
        if email_spans:
            assert all(s.confidence < 0.5 for s in email_spans)


# ─── Risk Scorer Tests ───────────────────────────────────

class TestRiskScorer:
    def test_empty_results_score_zero(self, risk_aggregator):
        score = risk_aggregator.aggregate([])
        assert score.score == 0
        assert score.recommended_action.value == "ALLOW"

    def test_api_key_scores_high(self, regex_detector, risk_aggregator):
        result = regex_detector.detect("sk-abc123def456ghi789jklmnopqrstuv")
        score = risk_aggregator.aggregate([result])
        assert score.score >= 50

    def test_admin_role_reduces_score(self, regex_detector, risk_aggregator):
        text = "Some PII: 123-45-6789"
        result = regex_detector.detect(text)
        normal_score = risk_aggregator.aggregate([result], user_role="engineer")
        admin_score = risk_aggregator.aggregate([result], user_role="admin")
        assert admin_score.score <= normal_score.score


# ─── Redaction Tests ─────────────────────────────────────

class TestRedaction:
    def test_redact_replaces_spans(self):
        from proxy.app.models import DetectedSpan, DetectionCategory
        prompt = "My SSN is 123-45-6789 and my key is sk-abcdef"
        spans = [
            DetectedSpan(start=10, end=21, category=DetectionCategory.PII, confidence=0.9, matched_text="123-45-6789"),
            DetectedSpan(start=36, end=46, category=DetectionCategory.API_KEY, confidence=0.95, matched_text="sk-abcdef"),
        ]
        result = redact_prompt(prompt, spans)
        assert "[REDACTED:PII]" in result
        assert "[REDACTED:API_KEY]" in result
        assert "123-45-6789" not in result


# ─── Policy Engine Tests ─────────────────────────────────

class TestPolicyEngine:
    def test_high_risk_api_key_blocked(self, policy_engine):
        ctx = RequestContext(risk_score=95, detection_categories=["API_KEY"])
        decision = policy_engine.evaluate(ctx)
        assert decision.action.value == "BLOCK"

    def test_medium_risk_warned(self, policy_engine):
        ctx = RequestContext(risk_score=65, detection_categories=["CREDENTIALS"])
        decision = policy_engine.evaluate(ctx)
        assert decision.action.value == "WARN"

    def test_low_risk_allowed(self, policy_engine):
        ctx = RequestContext(risk_score=10, detection_categories=[])
        decision = policy_engine.evaluate(ctx)
        assert decision.action.value == "ALLOW"


# ─── Policy API Tests ────────────────────────────────────

class TestPolicyAPI:
    def test_list_policies(self, client, auth_headers):
        resp = client.get("/api/v1/policies", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_policy(self, client, auth_headers):
        resp = client.post("/api/v1/policies", headers=auth_headers, json={
            "name": "Test Policy",
            "conditions": {"operator": "AND", "conditions": [
                {"field": "risk_score", "op": "gte", "value": 50}
            ]},
            "action": "WARN",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Test Policy"

    def test_test_policy(self, client, auth_headers):
        resp = client.post("/api/v1/policies/test", headers=auth_headers, json={
            "risk_score": 95,
            "detection_categories": ["API_KEY"],
        })
        assert resp.status_code == 200
        assert resp.json()["action"] == "BLOCK"
