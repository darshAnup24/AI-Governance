"""
Proxy routes — OpenAI-compatible LLM API proxy endpoint.
Intercepts, detects, enforces policy, and forwards to upstream.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from typing import Any, AsyncGenerator

import httpx
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
from proxy.app.database import get_db
from proxy.app.db_models import AuditEventRecord, ShadowAIAlert
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
# Sprint 1: Semantic cache
from proxy.app.semantic_cache import get_cached_detection, set_cached_detection
# Sprint 3: Stateful seamless redaction
from proxy.app.stateful_redactor import StatefulRedactor
# Governance policy integration
from proxy.app.governance_client import GovernanceClient
from proxy.app.policy_engine import policy_engine, RequestContext

log = structlog.get_logger()
router = APIRouter()

_governance_client: GovernanceClient | None = None


def _get_governance_client(settings: Settings) -> GovernanceClient:
    global _governance_client
    if _governance_client is None:
        _governance_client = GovernanceClient(
            base_url=settings.governance_api_url,
            cache_ttl=settings.governance_policy_cache_ttl,
        )
    return _governance_client


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
    # ── Sprint 1: cache lookup ──────────────────────────────
    cached = await get_cached_detection(redis, prompt_text)
    if cached is not None:
        cached["_from_cache"] = True
        return cached

    # ── Cache miss: call detection service ─────────────────
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
        # ── Sprint 1: populate cache for future requests ────
        await set_cached_detection(redis, prompt_text, result)
        return result
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

    # Call detection service (Sprint 1: cache-first)
    detection_result = await _call_detection(http_client, prompt_text, user, settings, redis)
    action = ActionType(detection_result.get("action", "ALLOW"))
    risk_score = detection_result.get("risk_score", 0)

    log.info(
        "proxy.detection_result",
        user_id=user.user_id,
        risk_score=risk_score,
        action=action.value,
        provider=provider.value,
    )

    # ─── Policy Enforcement (governance service) ─────────
    # Fetch org policies from governance service and evaluate them.
    # The governance service is the authoritative source; the detection
    # service only provides the base risk_score / detected_spans.
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
            policy_decision = policy_engine.evaluate(policy_ctx, rules=gov_policies)
            if policy_decision.action != ActionType.ALLOW:
                action = policy_decision.action
                log.info(
                    "proxy.policy_override",
                    rule=policy_decision.matched_rule_id,
                    reason=policy_decision.reason,
                    action=action.value,
                )
    except Exception as _policy_exc:
        log.warning("proxy.policy_eval_failed", error=str(_policy_exc))

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
                            # Block the response
                            return JSONResponse(
                                status_code=403,
                                content=ProblemDetail(
                                    type="https://ai-governance.dev/errors/policy-violation",
                                    title="Response Blocked by Policy",
                                    status=403,
                                    detail="The upstream LLM response contained sensitive information and was blocked.",
                                ).model_dump(),
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
        org_filter = "org_id = :org_id"
    except (ValueError, AttributeError):
        org_id_val = user.org_id
        org_filter = "org_id::text = :org_id"

    query = text(f"""
        SELECT time_bucket('1 day', timestamp) AS day,
               COUNT(*) FILTER (WHERE action_taken = 'BLOCK') as blocked,
               COUNT(*) FILTER (WHERE action_taken = 'REDACT') as redacted,
               COUNT(*) FILTER (WHERE action_taken = 'WARN') as warned,
               COUNT(*) FILTER (WHERE action_taken = 'ALLOW') as allowed
        FROM audit_events
        WHERE {org_filter} AND timestamp > NOW() - (:days || ' days')::interval
        GROUP BY day ORDER BY day;
    """)
    result = await db.execute(query, {"org_id": org_id_val, "days": str(days)})
    rows = result.fetchall()

    data = []
    # If using Timescale/Postgres, row.day is datetime. Ensure formatting.
    for row in rows:
        data.append({
            "date": row.day.strftime("%Y-%m-%d") if row.day else None,
            "blocked": row.blocked,
            "redacted": row.redacted,
            "warned": row.warned,
            "allowed": row.allowed,
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
        org_filter = "org_id = :org_id"
    except (ValueError, AttributeError):
        org_id_val = user.org_id
        org_filter = "org_id::text = :org_id"

    query = text(f"""
        SELECT
            jsonb_array_elements_text(
                COALESCE(detection_results->'detected_spans', '[]'::jsonb)
            )::jsonb->>'category' as category,
            COUNT(*) as count
        FROM audit_events
        WHERE {org_filter}
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

    # Fallback if no data
    if not data:
        data = [
            {"name": "PII", "value": 32, "raw_count": 0, "color": "#3b82f6"},
            {"name": "Prompt Injection", "value": 25, "raw_count": 0, "color": "#ef4444"},
            {"name": "API Key", "value": 18, "raw_count": 0, "color": "#f97316"},
            {"name": "Regulatory", "value": 12, "raw_count": 0, "color": "#eab308"},
            {"name": "Hallucination", "value": 8, "raw_count": 0, "color": "#a855f7"},
            {"name": "Bias", "value": 5, "raw_count": 0, "color": "#22c55e"},
        ]

    return data


