"""
Locust load test for the AI Governance Firewall proxy.
Simulates realistic enterprise traffic patterns with streaming, governance APIs, and error flows.
"""

from locust import HttpUser, task, between, tag


# ─── Test Prompt Fixtures ─────────────────────────────────

CLEAN_PROMPT = {
    "model": "gpt-4",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain the difference between REST and GraphQL APIs. Cover performance, flexibility, and common use cases."},
    ],
    "max_tokens": 500,
}

PII_PROMPT = {
    "model": "gpt-4",
    "messages": [
        {"role": "user", "content": "Draft a letter to our employee John Smith (SSN: FAKE-123-45-6789) regarding their performance review. They joined on 01/15/2020 and work in the engineering department."},
    ],
    "max_tokens": 500,
}

CODE_PROMPT = {
    "model": "gpt-4",
    "messages": [
        {"role": "user", "content": "Review this internal function: def calculate_revenue(txns): return sum(txn.amount * 0.029 for txn in txns)"},
    ],
    "max_tokens": 500,
}

APIKEY_PROMPT = {
    "model": "gpt-4",
    "messages": [
        {"role": "user", "content": "Use API key sk-FAKE1234567890abcdef1234567890abcdef1234567890ab to connect."},
    ],
    "max_tokens": 500,
}

STREAM_PROMPT = {
    "model": "gpt-4",
    "messages": [
        {"role": "user", "content": "Write a 500-word essay on AI governance."},
    ],
    "stream": True,
    "max_tokens": 1000,
}


class ProxyUser(HttpUser):
    """Simulates corporate employees using the AI governance proxy."""

    wait_time = between(1, 5)
    host = "http://localhost:8000"

    def on_start(self):
        self.client.headers.update({
            "Authorization": "Bearer dev-token-test",
            "Content-Type": "application/json",
            "X-LLM-Provider": "openai",
        })

    @task(35)
    @tag("clean")
    def clean_prompt(self):
        self.client.post("/v1/chat/completions", json=CLEAN_PROMPT, name="clean_prompt")

    @task(15)
    @tag("pii")
    def pii_prompt(self):
        self.client.post("/v1/chat/completions", json=PII_PROMPT, name="pii_prompt")

    @task(10)
    @tag("code")
    def code_prompt(self):
        self.client.post("/v1/chat/completions", json=CODE_PROMPT, name="code_prompt")

    @task(5)
    @tag("apikey")
    def apikey_prompt(self):
        with self.client.post("/v1/chat/completions", json=APIKEY_PROMPT, name="apikey_prompt", catch_response=True) as resp:
            if resp.status_code == 403:
                resp.success()

    @task(10)
    @tag("stream")
    def stream_request(self):
        """Simulate streaming requests (check for SSE response)."""
        with self.client.post("/v1/chat/completions", json=STREAM_PROMPT, name="stream_request", stream=True, catch_response=True) as resp:
            if resp.status_code == 200:
                resp.success()

    @task(10)
    @tag("inspect")
    def inspect_endpoint(self):
        """Test the inspect/demo endpoint."""
        self.client.post("/api/v1/inspect", json={
            "text": "What is the capital of France?",
            "department": "Engineering",
            "role": "engineer",
        }, name="inspect_endpoint")

    @task(5)
    @tag("governance")
    def stats_endpoint(self):
        """Test governance stats API."""
        self.client.get("/api/v1/stats", name="governance_stats")

    @task(5)
    @tag("governance")
    def analytics_trend(self):
        """Test analytics trend API."""
        self.client.get("/api/v1/analytics/trend?days=7", name="analytics_trend")

    @task(3)
    @tag("governance")
    def governance_risk_overview(self):
        """Test expanded governance risk overview."""
        self.client.get("/api/v1/governance/risk-overview?days=7", name="governance_risk_overview")

    @task(2)
    @tag("governance")
    def governance_top_users(self):
        """Test top users API."""
        self.client.get("/api/v1/governance/top-users?days=7&limit=5", name="governance_top_users")

    @task(1)
    @tag("health")
    def health_check(self):
        self.client.get("/health")
