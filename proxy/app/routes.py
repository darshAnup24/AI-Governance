"""
Proxy routes — OpenAI-compatible LLM API proxy endpoint.
Intercepts, detects, enforces policy, and forwards to upstream.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, AsyncGenerator

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from proxy.app.adapters import ProviderAdapter
from proxy.app.audit import audit_emitter
from proxy.app.auth import get_current_user, rate_limiter
from proxy.app.config import Settings, get_settings
from proxy.app.models import (
    ActionType,
    AuditEvent,
    ChatCompletionRequest,
    ChatMessage,
    DetectedSpan,
    LLMProvider,
    PolicyDecision,
    ProblemDetail,
    UserContext,
)

log = structlog.get_logger()
router = APIRouter()


async def _call_detection(
    http_client: httpx.AsyncClient,
    prompt_text: str,
    user: UserContext,
    settings: Settings,
) -> dict[str, Any]:
    """Call the detection service. Returns detection result or fail-open default."""
    try:
        resp = await http_client.post(
            f"{settings.detection_service_url}/detect",
            json={
                "text": prompt_text,
                "user_id": user.user_id,
                "department": user.department,
                "role": user.role,
                "org_id": user.org_id,
            },
            timeout=settings.detection_timeout_ms / 1000,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.TimeoutException:
        log.warning("detection.timeout", timeout_ms=settings.detection_timeout_ms)
        return {"risk_score": 0, "action": "ALLOW", "detection_results": [], "detected_spans": []}
    except Exception as e:
        # Fail open: if detection service is down, allow the request but log it
        log.error("detection.call_failed", error=str(e))
        return {"risk_score": 0, "action": "ALLOW", "detection_results": [], "detected_spans": []}


def _redact_prompt(messages: list[ChatMessage], spans: list[dict[str, Any]], prompt_text: str) -> list[ChatMessage]:
    """Replace detected spans in messages with [REDACTED:CATEGORY] tokens."""
    if not spans:
        return messages

    # Build a map of offset → redaction for the concatenated prompt
    sorted_spans = sorted(spans, key=lambda s: s.get("start", 0), reverse=True)

    redacted_text = prompt_text
    for span in sorted_spans:
        start = span.get("start", 0)
        end = span.get("end", 0)
        category = span.get("category", "UNKNOWN")
        redacted_text = redacted_text[:start] + f"[REDACTED:{category}]" + redacted_text[end:]

    # Reconstruct messages from redacted text
    # Simple approach: split back by role markers
    redacted_messages = []
    for msg in messages:
        if msg.content and msg.content in prompt_text:
            # Find and replace the content portion
            idx = prompt_text.find(msg.content)
            if idx >= 0:
                # Find the same range in redacted_text (approximate — works for non-overlapping)
                new_content = msg.content
                for span in sorted_spans:
                    matched = span.get("matched_text", "")
                    cat = span.get("category", "UNKNOWN")
                    if matched and matched in new_content:
                        new_content = new_content.replace(matched, f"[REDACTED:{cat}]", 1)
                redacted_messages.append(ChatMessage(role=msg.role, content=new_content))
            else:
                redacted_messages.append(msg)
        else:
            redacted_messages.append(msg)

    return redacted_messages


async def _stream_upstream(
    http_client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    body: dict[str, Any],
) -> AsyncGenerator[bytes, None]:
    """Stream SSE chunks from upstream LLM."""
    async with http_client.stream("POST", url, json=body, headers=headers, timeout=60.0) as resp:
        async for chunk in resp.aiter_bytes():
            yield chunk


@router.post("/v1/chat/completions")
async def chat_completions(
    request: Request,
    body: ChatCompletionRequest,
    user: UserContext = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> Any:
    """
    OpenAI-compatible chat completions endpoint.
    Intercepts the request, runs detection, enforces policy, then forwards to upstream.
    """
    start_time = time.perf_counter()
    http_client: httpx.AsyncClient = request.app.state.http_client
    redis = getattr(request.app.state, "redis", None)

    # Determine provider from header or default to OpenAI
    provider_name = request.headers.get("X-LLM-Provider", "openai").lower()
    try:
        provider = LLMProvider(provider_name)
    except ValueError:
        provider = LLMProvider.OPENAI

    # Rate limiting
    estimated_tokens = sum(len((m.content or "").split()) * 1.3 for m in body.messages)
    await rate_limiter.check_rate_limit(request, user, int(estimated_tokens), settings)

    # Extract prompt text for detection
    prompt_text = ProviderAdapter.extract_prompt_text(body.messages)
    prompt_hash = hashlib.sha256(prompt_text.encode()).hexdigest()

    # Call detection service
    detection_result = await _call_detection(http_client, prompt_text, user, settings)
    action = ActionType(detection_result.get("action", "ALLOW"))
    risk_score = detection_result.get("risk_score", 0)

    log.info(
        "proxy.detection_result",
        user_id=user.user_id,
        risk_score=risk_score,
        action=action.value,
        provider=provider.value,
    )

    # ─── Policy Enforcement ───────────────────────────────

    if action == ActionType.BLOCK:
        # Emit audit event for block
        audit_event = AuditEvent(
            org_id=user.org_id,
            user_id=user.user_id,
            llm_provider=provider.value,
            prompt_hash=prompt_hash,
            detection_results=detection_result,
            risk_score=risk_score,
            action_taken=ActionType.BLOCK,
            request_duration_ms=(time.perf_counter() - start_time) * 1000,
        )
        await audit_emitter.emit(redis, audit_event)

        return JSONResponse(
            status_code=403,
            content=ProblemDetail(
                type="https://ai-governance.dev/errors/policy-violation",
                title="Request Blocked by Policy",
                status=403,
                detail=f"Your prompt was blocked due to detected sensitive content (risk score: {risk_score}). "
                       f"Contact your security team if you believe this is an error.",
            ).model_dump(),
        )

    # Handle REDACT: replace sensitive spans before forwarding
    messages_to_send = body.messages
    if action == ActionType.REDACT:
        detected_spans = detection_result.get("detected_spans", [])
        messages_to_send = _redact_prompt(body.messages, detected_spans, prompt_text)

    # Build upstream request
    upstream_body = {
        "model": body.model,
        "messages": [{"role": m.role, "content": m.content} for m in messages_to_send],
        "stream": body.stream,
    }
    if body.temperature is not None:
        upstream_body["temperature"] = body.temperature
    if body.max_tokens is not None:
        upstream_body["max_tokens"] = body.max_tokens
    if body.top_p is not None:
        upstream_body["top_p"] = body.top_p

    # Get upstream URL and headers
    upstream_url = ProviderAdapter.get_upstream_url(provider, settings)
    api_key = request.headers.get("X-API-Key", request.headers.get("Authorization", "").replace("Bearer ", ""))
    upstream_headers = ProviderAdapter.get_headers(provider, api_key)

    # ─── Forward to Upstream ──────────────────────────────

    try:
        if body.stream:
            # Streaming response
            async def stream_with_audit() -> AsyncGenerator[bytes, None]:
                try:
                    async for chunk in _stream_upstream(http_client, upstream_url, upstream_headers, upstream_body):
                        yield chunk
                finally:
                    # Emit audit after streaming complete
                    audit_event = AuditEvent(
                        org_id=user.org_id,
                        user_id=user.user_id,
                        llm_provider=provider.value,
                        prompt_hash=prompt_hash,
                        detection_results=detection_result,
                        risk_score=risk_score,
                        action_taken=action,
                        request_duration_ms=(time.perf_counter() - start_time) * 1000,
                    )
                    await audit_emitter.emit(redis, audit_event)

            return StreamingResponse(
                stream_with_audit(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Risk-Score": str(risk_score),
                    "X-Action": action.value,
                },
            )
        else:
            # Non-streaming response
            resp = await http_client.post(
                upstream_url,
                json=upstream_body,
                headers=upstream_headers,
                timeout=30.0,
            )

            duration_ms = (time.perf_counter() - start_time) * 1000

            # Emit audit event
            audit_event = AuditEvent(
                org_id=user.org_id,
                user_id=user.user_id,
                llm_provider=provider.value,
                prompt_hash=prompt_hash,
                detection_results=detection_result,
                risk_score=risk_score,
                action_taken=action,
                request_duration_ms=duration_ms,
                upstream_status_code=resp.status_code,
            )
            await audit_emitter.emit(redis, audit_event)

            # Return upstream response with governance headers
            response = JSONResponse(
                status_code=resp.status_code,
                content=resp.json(),
            )
            response.headers["X-Risk-Score"] = str(risk_score)
            response.headers["X-Action"] = action.value
            return response

    except httpx.TimeoutException:
        log.error("upstream.timeout", provider=provider.value)
        return JSONResponse(
            status_code=504,
            content=ProblemDetail(
                type="https://ai-governance.dev/errors/upstream-timeout",
                title="Upstream LLM Timeout",
                status=504,
                detail="The upstream LLM provider did not respond within 30 seconds.",
            ).model_dump(),
        )
    except httpx.HTTPStatusError as e:
        log.error("upstream.error", status=e.response.status_code, provider=provider.value)
        return JSONResponse(
            status_code=e.response.status_code,
            content=e.response.json() if e.response.headers.get("content-type", "").startswith("application/json") else {"error": str(e)},
        )
    except Exception as e:
        log.error("upstream.unexpected_error", error=str(e))
        return JSONResponse(
            status_code=502,
            content=ProblemDetail(
                type="https://ai-governance.dev/errors/upstream-error",
                title="Upstream Error",
                status=502,
                detail=str(e),
            ).model_dump(),
        )


# ─── Analytics / Admin Endpoints ─────────────────────────

@router.get("/api/v1/analytics/trend")
async def analytics_trend(
    days: int = 30,
    user: UserContext = Depends(get_current_user),
) -> dict[str, Any]:
    """Return risk trend data for the dashboard. Stub with sample data for now."""
    from datetime import datetime, timedelta

    data = []
    for i in range(days):
        date = (datetime.utcnow() - timedelta(days=days - i - 1)).strftime("%Y-%m-%d")
        data.append({
            "date": date,
            "blocked": max(0, int(15 + (i % 7) * 3 - 5)),
            "redacted": max(0, int(45 + (i % 5) * 8 - 10)),
            "warned": max(0, int(80 + (i % 3) * 12 - 15)),
        })
    return {"data": data, "days": days}


@router.get("/api/v1/audit-events")
async def list_audit_events(
    page: int = 1,
    per_page: int = 50,
    action: str | None = None,
    user: UserContext = Depends(get_current_user),
) -> dict[str, Any]:
    """List audit events. Stub with sample data for Phase 1-2."""
    return {
        "data": [],
        "total": 0,
        "page": page,
        "per_page": per_page,
    }