@router.get("/api/v1/audit-events")
async def list_audit_events(
    page: int = 1,
    per_page: int = 50,
    action: str | None = None,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List audit events from PostgreSQL."""
    try:
        org_id_val = uuid.UUID(user.org_id)
        query = select(AuditEventRecord).filter(AuditEventRecord.org_id == org_id_val)
    except (ValueError, AttributeError):
        from sqlalchemy import cast, String
        query = select(AuditEventRecord).filter(cast(AuditEventRecord.org_id, String) == user.org_id)
    if action:
        query = query.filter(AuditEventRecord.action_taken == action)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Data
    query = query.order_by(desc(AuditEventRecord.timestamp))
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    records = result.scalars().all()

    return {
        "data": [
            {
                "event_id": str(r.event_id),
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "user_id": str(r.user_id),
                "llm_provider": r.llm_provider,
                "risk_score": r.risk_score,
                "action_taken": r.action_taken,
                "tool_name": r.tool_name,
                "prompt_hash": r.prompt_hash,
                "detection_results": r.detection_results,
            } for r in records
        ],
        "total": total or 0,
        "page": page,
        "per_page": per_page,
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
    action: str = detection_result.get("action", "ALLOW")
    detected_spans: list = detection_result.get("detected_spans", [])
    detection_results: list = detection_result.get("detection_results", [])

    categories = list({s.get("category") for s in detected_spans if s.get("category")})

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
        categories=categories,
        duration_ms=duration_ms,
    )

    return {
        "risk_score": risk_score,
        "action": action,
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
) -> StreamingResponse:
    """
    SSE endpoint — streams new audit events in real time.
    Frontend connects once; new events are pushed every ~2 seconds.
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        last_event_id: str | None = None

        # Send initial connection confirmation
        yield f"data: {json.dumps({'type': 'connected', 'ts': time.time()})}\n\n"

        while True:
            if await request.is_disconnected():
                break
            try:
                # Query for events newer than the last one we sent
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

                query = query.order_by(desc(AuditEventRecord.timestamp)).limit(1)
                result = await db.execute(query)
                record = result.scalar_one_or_none()

                if record:
                    event_id = str(record.event_id)
                    if event_id != last_event_id:
                        last_event_id = event_id
                        detections = record.detection_results or {}
                        spans = detections.get("detected_spans", [])
                        categories = list({s.get("category") for s in spans if s.get("category")})
                        payload = {
                            "type": "event",
                            "event_id": event_id,
                            "timestamp": record.timestamp.isoformat() if record.timestamp else None,
                            "user_id": str(record.user_id),
                            "risk_score": record.risk_score,
                            "action_taken": record.action_taken,
                            "llm_provider": record.llm_provider,
                            "categories": categories,
                        }
                        yield f"data: {json.dumps(payload)}\n\n"
                    else:
                        # Heartbeat to keep connection alive
                        yield f"data: {json.dumps({'type': 'heartbeat', 'ts': time.time()})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'heartbeat', 'ts': time.time()})}\n\n"

            except Exception as exc:
                log.warning("sse.error", error=str(exc))
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
