"""
Proxy routes — OpenAI-compatible LLM API proxy endpoint.
Intercepts, detects, enforces policy, and forwards to upstream.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import time
import uuid
from typing import Any, AsyncGenerator

import httpx
from jose import jwt as pyjwt
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse

from sqlalchemy import select, func, desc, text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from pydantic import BaseModel

from proxy.app.adapters import ProviderAdapter
from proxy.app.audit import audit_emitter
from proxy.app.auth import get_current_user, rate_limiter
from proxy.app.config import Settings, get_settings
from proxy.app.database import get_db, async_session
from proxy.app.db_models import AuditEventRecord, ShadowAIAlert
from proxy.app.events import EventBus
from proxy.app.events.schema import EventStream, build_event_envelope
from proxy.app.models import (
    ActionType,
    AuditEvent,
    ChatCompletionRequest,
    ChatMessage,
    DetectedSpan,
    LLMProvider,
    PolicyDecision,
    ProblemDetail,
    AirlockErrorDetail,
    UserContext,
)
from proxy.app.live_stream import build_event_payload, heartbeat_payload
from proxy.app.runtime_modes import RuntimeSecurityMode, parse_runtime_mode, resolve_degraded_action
# Sprint 1: Semantic cache
from proxy.app.semantic_cache import get_cached_detection, set_cached_detection
# Sprint 3: Stateful seamless redaction
from proxy.app.stateful_redactor import StatefulRedactor
# Governance policy integration
from proxy.app.governance_client import GovernanceClient
from proxy.app.policy_engine import policy_engine, RequestContext
from proxy.app.stream_inspector import StreamInspector, StreamRedactor
from proxy.app.tracing import get_tracer, span, add_span_event, record_exception

log = structlog.get_logger()

# ─── Audit task tracker (fire-and-forget with graceful shutdown) ──────────
# FIXED (BUG-004/BUG-023): Audit writes must be fire-and-forget, not awaited
# in the hot request path. We track tasks so graceful shutdown can flush them.
_audit_tasks: set[asyncio.Task] = set()
_event_bus = EventBus()
_runtime_state: dict[str, Any] = {
    "degraded_events": 0,
    "last_degraded_reason": "",
    "last_degraded_at": None,
}


def _fire_audit_write(redis: Any, event: AuditEvent, user: UserContext, db: Any = None) -> None:
    """Schedule audit write as a fire-and-forget task.
    NEVER blocks the request handler.
    """
    async def _write() -> None:
        try:
            # FIXED (BUG-004/BUG-023/CONCURRENCY): Create a dedicated session for background database
            # operations to avoid sharing/reusing the request-scoped session after it gets closed.
            async with async_session() as session:
                await write_audit_event(redis, event, user, session)
        except Exception as e:
            log.error("audit_fire.failed", error=str(e))

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            task = loop.create_task(_write(), name=f"audit:{event.event_id[:8]}")
            _audit_tasks.add(task)
            task.add_done_callback(_audit_tasks.discard)
    except Exception as e:
        log.error("audit_fire.schedule_failed", error=str(e))


def _fire_platform_event(redis: Any, *, stream: EventStream, event_type: str, user: UserContext, trace_id: str, payload: dict[str, Any]) -> None:
    async def _publish() -> None:
        try:
            settings = get_settings()
            if redis is None or not settings.use_async_audit_pipeline:
                return
            envelope = build_event_envelope(
                stream=stream,
                event_type=event_type,
                org_id=user.org_id,
                workspace_id=user.workspace_id,
                trace_id=trace_id,
                payload=payload,
            )
            await _event_bus.publish(redis=redis, event=envelope)
        except Exception as exc:
            log.warning("platform_event.publish_failed", stream=stream.value, event_type=event_type, error=str(exc))

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            task = loop.create_task(_publish(), name=f"event:{stream.value}:{event_type}")
            _audit_tasks.add(task)
            task.add_done_callback(_audit_tasks.discard)
    except Exception as exc:
        log.error("platform_event.schedule_failed", stream=stream.value, event_type=event_type, error=str(exc))


async def write_audit_event(
    redis: Any,
    event: AuditEvent,
    user: UserContext,
    db: AsyncSession | None = None,
) -> None:
    """Emit audit event via Redis Streams (async, non-blocking).
    Falls back to direct DB write when Redis is unavailable."""
    settings = get_settings()
    if settings.use_async_audit_pipeline and redis:
        await audit_emitter.emit(redis, event)
    elif db:
        # Fallback: direct DB write when Redis is unavailable
        await _write_audit_event_to_db(db, event, user)


async def _write_audit_event_to_db(
    db: AsyncSession,
    event: AuditEvent,
    user: UserContext,
) -> None:
    """Write audit event directly to Postgres (fallback when Redis is down)."""
    try:
        def to_uuid(s: str | None) -> uuid.UUID:
            if not s:
                return uuid.UUID("00000000-0000-0000-0000-000000000000")
            try:
                return uuid.UUID(s)
            except (ValueError, AttributeError):
                return uuid.UUID("00000000-0000-0000-0000-000000000000")

        record = AuditEventRecord(
            event_id=to_uuid(event.event_id),
            timestamp=datetime.utcnow(),
            org_id=to_uuid(user.org_id),
            user_id=to_uuid(user.user_id),
            session_id=event.session_id or "",
            tool_name=event.tool_name or "",
            llm_provider=event.llm_provider or "",
            prompt_hash=event.prompt_hash or "",
            detection_results=event.detection_results or {},
            risk_score=event.risk_score or 0,
            action_taken=event.action_taken.value if event.action_taken else "ALLOW",
            policy_rule_id=to_uuid(event.policy_rule_id) if event.policy_rule_id else None,
            redacted_prompt=event.redacted_prompt,
            request_duration_ms=event.request_duration_ms or 0,
            upstream_status_code=event.upstream_status_code,
        )
        db.add(record)
        await db.commit()
        log.info("audit_event.written_to_db", event_id=str(record.event_id), action=record.action_taken)
    except Exception as e:
        log.error("audit_event.write_failed", error=str(e))
        await db.rollback()
router = APIRouter()

# ─── API Gateway: Route /api/governance/* to governance service ────────────
GOVERNANCE_API_URL = "http://governance:4000"
DEMO_API_URL = "http://demo-api:4001"

GOV_JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("DEV_JWT_SECRET", "airlock-dev-secret-change-me")
DEMO_JWT_SECRET = os.getenv("DEMO_JWT_SECRET", "demo-secret-change-in-production")

def _check_scope(authorization: str | None, required_scope: str, secret: str) -> dict | None:
    """Validate JWT and check scope claim. Returns decoded payload or None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:]
    try:
        payload = pyjwt.decode(token, secret, algorithms=["HS256"])
        scope = payload.get("scope", "")
        if scope and scope != required_scope:
            return None
        return payload
    except Exception:
        return None

