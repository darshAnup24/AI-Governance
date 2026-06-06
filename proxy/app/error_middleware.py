"""
Error enrichment middleware for the proxy service.

The historical app wiring expected an AirlockErrorMiddleware module, but the
implementation had been lost while the rest of the app still referenced it.
This middleware keeps startup/import compatibility and upgrades plain 4xx/5xx
JSON responses into RFC7807-style payloads when the route did not already
produce one.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from proxy.app.models import AirlockErrorDetail


class AirlockErrorMiddleware(BaseHTTPMiddleware):
    """Normalize error responses into structured Airlock problem documents."""

    def __init__(self, app: Any, *, is_dev: bool = False) -> None:
        super().__init__(app)
        self.is_dev = is_dev

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        response = await call_next(request)
        return await self._maybe_enrich_response(request, response)

    async def _maybe_enrich_response(self, request: Request, response: Response) -> Response:
        if response.status_code < 400:
            return response

        # Streaming responses do not expose a buffered body and should pass
        # through untouched.
        if not hasattr(response, "body"):
            return response

        content_type = response.headers.get("content-type", "")
        if "application/problem+json" in content_type:
            return response

        body = await response.body()
        payload = _safe_json_loads(body)

        if isinstance(payload, dict) and {"title", "status", "type"}.issubset(payload):
            return response

        trace_id = request.headers.get("X-Request-ID", "")
        detail = ""
        title = HTTPStatus(response.status_code).phrase if response.status_code in HTTPStatus._value2member_map_ else "Request Failed"

        if isinstance(payload, dict):
            detail = str(
                payload.get("detail")
                or payload.get("message")
                or payload.get("error")
                or ""
            )
            title = str(payload.get("title") or title)
        elif isinstance(payload, str):
            detail = payload

        if not detail and self.is_dev and body:
            detail = body.decode("utf-8", errors="replace")

        problem = AirlockErrorDetail(
            type=f"https://airlock.dev/errors/{response.status_code}",
            title=title,
            status=response.status_code,
            detail=detail,
            instance=str(request.url),
            trace_id=trace_id,
        )
        enriched = JSONResponse(
            status_code=response.status_code,
            content=problem.model_dump(),
            media_type="application/problem+json",
        )
        for key, value in response.headers.items():
            if key.lower() not in {"content-length", "content-type"}:
                enriched.headers[key] = value
        return enriched


def _safe_json_loads(body: bytes) -> dict[str, Any] | list[Any] | str | None:
    if not body:
        return None
    try:
        import json

        return json.loads(body)
    except Exception:
        try:
            return body.decode("utf-8", errors="replace")
        except Exception:
            return None
