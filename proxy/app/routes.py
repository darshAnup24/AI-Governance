"""
Proxy routes — OpenAI-compatible LLM API proxy endpoint.
Intercepts, detects, enforces policy, and forwards to upstream.
"""

from __future__ import annotations

import hashlib
import json
import time
<<<<<<< HEAD
import uuid
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
<<<<<<< HEAD
from proxy.app.security import DataEncryptor, read_secret
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2

log = structlog.get_logger()
router = APIRouter()


<<<<<<< HEAD
def _build_detection_request_headers(settings: Settings) -> dict[str, str]:
    token = read_secret(settings.internal_service_token, settings.internal_service_token_file)
    return {"X-Internal-Service-Token": token}


def _get_detection_tls_config(settings: Settings) -> dict[str, Any]:
    if not settings.mtls_enabled:
        return {}
    cert_pair: tuple[str, str] | None = None
    if settings.mtls_client_cert_path and settings.mtls_client_key_path:
        cert_pair = (settings.mtls_client_cert_path, settings.mtls_client_key_path)
    return {"verify": settings.mtls_ca_bundle_path or True, "cert": cert_pair}


def _build_encryptor(settings: Settings) -> DataEncryptor:
    key = read_secret(settings.data_encryption_key, settings.data_encryption_key_file)
    return DataEncryptor(key)


=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
<<<<<<< HEAD
            headers=_build_detection_request_headers(settings),
            timeout=settings.detection_timeout_ms / 1000,
            **_get_detection_tls_config(settings),
=======
            timeout=settings.detection_timeout_ms / 1000,
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
<<<<<<< HEAD
    encryptor = _build_encryptor(settings)
    encrypted_prompt_hash = encryptor.encrypt(prompt_hash)
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2

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
<<<<<<< HEAD
            encrypted_prompt_hash=encrypted_prompt_hash,
            detection_results=detection_result,
            encrypted_detected_spans=encryptor.encrypt(
                json.dumps(detection_result.get("detected_spans", []))
            ),
=======
            detection_results=detection_result,
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
<<<<<<< HEAD
                        encrypted_prompt_hash=encrypted_prompt_hash,
                        detection_results=detection_result,
                        encrypted_detected_spans=encryptor.encrypt(
                            json.dumps(detection_result.get("detected_spans", []))
                        ),
=======
                        detection_results=detection_result,
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
<<<<<<< HEAD
                                    for span in sorted(detected_spans, key=lambda s: len(s.get("matched_text", "")), reverse=True):
                                        matched_text = span.get("matched_text", "")
                                        category = span.get("category", "UNKNOWN")
                                        if matched_text:
                                            content = content.replace(matched_text, f"[REDACTED:{category}]")
=======
                                    for span in sorted(detected_spans, key=lambda s: s.get("start", 0), reverse=True):
                                        start = span.get("start", 0)
                                        end = span.get("end", 0)
                                        category = span.get("category", "UNKNOWN")
                                        content = content[:start] + f"[REDACTED:{category}]" + content[end:]
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
<<<<<<< HEAD
                encrypted_prompt_hash=encrypted_prompt_hash,
                detection_results=detection_result,
                encrypted_detected_spans=encryptor.encrypt(
                    json.dumps(detection_result.get("detected_spans", []))
                ),
=======
                detection_results=detection_result,
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
<<<<<<< HEAD
    days = max(1, min(days, 365))
    org_uuid = uuid.UUID(str(user.org_id))
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
    query = text("""
        SELECT time_bucket('1 day', timestamp) AS day,
               COUNT(*) FILTER (WHERE action_taken = 'BLOCK') as blocked,
               COUNT(*) FILTER (WHERE action_taken = 'REDACT') as redacted,
               COUNT(*) FILTER (WHERE action_taken = 'WARN') as warned,
               COUNT(*) FILTER (WHERE action_taken = 'ALLOW') as allowed
        FROM audit_events
        WHERE org_id = :org_id AND timestamp > NOW() - (:days || ' days')::interval
        GROUP BY day ORDER BY day;
    """)
<<<<<<< HEAD
    result = await db.execute(query, {"org_id": org_uuid, "days": str(days)})
=======
    result = await db.execute(query, {"org_id": user.org_id, "days": str(days)})
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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


@router.get("/api/v1/audit-events")
async def list_audit_events(
    page: int = 1,
    per_page: int = 50,
    action: str | None = None,
<<<<<<< HEAD
    user_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    org_id: str | None = None,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List audit events from PostgreSQL with pagination and filtering."""
    import uuid as _uuid
    try:
        org_uuid = _uuid.UUID(str(user.org_id))
    except (ValueError, AttributeError):
        org_uuid = _uuid.UUID("00000000-0000-0000-0000-000000000000")

    if org_id and str(org_id) != str(user.org_id):
        raise HTTPException(status_code=403, detail="Cross-org query is forbidden")
    query = select(AuditEventRecord).filter(AuditEventRecord.org_id == org_uuid)

    if action:
        query = query.filter(AuditEventRecord.action_taken == action.upper())

    if user_id:
        try:
            uid = _uuid.UUID(str(user_id))
            query = query.filter(AuditEventRecord.user_id == uid)
        except (ValueError, AttributeError):
            pass

    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            query = query.filter(AuditEventRecord.timestamp >= dt_from)
        except ValueError:
            pass

    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            query = query.filter(AuditEventRecord.timestamp <= dt_to)
        except ValueError:
            pass
=======
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List audit events from PostgreSQL."""
    query = select(AuditEventRecord).filter(AuditEventRecord.org_id == user.org_id)
    if action:
        query = query.filter(AuditEventRecord.action_taken == action)
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2

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
<<<<<<< HEAD
                "org_id": str(r.org_id),
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
                "user_id": str(r.user_id),
                "llm_provider": r.llm_provider,
                "risk_score": r.risk_score,
                "action_taken": r.action_taken,
                "tool_name": r.tool_name,
<<<<<<< HEAD
                "prompt_hash": r.prompt_hash,
                "request_duration_ms": r.request_duration_ms,
                "upstream_status_code": r.upstream_status_code,
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
<<<<<<< HEAD
=======
    org_id: str | None = None
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2

@router.post("/api/v1/shadow-ai/events")
async def ingest_shadow_ai_event(
    event: ShadowAIEventPayload,
<<<<<<< HEAD
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    try:
        org_uuid = uuid.UUID(str(user.org_id))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid org_id in token")
    alert = ShadowAIAlert(
        user_id=event.user_id or user.user_id,
        org_id=org_uuid,
=======
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    alert = ShadowAIAlert(
        user_id=event.user_id,
        org_id=event.org_id,
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
<<<<<<< HEAD
    import uuid as _uuid
    query = select(ShadowAIAlert)

    # Filter by org_id for multi-tenant isolation
    try:
        org_uuid = _uuid.UUID(str(user.org_id))
        query = query.filter(ShadowAIAlert.org_id == org_uuid)
    except (ValueError, AttributeError):
        pass
=======
    query = select(ShadowAIAlert)
    
    # Filter by org_id if available on the alert (some alerts might not have it mapped yet)
    # query = query.filter(ShadowAIAlert.org_id == user.org_id)
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2

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
<<<<<<< HEAD
                "org_id": str(r.org_id) if r.org_id else None,
=======
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
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