@router.api_route("/api/governance/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def governance_gateway(path: str, request: Request):
    """Route governance API calls to the governance service."""
    import httpx
    body = await request.body()
    target_url = f"{GOVERNANCE_API_URL}/api/{path}"
    # Allow unauthenticated access to auth endpoints (login, signup, etc.)
    if not path.startswith("auth/"):
        payload = _check_scope(request.headers.get("authorization"), "governance", GOV_JWT_SECRET)
        if payload is None:
            return JSONResponse({"error": "Unauthorized: governance scope required"}, status_code=403)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(
            method=request.method,
            url=target_url,
            headers={k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")},
            content=body or None,
        )
        return JSONResponse(content=resp.json() if resp.text else {}, status_code=resp.status_code)

@router.api_route("/api/demo/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def demo_gateway(path: str, request: Request):
    """Route demo API calls to the demo/lab service. Sandboxed — no production data access."""
    import httpx
    body = await request.body()
    target_url = f"{DEMO_API_URL}/api/demo/{path}"
    # Allow unauthenticated access to auth endpoints (login, signup, etc.)
    if not path.startswith("auth/"):
        payload = _check_scope(request.headers.get("authorization"), "demo", DEMO_JWT_SECRET)
        if payload is None:
            return JSONResponse({"error": "Unauthorized: demo scope required"}, status_code=403)
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.request(
            method=request.method,
            url=target_url,
            headers={k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")},
            content=body or None,
        )
        return JSONResponse(content=resp.json() if resp.text else {}, status_code=resp.status_code)

_governance_client: GovernanceClient | None = None


def _get_governance_client(settings: Settings) -> GovernanceClient:
    global _governance_client
    if _governance_client is None:
        _governance_client = GovernanceClient(
            base_url=settings.governance_api_url,
            service_token=settings.governance_service_token,
            cache_ttl=settings.governance_policy_cache_ttl,
        )
    return _governance_client


async def _create_governance_incident_bundle(
    *,
    settings: Settings,
    user: UserContext,
    trace_id: str,
    prompt_text: str,
    provider: str,
    risk_score: int,
    detection_result: dict[str, Any],
    policy_decision: PolicyDecision | None,
) -> dict[str, Any] | None:
    try:
        gov_client = _get_governance_client(settings)
        categories = [
            str(span.get("category", ""))
            for span in detection_result.get("detected_spans", [])
            if span.get("category")
        ]
        policy_name = policy_decision.reason if policy_decision and policy_decision.reason else "Proxy policy enforcement"
        incident = await gov_client.create_incident({
            "orgId": user.org_id,
            "userId": user.user_id,
            "workspaceId": user.workspace_id or None,
            "traceId": trace_id,
            "title": f"Blocked AI request to {provider}",
            "description": f"Prompt blocked before upstream egress. Categories: {', '.join(categories) or 'none'}.",
            "severity": "CRITICAL" if risk_score >= 85 else "HIGH",
        })
        advisor = await gov_client.generate_incident_summary({
            "orgId": user.org_id,
            "userId": user.user_id,
            "incidentId": incident.get("id"),
            "traceId": trace_id,
            "incidentType": "prompt_policy_violation",
            "severity": incident.get("severity", "HIGH"),
            "offendingPrompt": prompt_text[:500],
            "detectionEvidence": detection_result,
            "violatedPolicy": policy_name,
        })
        return {"incident": incident, "advisor": advisor}
    except Exception as exc:
        log.warning("governance.incident_bundle_failed", trace_id=trace_id, error=str(exc))
        return None


async def _call_detection(
    http_client: httpx.AsyncClient,
    prompt_text: str,
    user: UserContext,
    settings: Settings,
    redis: Any = None,
) -> dict[str, Any]:
    """Call the detection service with semantic cache.
    Sprint 1: Check Redis semantic cache first; only call detection service on miss.
    """
    tracer = get_tracer()
    with tracer.start_as_current_span("detection.cache_check") as cache_span:
        cached = await get_cached_detection(redis, prompt_text)
        if cached is not None:
            cached["_from_cache"] = True
            cache_span.set_attribute("cache_hit", True)
            cache_span.set_attribute("risk_score", cached.get("risk_score", 0))
            return cached
        cache_span.set_attribute("cache_hit", False)

    # ── Cache miss: call detection service ─────────────────
    tracer = get_tracer()
    with tracer.start_as_current_span("detection.detect") as detect_span:
        detect_span.set_attribute("prompt_length", len(prompt_text))
        detect_span.set_attribute("user_id", user.user_id)
        detect_span.set_attribute("org_id", user.org_id)
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
            result = resp.json()
            detect_span.set_attribute("risk_score", result.get("risk_score", 0))
            detect_span.set_attribute("action", result.get("action", "ALLOW"))
            detect_span.set_attribute("span_count", len(result.get("detected_spans", [])))
            # Record per-tier latency if available
            for tier_key in ["tier_1_latency_ms", "tier_2_latency_ms", "tier_3_latency_ms", "tier_4_latency_ms"]:
                if tier_key in result:
                    detect_span.set_attribute(tier_key, result[tier_key])
            # ── Sprint 1: populate cache for future requests ────
            await set_cached_detection(redis, prompt_text, result)
            return result
        except httpx.TimeoutException:
            log.warning("detection.timeout", timeout_ms=settings.detection_timeout_ms)
            detect_span.set_attribute("error", True)
            detect_span.set_attribute("error_type", "timeout")
            return {
                "risk_score": 0,
                "action": "ALLOW",
                "detection_results": [],
                "detected_spans": [],
                "_degraded": True,
                "_degraded_reason": "timeout",
            }
        except Exception as e:
            log.error("detection.call_failed", error=str(e))
            record_exception(e)
            detect_span.set_attribute("error", True)
            detect_span.set_attribute("error_type", "exception")
            return {
                "risk_score": 0,
                "action": "ALLOW",
                "detection_results": [],
                "detected_spans": [],
                "_degraded": True,
                "_degraded_reason": "exception",
            }


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
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    OpenAI-compatible chat completions endpoint.
    Intercepts the request, runs detection, enforces policy, then forwards to upstream.
    """
    start_time = time.perf_counter()
    http_client: httpx.AsyncClient = request.app.state.http_client
    redis = getattr(request.app.state, "redis", None)
    tracer = get_tracer()

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

    # Call detection service (Sprint 1: cache-first)
    detection_result = await _call_detection(http_client, prompt_text, user, settings, redis)
    runtime_mode = parse_runtime_mode(settings.runtime_security_mode)
    runtime_decision = resolve_degraded_action(
        mode=runtime_mode,
        prompt_text=prompt_text,
        detection_result=detection_result,
    )
    action = runtime_decision.action
    risk_score = detection_result.get("risk_score", 0)
    trace_id = request.headers.get("X-Request-ID", prompt_hash[:16])

    if runtime_decision.degraded:
        _runtime_state["degraded_events"] = int(_runtime_state.get("degraded_events", 0)) + 1
        _runtime_state["last_degraded_reason"] = runtime_decision.reason
        _runtime_state["last_degraded_at"] = datetime.utcnow().isoformat()
        _fire_platform_event(
            redis,
            stream=EventStream.TELEMETRY_EVENTS,
            event_type="DegradedModeTriggered",
            user=user,
            trace_id=trace_id,
            payload={
                "mode": runtime_decision.mode.value,
                "reason": runtime_decision.reason,
                "fallback_action": runtime_decision.action.value,
                "provider": provider.value,
                "prompt_hash": prompt_hash,
            },
        )
        if runtime_decision.action == ActionType.BLOCK:
            _fire_platform_event(
                redis,
                stream=EventStream.INCIDENT_EVENTS,
                event_type="RuntimeFailClosedIncidentOpened",
                user=user,
                trace_id=trace_id,
                payload={
                    "severity": "HIGH",
                    "mode": runtime_decision.mode.value,
                    "reason": runtime_decision.reason,
                    "provider": provider.value,
                    "prompt_hash": prompt_hash,
                },
            )

    log.info(
        "proxy.detection_result",
        user_id=user.user_id,
        risk_score=risk_score,
        action=action.value,
        provider=provider.value,
        runtime_mode=runtime_mode.value,
        degraded=runtime_decision.degraded,
    )
    _fire_platform_event(
        redis,
        stream=EventStream.DETECTION_EVENTS,
        event_type="DetectionCompleted",
        user=user,
        trace_id=trace_id,
        payload={
            "provider": provider.value,
            "prompt_hash": prompt_hash,
            "risk_score": risk_score,
            "action": action.value,
            "detection_result": detection_result,
        },
    )

    # ─── Policy Enforcement (governance service) ─────────
    # Fetch org policies from governance service and evaluate them.
    # The governance service is the authoritative source; the detection
    # service only provides the base risk_score / detected_spans.
    policy_decision = None
    try:
        gov_client = _get_governance_client(settings)
        auth_header = request.headers.get("Authorization", "")
        gov_policies = await gov_client.fetch_policies(user.org_id, auth_header)
        if gov_policies:
            detection_categories = [
                s.get("category", "")
                for s in detection_result.get("detected_spans", [])
            ]
            policy_ctx = RequestContext(
                user_id=user.user_id,
                role=user.role,
                department=user.department,
                org_id=user.org_id,
                risk_score=risk_score,
                detection_categories=detection_categories,
                tool_name="",
                prompt_length=len(prompt_text),
            )
            with tracer.start_as_current_span("policy.evaluate") as policy_span:
                policy_span.set_attribute("risk_score", risk_score)
                policy_span.set_attribute("user_role", user.role)
                policy_span.set_attribute("policy_count", len(gov_policies))
                policy_decision = policy_engine.evaluate(policy_ctx, rules=gov_policies)
                if policy_decision:
                    policy_span.set_attribute("matched_rule", policy_decision.matched_rule_id or "")
                    policy_span.set_attribute("action", policy_decision.action.value if policy_decision.action else "ALLOW")
            if policy_decision and policy_decision.action != ActionType.ALLOW:
                action = policy_decision.action
                log.info(
                    "proxy.policy_override",
                    rule=policy_decision.matched_rule_id,
                    reason=policy_decision.reason,
                    action=action.value,
                )
                _fire_platform_event(
                    redis,
                    stream=EventStream.POLICY_EVENTS,
                    event_type="PolicyTriggered",
                    user=user,
                    trace_id=trace_id,
                    payload={
                        "provider": provider.value,
                        "prompt_hash": prompt_hash,
                        "matched_rule_id": policy_decision.matched_rule_id,
                        "reason": policy_decision.reason,
                        "action": action.value,
                        "risk_score": risk_score,
                    },
                )
    except Exception as _policy_exc:
        log.warning("proxy.policy_eval_failed", error=str(_policy_exc))

    if action == ActionType.BLOCK:
        incident_bundle = await _create_governance_incident_bundle(
            settings=settings,
            user=user,
            trace_id=trace_id,
            prompt_text=prompt_text,
            provider=provider.value,
            risk_score=risk_score,
            detection_result=detection_result,
            policy_decision=policy_decision,
        )
        if incident_bundle:
            detection_result.setdefault("trace_id", trace_id)
            detection_result["incident"] = incident_bundle.get("incident")
            detection_result["advisor"] = incident_bundle.get("advisor")
            _fire_platform_event(
                redis,
                stream=EventStream.INCIDENT_EVENTS,
                event_type="IncidentCreated",
                user=user,
                trace_id=trace_id,
                payload={
                    "incident": incident_bundle.get("incident"),
                    "advisor": incident_bundle.get("advisor"),
                    "provider": provider.value,
                    "risk_score": risk_score,
                },
            )
        # Emit audit event for block
        matched_rule_id = policy_decision.matched_rule_id if policy_decision else None
        block_reason = (
            policy_decision.reason if policy_decision and policy_decision.matched_rule_id
            else f"Detected sensitive content (risk score: {risk_score})"
        )
        audit_event = AuditEvent(
            org_id=user.org_id,
            workspace_id=user.workspace_id,
            user_id=user.user_id,
            trace_id=trace_id,
            llm_provider=provider.value,
            prompt_hash=prompt_hash,
            detection_results=detection_result,
            risk_score=risk_score,
            action_taken=ActionType.BLOCK,
            policy_rule_id=matched_rule_id,
            request_duration_ms=(time.perf_counter() - start_time) * 1000,
        )
        # FIXED (BUG-004/BUG-023): audit write is now fire-and-forget
        _fire_audit_write(redis, audit_event, user, db)
        error_detail = AirlockErrorDetail.from_detection(
            status=403,
            detail=f"{block_reason}. Contact your security team if you believe this is an error.",
            instance=str(request.url),
            trace_id=trace_id,
            detection_result=detection_result,
            policy_decision=policy_decision,
            verbose=settings.is_dev,
        )
        error_payload = error_detail.model_dump()
        if incident_bundle:
            error_payload["incident"] = incident_bundle.get("incident")
            error_payload["advisor"] = incident_bundle.get("advisor")
        return JSONResponse(
            status_code=403,
            content=error_payload,
        )

    # Sprint 3: Stateful seamless redaction — entity ID mapping per session
    messages_to_send = body.messages
    redact_session_id: str | None = None
    if action == ActionType.REDACT:
        detected_spans = detection_result.get("detected_spans", [])
        stateful = StatefulRedactor(redis)
        # Obtain session_id from request header (browser/SDK sends it) or create a new one
        req_session_id = request.headers.get("X-Session-ID") or None
        redacted_text, redact_session_id = await stateful.redact(
            prompt_text, detected_spans, session_id=req_session_id
        )
        # Replace last user message content with redacted version
        messages_to_send = [
            ChatMessage(role=m.role,
                        content=redacted_text if m.role == "user" else m.content)
            for m in body.messages
        ]

    with tracer.start_as_current_span("redaction.apply") as redact_span:
        redact_span.set_attribute("action", action.value)
        redact_span.set_attribute("risk_score", risk_score)

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
    upstream_headers = ProviderAdapter.get_headers(provider, api_key, settings)

    # ─── Forward to Upstream ──────────────────────────────

    with tracer.start_as_current_span("upstream.forward") as upstream_span:
        upstream_span.set_attribute("provider", provider.value)
        upstream_span.set_attribute("model", body.model)
        upstream_span.set_attribute("stream", body.stream)

    try:
        if body.stream:
            # Streaming response with chunk interception
            inspector = StreamInspector(
                inspect_fn=lambda text: _call_detection(http_client, text, user, settings),
                block_threshold=80,
            )
            stream_redactor = StreamRedactor()
            if action == ActionType.REDACT:
                stream_redactor.set_spans(detection_result.get("detected_spans", []))

            async def stream_with_audit() -> AsyncGenerator[bytes, None]:
                # FIXED (BUG-008/BUG-015): schedule audit BEFORE yielding final chunk,
                # not in finally block. await inside async-generator finally is unreliable
                # when the generator is cancelled or GC'd.
                _audit_scheduled = False
                try:
                    upstream_stream = _stream_upstream(http_client, upstream_url, upstream_headers, upstream_body)
                    intercepted = inspector.intercept(upstream_stream)
                    async for chunk in intercepted:
                        yield chunk
                    # Schedule audit after clean completion
                    if not _audit_scheduled:
                        _audit_scheduled = True
                        audit_event = AuditEvent(
                            org_id=user.org_id,
                            workspace_id=user.workspace_id,
                            user_id=user.user_id,
                            trace_id=trace_id,
                            llm_provider=provider.value,
                            prompt_hash=prompt_hash,
                            detection_results=detection_result,
                            risk_score=risk_score,
                            action_taken=ActionType.BLOCK if inspector._blocked else action,
                            request_duration_ms=(time.perf_counter() - start_time) * 1000,
                        )
                        _fire_audit_write(redis, audit_event, user, db)
                except Exception as exc:
                    if not _audit_scheduled:
                        _audit_scheduled = True
                        audit_event = AuditEvent(
                            org_id=user.org_id,
                            workspace_id=user.workspace_id,
                            user_id=user.user_id,
                            trace_id=trace_id,
                            llm_provider=provider.value,
                            prompt_hash=prompt_hash,
                            detection_results=detection_result,
                            risk_score=risk_score,
                            action_taken=ActionType.BLOCK if inspector._blocked else action,
                            request_duration_ms=(time.perf_counter() - start_time) * 1000,
                        )
                        _fire_audit_write(redis, audit_event, user, db)
                    raise

            headers = {
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Risk-Score": str(risk_score),
                "X-Action": action.value,
            }
            if inspector._blocked:
                headers["X-Stream-Blocked"] = "true"

            return StreamingResponse(
                stream_with_audit(),
                media_type="text/event-stream",
                headers=headers,
            )
        else:
            # Non-streaming response
            resp = await http_client.post(
                upstream_url,
                json=upstream_body,
                headers=upstream_headers,
                timeout=30.0,
            )

            # Response Inspection (A5)
            response_content = None
            try:
                if resp.status_code == 200:
                    resp_json = resp.json()
                    response_text = ""
                    for choice in resp_json.get("choices", []):
                        content = choice.get("message", {}).get("content", "")
                        if content:
                            response_text += content
                    
                    if response_text:
                        res_det = await _call_detection(http_client, response_text, user, settings)
                        res_action = ActionType(res_det.get("action", "ALLOW"))
                        
                        if res_action == ActionType.BLOCK:
                            error_detail = AirlockErrorDetail.from_detection(
                                status=403,
                                title="Response Blocked by Policy",
                                detail="The upstream LLM response contained sensitive information and was blocked.",
                                instance=str(request.url),
                                trace_id=trace_id,
                                detection_result=res_det,
                                verbose=settings.is_dev,
                            )
                            return JSONResponse(
                                status_code=403,
                                content=error_detail.model_dump(),
                            )
                        elif res_action == ActionType.REDACT:
                            detected_spans = res_det.get("detected_spans", [])
                            for choice in resp_json.get("choices", []):
                                content = choice.get("message", {}).get("content", "")
                                if content:
                                    for span in sorted(detected_spans, key=lambda s: s.get("start", 0), reverse=True):
                                        start = span.get("start", 0)
                                        end = span.get("end", 0)
                                        category = span.get("category", "UNKNOWN")
                                        content = content[:start] + f"[REDACTED:{category}]" + content[end:]
                                    choice["message"]["content"] = content
                            response_content = resp_json
            except Exception as e:
                log.warning("response_inspection.failed", error=str(e))

            duration_ms = (time.perf_counter() - start_time) * 1000

            # Emit audit event
            audit_event = AuditEvent(
                org_id=user.org_id,
                workspace_id=user.workspace_id,
                user_id=user.user_id,
                trace_id=trace_id,
                llm_provider=provider.value,
                prompt_hash=prompt_hash,
                detection_results=detection_result,
                risk_score=risk_score,
                action_taken=action,
                request_duration_ms=duration_ms,
                upstream_status_code=resp.status_code,
            )
            # FIXED (BUG-004): audit write is now fire-and-forget
            _fire_audit_write(redis, audit_event, user, db)
            _fire_platform_event(
                redis,
                stream=EventStream.TELEMETRY_EVENTS,
                event_type="TelemetryCaptured",
                user=user,
                trace_id=trace_id,
                payload={
                    "provider": provider.value,
                    "model": body.model,
                    "prompt_hash": prompt_hash,
                    "risk_score": risk_score,
                    "action": action.value,
                    "request_duration_ms": duration_ms,
                    "upstream_status_code": resp.status_code,
                    "stream": body.stream,
                },
            )

            # Return upstream response with governance headers
            response = JSONResponse(
                status_code=resp.status_code,
                content=response_content if response_content is not None else resp.json(),
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

@router.get("/api/v1/stats")
async def proxy_stats(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    Return real-time prompt statistics from audit_events for the dashboard KPIs.
    Covers today's window: totalToday, blockedToday, redactedToday, warnedToday, avgRiskScore.
    """
    try:
        org_id_val = str(uuid.UUID(user.org_id))
    except (ValueError, AttributeError):
        org_id_val = user.org_id

    q = text("""
        SELECT
            COUNT(*)                                                          AS total_today,
            COUNT(*) FILTER (WHERE action_taken = 'BLOCK')                   AS blocked_today,
            COUNT(*) FILTER (WHERE action_taken = 'REDACT')                  AS redacted_today,
            COUNT(*) FILTER (WHERE action_taken = 'WARN')                    AS warned_today,
            COUNT(*) FILTER (WHERE action_taken = 'ALLOW')                   AS allowed_today,
            COUNT(*) FILTER (WHERE action_taken = 'LOG')                     AS logged_today,
            COALESCE(ROUND(AVG(risk_score)::numeric, 1), 0)                  AS avg_risk_score,
            COUNT(*) FILTER (WHERE risk_score >= 70)                         AS high_risk_today
        FROM audit_events
        WHERE org_id::text = :org_id
          AND timestamp >= NOW() - INTERVAL '24 hours'
    """)
    result = await db.execute(q, {"org_id": org_id_val})
    row = result.fetchone()

    total = int(row.total_today or 0)
    blocked = int(row.blocked_today or 0)
    redacted = int(row.redacted_today or 0)
    warned = int(row.warned_today or 0)
    allowed = int(row.allowed_today or 0)
    avg_risk = float(row.avg_risk_score or 0)
    high_risk = int(row.high_risk_today or 0)

    return {
        "totalToday":       total,
        "blockedToday":     blocked,
        "redactedToday":    redacted,
        "warnedToday":      warned,
        "allowedToday":     allowed,
        "loggedToday":      int(row.logged_today or 0),
        "avgRiskScore":     avg_risk,
        "highRiskToday":    high_risk,
        "blockRate":        round(blocked / total * 100, 1) if total else 0,
        "redactRate":       round(redacted / total * 100, 1) if total else 0,
        "warnRate":         round(warned / total * 100, 1) if total else 0,
    }



@router.get("/api/v1/analytics/trend")
async def analytics_trend(
    days: int = 30,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return risk trend data from TimescaleDB."""
    # Safely handle non-UUID org_id (like 'org-001' in dev mode)
    try:
        org_id_val = str(uuid.UUID(user.org_id))
    except (ValueError, AttributeError):
        org_id_val = user.org_id

    # Use date_trunc (standard Postgres) instead of time_bucket (TimescaleDB-only)
    query = text("""
        SELECT date_trunc('day', timestamp) AS day,
               COUNT(*) FILTER (WHERE action_taken = 'BLOCK') as blocked,
               COUNT(*) FILTER (WHERE action_taken = 'REDACT') as redacted,
               COUNT(*) FILTER (WHERE action_taken = 'WARN') as warned,
               COUNT(*) FILTER (WHERE action_taken = 'ALLOW') as allowed
        FROM audit_events
        WHERE org_id::text = :org_id
          AND timestamp > NOW() - (:days || ' days')::interval
        GROUP BY day
        ORDER BY day;
    """)
    result = await db.execute(query, {"org_id": org_id_val, "days": str(days)})
    rows = result.fetchall()

    data = []
    for row in rows:
        data.append({
            "date": row.day.strftime("%Y-%m-%d") if row.day else None,
            "blocked": int(row.blocked or 0),
            "redacted": int(row.redacted or 0),
            "warned": int(row.warned or 0),
            "allowed": int(row.allowed or 0),
        })
    return {"data": data, "days": days}


@router.get("/api/v1/analytics/categories")
async def analytics_categories(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return detection category breakdown from audit events."""
    try:
        org_id_val = str(uuid.UUID(user.org_id))
    except (ValueError, AttributeError):
        org_id_val = user.org_id

    query = text("""
        SELECT
            jsonb_array_elements_text(
                COALESCE(detection_results->'detected_spans', '[]'::jsonb)
            )::jsonb->>'category' as category,
            COUNT(*) as count
        FROM audit_events
        WHERE org_id::text = :org_id
          AND timestamp > NOW() - INTERVAL '30 days'
          AND detection_results->'detected_spans' IS NOT NULL
        GROUP BY category
        ORDER BY count DESC;
    """)
    result = await db.execute(query, {"org_id": org_id_val})
    rows = result.fetchall()

    # Color mapping for categories
    color_map = {
        "PII": "#3b82f6",
        "PROMPT_INJECTION": "#ef4444",
        "API_KEY": "#f97316",
        "REGULATORY": "#eab308",
        "HALLUCINATION": "#a855f7",
        "BIAS": "#22c55e",
        "SOURCE_CODE": "#06b6d4",
        "CREDENTIALS": "#f43f5e",
        "CONFIDENTIAL": "#6366f1",
    }

    total = sum(row.count for row in rows) or 1
    data = []
    for row in rows:
        cat = row.category or "UNKNOWN"
        data.append({
            "name": cat.replace("_", " ").title(),
            "value": round((row.count / total) * 100, 1),
            "raw_count": row.count,
            "color": color_map.get(cat, "#94a3b8"),
        })

    # Return empty array when no data — no fake fallback that misleads dashboards
    return data


@router.get("/api/v1/audit-events")
async def list_audit_events(
    page: int = 1,
    per_page: int = 50,
    limit: int | None = None,
    action: str | None = None,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List audit events — uses raw SQL to avoid UUID↔text type mismatch."""
    if limit:
        per_page = min(limit, 200)

    org_str = str(user.org_id)
    base_where = "org_id::text = :org_id"
    params: dict[str, Any] = {"org_id": org_str, "offset": (page - 1) * per_page, "limit": per_page}
    if action:
        base_where += " AND action_taken = :action"
        params["action"] = action

    total_sql = text(f"SELECT COUNT(*) FROM audit_events WHERE {base_where}")
    total = (await db.execute(total_sql, params)).scalar() or 0

    data_sql = text(f"""
        SELECT event_id, timestamp, user_id, llm_provider, tool_name,
               risk_score, action_taken, prompt_hash, detection_results
        FROM audit_events
        WHERE {base_where}
        ORDER BY timestamp DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = (await db.execute(data_sql, params)).fetchall()

    return {
        "data": [
            {
                "event_id":          str(r.event_id),
                "timestamp":         r.timestamp.isoformat() if r.timestamp else None,
                "user_id":           str(r.user_id),
                "llm_provider":      r.llm_provider,
                "tool_name":         r.tool_name,
                "risk_score":        r.risk_score,
                "action_taken":      r.action_taken,
                "prompt_hash":       r.prompt_hash,
                "detection_results": r.detection_results,
            } for r in rows
        ],
        "total":    total,
        "page":     page,
        "per_page": per_page,
    }


# ─── Analytics / Monitoring Endpoints ─────────────────────

class LatencyPercentile(BaseModel):
    p50: float = 0
    p95: float = 0
    p99: float = 0
    sample_count: int = 0

@router.get("/api/v1/analytics/latency")
async def analytics_latency(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return p50/p95/p99 latency from the last hour."""
    try:
        org_id_val = str(uuid.UUID(user.org_id))
    except (ValueError, AttributeError):
        org_id_val = user.org_id

    try:
        query = text("""
            SELECT
                percentile_cont(0.50) WITHIN GROUP (ORDER BY request_duration_ms) AS p50,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY request_duration_ms) AS p95,
                percentile_cont(0.99) WITHIN GROUP (ORDER BY request_duration_ms) AS p99,
                COUNT(*) AS sample_count
            FROM audit_events
            WHERE org_id::text = :org_id
              AND timestamp >= NOW() - INTERVAL '1 hour'
              AND request_duration_ms > 0
        """)
        result = await db.execute(query, {"org_id": org_id_val})
        row = result.fetchone()
        return {
            "p50": round(float(row.p50 or 0), 2),
            "p95": round(float(row.p95 or 0), 2),
            "p99": round(float(row.p99 or 0), 2),
            "sample_count": int(row.sample_count or 0),
        }
    except Exception as e:
        log.warning("analytics_latency.failed", error=str(e))
        return {"p50": 0, "p95": 0, "p99": 0, "sample_count": 0}


@router.get("/api/v1/analytics/redis-health")
async def redis_health(
    request: Request,
) -> dict[str, Any]:
    """Return Redis connection status and queue depth."""
    redis = getattr(request.app.state, "redis", None)
    settings = get_settings()
    if not redis:
        return {"connected": False, "queue_depth": 0, "memory_bytes": 0, "hit_rate": 0.0}

    try:
        info = await redis.info()
        queue_depth = await redis.xlen(settings.audit_stream_key)
        return {
            "connected": True,
            "queue_depth": queue_depth,
            "memory_bytes": info.get("used_memory", 0),
            "keyspace_hits": info.get("keyspace_hits", 0),
            "keyspace_misses": info.get("keyspace_misses", 0),
            "uptime_seconds": info.get("uptime_in_seconds", 0),
            "hit_rate": round(
                info.get("keyspace_hits", 0) / max(1, info.get("keyspace_hits", 0) + info.get("keyspace_misses", 0)) * 100,
                2,
            ),
        }
    except Exception as e:
        return {"connected": False, "error": str(e), "queue_depth": 0, "memory_bytes": 0, "hit_rate": 0.0}


@router.get("/api/v1/analytics/upstream-latency")
async def upstream_latency(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return per-provider latency breakdown."""
    try:
        org_id_val = str(uuid.UUID(user.org_id))
    except (ValueError, AttributeError):
        org_id_val = user.org_id

    query = text("""
        SELECT
            llm_provider,
            COUNT(*) AS request_count,
            ROUND(AVG(request_duration_ms)::numeric, 2) AS avg_latency_ms,
            ROUND(MAX(request_duration_ms)::numeric, 2) AS max_latency_ms,
            ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY request_duration_ms)::numeric, 2) AS p95_latency_ms
        FROM audit_events
        WHERE org_id::text = :org_id
          AND timestamp >= NOW() - INTERVAL '24 hours'
          AND request_duration_ms > 0
        GROUP BY llm_provider
        ORDER BY avg_latency_ms DESC
    """)
    result = await db.execute(query, {"org_id": org_id_val})
    rows = result.fetchall()
    return [
        {
            "provider": r.llm_provider,
            "request_count": int(r.request_count),
            "avg_latency_ms": float(r.avg_latency_ms or 0),
            "max_latency_ms": float(r.max_latency_ms or 0),
            "p95_latency_ms": float(r.p95_latency_ms or 0),
        }
        for r in rows
    ]


@router.get("/api/v1/analytics/queue-depth")
async def queue_depth(
    request: Request,
) -> dict[str, Any]:
    """Return Redis Stream consumer lag and dead-letter queue depth."""
    redis = getattr(request.app.state, "redis", None)
    settings = get_settings()
    if not redis:
        return {"audit_queue": 0, "dead_letter_queue": 0, "consumer_lag": 0}

    try:
        audit_len = await redis.xlen(settings.audit_stream_key)
        retry_len = await redis.xlen(settings.audit_retry_stream_key)
        dead_letter_len = await redis.xlen(settings.audit_dead_letter_stream_key)
        # Consumer lag: count of pending (unacknowledged) messages
        try:
            pending = await redis.xpending(settings.audit_stream_key, settings.audit_consumer_group)
            consumer_lag = int(pending.get("pending", 0))
        except Exception:
            consumer_lag = 0
        return {
            "audit_queue": audit_len,
            "audit_retry_queue": retry_len,
            "dead_letter_queue": dead_letter_len,
            "consumer_lag": consumer_lag,
        }
    except Exception as e:
        return {"audit_queue": 0, "audit_retry_queue": 0, "dead_letter_queue": 0, "consumer_lag": 0, "error": str(e)}


@router.get("/api/v1/analytics/streams")
async def active_streams(
    request: Request,
) -> dict[str, Any]:
    """Return active SSE connection count."""
    app = request.app
    active = getattr(app.state, "_active_streams", 0)
    return {"active_streams": active}


@router.get("/api/v1/runtime-mode")
async def runtime_mode(settings: Settings = Depends(get_settings)) -> dict[str, Any]:
    mode = parse_runtime_mode(settings.runtime_security_mode)
    return {
        "mode": mode.value,
        "degraded_events": _runtime_state["degraded_events"],
        "last_degraded_reason": _runtime_state["last_degraded_reason"],
        "last_degraded_at": _runtime_state["last_degraded_at"],
    }


class ShadowAIEventPayload(BaseModel):
    user_id: str
    tool_name: str
    domain: str
    category: str
    is_authorized: bool = False
    timestamp: datetime | None = None
    org_id: str | None = None

@router.post("/api/v1/shadow-ai/events")
async def ingest_shadow_ai_event(
    event: ShadowAIEventPayload,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    alert = ShadowAIAlert(
        user_id=event.user_id,
        org_id=event.org_id,
        tool_name=event.tool_name,
        domain=event.domain,
        category=event.category,
        is_authorized=event.is_authorized,
        timestamp=event.timestamp or datetime.utcnow(),
    )
    db.add(alert)
    await db.commit()
    return {"status": "ok", "alert_id": str(alert.alert_id)}

@router.get("/api/v1/shadow-ai/detections")
async def list_shadow_ai_detections(
    page: int = 1,
    per_page: int = 50,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
) -> dict[str, Any]:
    query = select(ShadowAIAlert)
    
    # Filter by org_id if available on the alert (some alerts might not have it mapped yet)
    # query = query.filter(ShadowAIAlert.org_id == user.org_id)

    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    query = query.order_by(desc(ShadowAIAlert.timestamp))
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    records = result.scalars().all()

    return {
        "data": [
            {
                "alert_id": str(r.alert_id),
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "user_id": r.user_id,
                "tool_name": r.tool_name,
                "domain": r.domain,
                "category": r.category,
                "is_authorized": r.is_authorized,
            } for r in records
        ],
        "total": total or 0,
        "page": page,
        "per_page": per_page,
    }


# ─── Live Demo Endpoints ──────────────────────────────────────────────────────

class InspectRequest(BaseModel):
    """Inspect a prompt without forwarding upstream — for live demo use."""
    text: str
    department: str = "Engineering"
    role: str = "engineer"
    user_id: str = "demo-user"
    org_id: str = "org-001"


@router.post("/api/v1/inspect")
async def inspect_prompt(
    body: InspectRequest,
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """
    Inspect a prompt and return full detection + policy decision.
    Does NOT forward to any upstream LLM. Safe for live demo use.
    Auth is not required so judges can test directly.
    """
    http_client: httpx.AsyncClient = request.app.state.http_client
    start_time = time.perf_counter()

    user = UserContext(
        user_id=body.user_id,
        org_id=body.org_id,
        department=body.department,
        role=body.role,
    )

    detection_result = await _call_detection(http_client, body.text, user, settings)

    risk_score: int = detection_result.get("risk_score", 0)
    detection_action: str = detection_result.get("action", "ALLOW")
    detected_spans: list = detection_result.get("detected_spans", [])
    detection_results: list = detection_result.get("detection_results", [])

    categories = list({s.get("category") for s in detected_spans if s.get("category")})

    # ── Policy Evaluation ─────────────────────────────────────────────
    policy_decision = None
    try:
        gov_client = _get_governance_client(settings)
        gov_policies = await gov_client.fetch_policies(user.org_id)
        if gov_policies:
            policy_ctx = RequestContext(
                user_id=user.user_id,
                role=user.role,
                department=user.department,
                org_id=user.org_id,
                risk_score=risk_score,
                detection_categories=categories,
                tool_name="",
                prompt_length=len(body.text),
            )
            policy_decision = policy_engine.evaluate(policy_ctx, rules=gov_policies)
            if policy_decision and policy_decision.action != ActionType.ALLOW:
                log.info(
                    "inspect.policy_matched",
                    rule=policy_decision.matched_rule_id,
                    reason=policy_decision.reason,
                    action=policy_decision.action.value,
                )
    except Exception as exc:
        log.warning("inspect.policy_eval_failed", error=str(exc))

    if policy_decision and policy_decision.action != ActionType.ALLOW:
        action = policy_decision.action.value
    else:
        action = detection_action

    # Build highlighted segments for the frontend
    segments: list[dict] = []
    sorted_spans = sorted(detected_spans, key=lambda s: s.get("start", 0))
    cursor = 0
    for span in sorted_spans:
        start = span.get("start", 0)
        end = span.get("end", 0)
        if start > cursor:
            segments.append({"text": body.text[cursor:start], "highlight": False, "category": None})
        segments.append({
            "text": body.text[start:end],
            "highlight": True,
            "category": span.get("category", "UNKNOWN"),
            "confidence": span.get("confidence", 1.0),
        })
        cursor = end
    if cursor < len(body.text):
        segments.append({"text": body.text[cursor:], "highlight": False, "category": None})

    duration_ms = round((time.perf_counter() - start_time) * 1000, 1)

    log.info(
        "inspect.completed",
        risk_score=risk_score,
        action=action,
        detection_action=detection_action,
        categories=categories,
        duration_ms=duration_ms,
        policy_matched=policy_decision.matched_rule_id if policy_decision else None,
    )

    detection_id = detection_result.get("detection_id", "") if isinstance(detection_result, dict) else ""

    return {
        "detection_id": detection_id,
        "risk_score": risk_score,
        "action": action,
        "detection_action": detection_action,
        "policy_decision": {
            "action": policy_decision.action.value if policy_decision else None,
            "matched_rule_id": policy_decision.matched_rule_id if policy_decision else None,
            "reason": policy_decision.reason if policy_decision else "",
        } if policy_decision else None,
        "categories": categories,
        "detected_spans": detected_spans,
        "detection_results": detection_results,
        "segments": segments,
        "duration_ms": duration_ms,
        "prompt_length": len(body.text),
    }


@router.get("/api/v1/stream/events")
async def stream_events(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: UserContext = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    """
    SSE endpoint — streams new audit events in real time.
    Frontend connects once; new events are replayable, ordered, and heartbeated.
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        last_event_id = request.headers.get("last-event-id")
        last_timestamp: datetime | None = None
        sequence = 0

        # Track active streams
        app = request.app
        active = getattr(app.state, "_active_streams", 0)
        app.state._active_streams = active + 1

        try:
            # Send initial connection confirmation
            yield f"data: {json.dumps({'type': 'connected', 'ts': time.time(), 'mode': parse_runtime_mode(get_settings().runtime_security_mode).value})}\n\n"

            while True:
                if await request.is_disconnected():
                    break
                try:
                    try:
                        org_id_val = uuid.UUID(user.org_id)
                        query = select(AuditEventRecord).filter(
                            AuditEventRecord.org_id == org_id_val
                        )
                    except (ValueError, AttributeError):
                        from sqlalchemy import cast, String
                        query = select(AuditEventRecord).filter(
                            cast(AuditEventRecord.org_id, String) == user.org_id
                        )

                    if last_timestamp:
                        query = query.filter(AuditEventRecord.timestamp >= last_timestamp)

                    query = query.order_by(desc(AuditEventRecord.timestamp)).limit(settings.stream_replay_limit)
                    result = await db.execute(query)
                    records = list(result.scalars().all())

                    unseen = []
                    for record in reversed(records):
                        event_id = str(record.event_id)
                        if event_id == last_event_id:
                            continue
                        unseen.append(record)

                    if unseen:
                        for record in unseen:
                            sequence += 1
                            last_event_id = str(record.event_id)
                            last_timestamp = record.timestamp
                            detections = record.detection_results or {}
                            spans = detections.get("detected_spans", [])
                            fallback_categories = detections.get("categories", [])
                            categories = sorted(
                                {
                                    *(s.get("category") for s in spans if s.get("category")),
                                    *(category for category in fallback_categories if isinstance(category, str)),
                                }
                            )
                            payload = build_event_payload(
                                record=record,
                                sequence=sequence,
                                categories=categories,
                                trace_id=detections.get("traceId") or detections.get("trace_id"),
                                request_id=detections.get("requestId") or detections.get("request_id"),
                                incident_id=detections.get("incidentId") or detections.get("incident_id"),
                                org_id=detections.get("orgId") or detections.get("org_id") or str(record.org_id),
                                workspace_id=detections.get("workspaceId") or detections.get("workspace_id"),
                                session_id=detections.get("sessionId") or detections.get("session_id") or getattr(record, "session_id", ""),
                                stream_health={
                                    "active_streams": getattr(app.state, "_active_streams", 0),
                                    "runtime_mode": parse_runtime_mode(get_settings().runtime_security_mode).value,
                                    "degraded_events": _runtime_state["degraded_events"],
                                },
                            )
                            yield f"id: {last_event_id}\n"
                            yield f"data: {json.dumps(payload)}\n\n"
                    else:
                        sequence += 1
                        yield f"data: {heartbeat_payload(sequence=sequence, stream_health={'active_streams': getattr(app.state, '_active_streams', 0), 'runtime_mode': parse_runtime_mode(get_settings().runtime_security_mode).value, 'degraded_events': _runtime_state['degraded_events']})}\n\n"

                except Exception as exc:
                    log.warning("sse.error", error=str(exc))
                    yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

                await asyncio.sleep(max(settings.stream_heartbeat_interval_ms / 1000, 1))
        finally:
            # Decrement active stream counter
            app.state._active_streams = max(0, (app.state._active_streams or 1) - 1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
