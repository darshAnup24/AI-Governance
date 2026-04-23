"""
Locust load test for the AI Governance Firewall proxy.
Simulates realistic enterprise traffic patterns.
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
        {"role": "user", "content": "Review this internal function and suggest improvements:\n\ndef calculate_revenue(transactions, region='US'):\n    # CONFIDENTIAL: Internal billing logic v2.3\n    base_rate = 0.029\n    enterprise_discount = 0.15\n    for tx in transactions:\n        if tx.amount > 10000:\n            tx.fee = tx.amount * (base_rate - enterprise_discount)\n    return sum(tx.fee for tx in transactions)"},
    ],
    "max_tokens": 500,
}

APIKEY_PROMPT = {
    "model": "gpt-4",
    "messages": [
        {"role": "user", "content": "I'm getting an error with my API call. Here's my code:\nimport openai\nopenai.api_key = 'sk-FAKE1234567890abcdef1234567890abcdef1234567890ab'\nresponse = openai.chat.completions.create(model='gpt-4', messages=[{'role':'user','content':'hello'}])"},
    ],
    "max_tokens": 500,
}


class ProxyUser(HttpUser):
    """Simulates corporate employees using the AI governance proxy."""

    wait_time = between(1, 5)
    host = "http://localhost:8000"

    def on_start(self):
        """Set up auth headers for the user."""
        self.client.headers.update({
            "Authorization": "Bearer dev-token-test",
            "Content-Type": "application/json",
            "X-LLM-Provider": "openai",
        })

    @task(60)
    @tag("clean")
    def clean_prompt(self):
        """60% of traffic: clean, safe prompts (ALLOW)."""
        self.client.post("/v1/chat/completions", json=CLEAN_PROMPT, name="clean_prompt")

    @task(25)
    @tag("pii")
    def pii_prompt(self):
        """25% of traffic: prompts with PII (WARN)."""
        self.client.post("/v1/chat/completions", json=PII_PROMPT, name="pii_prompt")

    @task(10)
    @tag("code")
    def code_prompt(self):
        """10% of traffic: prompts with source code (REDACT)."""
        self.client.post("/v1/chat/completions", json=CODE_PROMPT, name="code_prompt")

    @task(5)
    @tag("apikey")
    def apikey_prompt(self):
        """5% of traffic: prompts with API keys (BLOCK)."""
        with self.client.post("/v1/chat/completions", json=APIKEY_PROMPT, name="apikey_prompt", catch_response=True) as resp:
            if resp.status_code == 403:
                resp.success()  # 403 is expected for blocked prompts

    @task(1)
    @tag("health")
    def health_check(self):
        """Occasional health checks."""
        self.client.get("/health")
