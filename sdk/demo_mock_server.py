#!/usr/bin/env python3
"""Mock Airlock proxy server for SDK demo.
Listens on :8765 and mimics the production proxy's error response format.
"""

from __future__ import annotations

import json
import re
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

HOST = "localhost"
PORT = 8765


class MockAirlockHandler(BaseHTTPRequestHandler):
    detection_rules = [
        (re.compile(r"AKIA[0-9A-Z]{16}"), "CREDENTIAL", "AWS_ACCESS_KEY", "SECRET_DETECTED", 0.97),
        (re.compile(r"sk-[a-zA-Z0-9]{32,}"), "CREDENTIAL", "OPENAI_API_KEY", "SECRET_DETECTED", 0.95),
        (re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"), "PII", "EMAIL", "PII_DETECTED", 0.88),
        (re.compile(r"ignore all previous instructions|you are a free|jailbreak", re.I), "PROMPT_INJECTION", "JAILBREAK", "JAILBREAK_DETECTED", 0.93),
    ]

    def _build_rejection(self, code: str, category: str, tier: str, confidence: float,
                         span_text: str, rule_name: str, suggestion: str) -> dict:
        return {
            "type": f"https://airlock.dev/errors/{code}",
            "title": "Sensitive Content Detected",
            "status": 403,
            "detail": f"A {category.lower()} was detected in your prompt.",
            "instance": "/v1/chat/completions",
            "trace_id": f"req_{uuid.uuid4().hex[:12]}",
            "airlock": {
                "code": code,
                "category": category,
                "tier": tier,
                "confidence": confidence,
                "span": {
                    "start": 0,
                    "end": len(span_text),
                    "type": category,
                    "matched_text": span_text,
                    "context": span_text,
                    "checksum_valid": False,
                },
                "policy": {
                    "rule_id": f"rule_{uuid.uuid4().hex[:8]}",
                    "rule_name": rule_name,
                    "action": "BLOCK",
                    "priority": 1,
                    "matched_condition": f"category == '{category}' AND confidence > 0.9",
                },
                "remediation": {
                    "suggestion": suggestion,
                    "docs_url": f"https://airlock.dev/docs/remediation/{category.lower()}",
                    "similar_safe_examples": [
                        f"Use a placeholder instead of the real {category.lower()}",
                    ],
                },
                "detection_breakdown": {
                    "tier_1_regex": {"score": confidence, "action": "BLOCK", "matched": True, "latency_ms": 0.5},
                    "tier_2_ner": {"score": 0.0, "action": "ALLOW", "matched": False, "latency_ms": 14.0},
                    "tier_3_ml": {"score": 0.0, "action": "ALLOW", "matched": False, "latency_ms": 22.0},
                },
            },
        }

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        content = ""
        for msg in body.get("messages", []):
            content += msg.get("content", "")

        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or len(auth) < 8:
            self._send_json(401, {"detail": "Missing or invalid Bearer token"})
            return

        for regex, category, span_type, code, conf in self.detection_rules:
            match = regex.search(content)
            if match:
                err = self._build_rejection(
                    code=code, category=category, tier="tier_1_regex",
                    confidence=conf, span_text=match.group(),
                    rule_name=f"Block {category}",
                    suggestion=f"Remove {category.lower()} before sending.",
                )
                self._send_json(403, err)
                return

        self._send_json(200, {
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "Hello! How can I help?"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 6, "total_tokens": 16},
        })

    def _send_json(self, status: int, data: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[mock] {args[0]}" if args else fmt)


def main():
    server = HTTPServer((HOST, PORT), MockAirlockHandler)
    print(f"Mock Airlock proxy listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
