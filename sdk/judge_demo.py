#!/usr/bin/env python3
"""
Judge demo — SDK → Airlock Proxy → Detection + Policy → Groq → Response.
Requirements: docker compose up, GROQ_API_KEY set in .env
"""

from airlock import AirlockClient, AirlockRejectionError

PROXY_URL = "http://localhost:8000"
GROQ_HEADERS = {"X-LLM-Provider": "ollama"}


def main():
    # ── 1. ALLOWED: clean prompt goes through proxy → Groq ──────────
    print("=" * 60)
    print("SCENARIO 1: ALLOWED — clean prompt routed to Groq")
    print("=" * 60)
    with AirlockClient(
        api_key="any-token",
        base_url=PROXY_URL,
        verbose_errors=True,
        extra_headers=GROQ_HEADERS,
    ) as client:
        try:
            resp = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": "What is the capital of Japan? Answer in one word."}],
            )
            reply = resp["choices"][0]["message"]["content"]
            print(f"  Assistant: {reply}\n")
        except AirlockRejectionError as e:
            print(f"  BLOCKED: {e}\n")

    # ── 2. BLOCKED: PII detected → policy blocks + 403 ──────────────
    print("=" * 60)
    print("SCENARIO 2: BLOCKED — PII detected, policy blocks request")
    print("=" * 60)
    with AirlockClient(
        api_key="any-token",
        base_url=PROXY_URL,
        verbose_errors=True,
        extra_headers=GROQ_HEADERS,
    ) as client:
        try:
            resp = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": "My email is john.doe@example.com and my SSN is 123-45-6789"}],
            )
            print("  (unexpectedly allowed)\n")
        except AirlockRejectionError as e:
            print(e.pretty_print())
            print()
            print("  SDK gives typed access to every field:")
            print(f"    code       = {e.code}")
            print(f"    category   = {e.category}")
            print(f"    confidence = {e.confidence}")
            if e.span:
                print(f"    matched    = {e.span.matched_text}")
            if e.remediation:
                print(f"    fix        = {e.remediation.suggestion}")
            if e.policy:
                print(f"    rule       = {e.policy.rule_name} ({e.policy.action})")
            print()

    # ── 3. SUMMARY ─────────────────────────────────────────────────
    print("=" * 60)
    print("JUDGE SUMMARY")
    print("=" * 60)
    print("  SDK → Airlock Proxy → Detection + Policy → Groq")
    print()
    print("  ALLOWED:  request passes all checks → Groq response returned")
    print("  BLOCKED:  403 + structured AirlockErrorDetail → SDK parses to typed error")
    print()
    print("  Key SDK features shown:")
    print("    - Drop-in OpenAI-compatible client.chat.completions.create()")
    print("    - AirlockRejectionError with .code, .category, .span, .remediation")
    print("    - .pretty_print() for human-readable diagnostics")
    print("    - verbose_errors=True for full detection breakdown")


if __name__ == "__main__":
    main()
