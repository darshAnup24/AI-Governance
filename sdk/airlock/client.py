from __future__ import annotations

import json
import os
from typing import Any

import httpx

from airlock.exceptions import (
    AirlockAuthenticationError,
    AirlockInternalError,
    AirlockRateLimitError,
    AirlockRejectionError,
    AirlockUpstreamError,
)


class _Completions:
    def __init__(self, client: AirlockClient) -> None:
        self._client = client

    def create(self, **kwargs: Any) -> dict[str, Any]:
        return self._client._request("POST", "/v1/chat/completions", json=kwargs)

    async def acreate(self, **kwargs: Any) -> dict[str, Any]:
        return await self._client._arequest("POST", "/v1/chat/completions", json=kwargs)


class _Chat:
    def __init__(self, client: AirlockClient) -> None:
        self.completions = _Completions(client)


class AirlockClient:
    """Drop-in OpenAI-compatible client for the Airlock AI Governance proxy.

    Usage:
        with AirlockClient(api_key="sk-...", base_url="http://localhost:8000") as client:
            resp = client.chat.completions.create(model="gpt-4", messages=[...])
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str | None = None,
        verbose_errors: bool = False,
        timeout: float = 30.0,
        max_retries: int = 0,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("AIRLOCK_API_KEY", "")
        self.base_url = (base_url or os.environ.get("AIRLOCK_BASE_URL", "http://localhost:8000")).rstrip("/")
        self.verbose_errors = verbose_errors
        self.timeout = timeout
        self.max_retries = max_retries
        self.extra_headers = extra_headers or {}
        self._client: httpx.Client | None = None
        self._async_client: httpx.AsyncClient | None = None
        self.chat = _Chat(self)

    def _get_headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            **self.extra_headers,
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if self.verbose_errors:
            headers["X-Airlock-Verbose"] = "true"
        return headers

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self.base_url}{path}"
        headers = self._get_headers()
        if self._client is None:
            self._client = httpx.Client(
                base_url=self.base_url,
                headers=headers,
                timeout=self.timeout,
            )
        for attempt in range(max(1, self.max_retries + 1)):
            try:
                resp = self._client.request(method, path, headers=headers, **kwargs)
                return self._handle_response(resp)
            except (AirlockRejectionError, AirlockAuthenticationError, AirlockRateLimitError):
                raise
            except httpx.TimeoutException as e:
                if attempt < self.max_retries:
                    continue
                raise AirlockUpstreamError(f"Request timed out after {self.timeout}s", raw_response=str(e))
            except httpx.HTTPStatusError as e:
                if attempt < self.max_retries and e.response.status_code >= 500:
                    continue
                raise

    async def _arequest(self, method: str, path: str, **kwargs: Any) -> Any:
        url = f"{self.base_url}{path}"
        headers = self._get_headers()
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=self.timeout,
            )
        for attempt in range(max(1, self.max_retries + 1)):
            try:
                resp = await self._async_client.request(method, path, headers=headers, **kwargs)
                return self._handle_response(resp)
            except (AirlockRejectionError, AirlockAuthenticationError, AirlockRateLimitError):
                raise
            except httpx.TimeoutException as e:
                if attempt < self.max_retries:
                    continue
                raise AirlockUpstreamError(f"Request timed out after {self.timeout}s", raw_response=str(e))
            except httpx.HTTPStatusError as e:
                if attempt < self.max_retries and e.response.status_code >= 500:
                    continue
                raise

    def _handle_response(self, resp: httpx.Response) -> Any:
        try:
            data = resp.json()
        except (json.JSONDecodeError, httpx.DecodingError):
            data = {"raw_text": resp.text}

        if resp.is_success:
            return data

        status = resp.status_code
        if status == 403:
            raise AirlockRejectionError(
                data.get("detail", data.get("title", "Request blocked")),
                status_code=status,
                raw_response=data,
            )
        elif status == 401:
            raise AirlockAuthenticationError(
                data.get("detail", "Authentication failed"),
                status_code=status,
                raw_response=data,
            )
        elif status == 429:
            retry_after = float(resp.headers.get("retry-after", 0))
            raise AirlockRateLimitError(
                data.get("detail", "Rate limited"),
                status_code=status,
                raw_response=data,
                retry_after=retry_after,
            )
        elif 500 <= status < 600:
            if status in (502, 504):
                raise AirlockUpstreamError(
                    data.get("detail", "Upstream LLM provider error"),
                    status_code=status,
                    raw_response=data,
                )
            raise AirlockInternalError(
                data.get("detail", "Internal server error"),
                status_code=status,
                raw_response=data,
            )
        resp.raise_for_status()
        return data

    def __enter__(self) -> AirlockClient:
        return self

    def __exit__(self, *args: Any) -> None:
        if self._client:
            self._client.close()
        if self._async_client:
            import asyncio
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                pass  # no event loop
            else:
                self._async_client.aclose()

    async def __aenter__(self) -> AirlockClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._async_client:
            await self._async_client.aclose()
        if self._client:
            self._client.close()
