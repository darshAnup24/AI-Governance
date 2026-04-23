"""
JWT authentication middleware and rate limiter for the proxy service.
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from fastapi import Depends, HTTPException, Request

from proxy.app.config import Settings, get_settings
from proxy.app.models import UserContext
from proxy.app.security import read_secret

log = structlog.get_logger()


# ─── JWT Auth Dependency ─────────────────────────────────

class JWTAuth:
    """Validates JWT tokens from corporate IdP. In dev mode, accepts simple dev tokens."""

    def __init__(self) -> None:
        self._jwks_cache: dict[str, Any] | None = None
        self._jwks_cache_time: float = 0
        self._jwks_cache_ttl: float = 3600  # 1 hour

    async def _get_jwks(self, settings: Settings) -> dict[str, Any]:
        """Fetch and cache JWKS from IdP."""
        now = time.time()
        if self._jwks_cache and (now - self._jwks_cache_time) < self._jwks_cache_ttl:
            return self._jwks_cache

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(settings.jwks_url, timeout=5.0)
                resp.raise_for_status()
                self._jwks_cache = resp.json()
                self._jwks_cache_time = now
                return self._jwks_cache
        except Exception as e:
            log.warning("jwks_fetch_failed", error=str(e))
            if self._jwks_cache:
                return self._jwks_cache
            raise HTTPException(status_code=503, detail="Auth service unavailable")

    def _decode_dev_token(self, token: str, settings: Settings) -> UserContext:
        """Decode a development-mode token (not for production)."""
        # Dev tokens: "dev-token-<base64-email>" or any Bearer token in dev mode
        import base64

        if token.startswith("dev-token-"):
            try:
                email = base64.b64decode(token[10:]).decode()
            except Exception:
                email = "dev@company.com"
        else:
            email = "dev@company.com"

        org_hint = hashlib.sha256(
            read_secret(settings.dev_jwt_secret, settings.dev_jwt_secret_file).encode("utf-8")
        ).hexdigest()[:12]
        return UserContext(
            user_id="dev-user-001",
            email=email,
            department="engineering",
            role="admin",
            permissions=["read", "write", "admin"],
            org_id=f"00000000-0000-0000-0000-{org_hint}",
        )

    async def __call__(
        self,
        request: Request,
        settings: Settings = Depends(get_settings),
    ) -> UserContext:
        """Extract and validate JWT, returning UserContext."""
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

        token = auth_header[7:]

        # Dev mode: accept any token
        if settings.is_dev:
            return self._decode_dev_token(token, settings)

        # Production: validate JWT with JWKS
        try:
            from jose import jwt as jose_jwt, JWTError

            jwks = await self._get_jwks(settings)
            # Try each key in JWKS
            for key in jwks.get("keys", []):
                try:
                    payload = jose_jwt.decode(
                        token,
                        key,
                        algorithms=[settings.jwt_algorithm],
                        audience=settings.jwt_audience,
                        issuer=settings.jwt_issuer,
                    )
                    org_id = payload.get("org_id", "")
                    if not org_id:
                        raise HTTPException(status_code=401, detail="Token missing org_id")
                    return UserContext(
                        user_id=payload.get("sub", ""),
                        email=payload.get("email", ""),
                        department=payload.get("department", ""),
                        role=payload.get("role", "user"),
                        permissions=payload.get("permissions", []),
                        org_id=org_id,
                    )
                except JWTError:
                    continue

            raise HTTPException(status_code=401, detail="Invalid token signature")
        except HTTPException:
            raise
        except Exception as e:
            log.error("jwt_validation_error", error=str(e))
            raise HTTPException(status_code=401, detail="Token validation failed")


# Singleton instance
jwt_auth = JWTAuth()


async def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> UserContext:
    """FastAPI dependency to get the current authenticated user."""
    return await jwt_auth(request, settings)


# ─── Rate Limiter ────────────────────────────────────────

class RateLimiter:
    """Sliding window rate limiter using Redis.
    
    Limits both requests-per-minute (RPM) and tokens-per-minute (TPM)
    at user and department levels.
    """

    def __init__(self) -> None:
        self._window_seconds = 60

    def _get_redis(self, request: Request) -> Any:
        """Get Redis client from app state."""
        redis = getattr(request.app.state, "redis", None)
        if redis is None:
            # Rate limiting is disabled when Redis is not available
            return None
        return redis

    async def check_rate_limit(
        self,
        request: Request,
        user: UserContext,
        token_count: int = 0,
        settings: Settings = Depends(get_settings),
    ) -> None:
        """Check and enforce rate limits. Raises 429 if exceeded."""
        redis = self._get_redis(request)
        if redis is None:
            return  # Rate limiting disabled without Redis

        now = time.time()
        window_start = now - self._window_seconds

        # Keys for rate limiting
        user_rpm_key = f"ratelimit:rpm:user:{user.user_id}"
        dept_rpm_key = f"ratelimit:rpm:dept:{user.department}"
        user_tpm_key = f"ratelimit:tpm:user:{user.user_id}"
        dept_tpm_key = f"ratelimit:tpm:dept:{user.department}"

        try:
            pipe = redis.pipeline(transaction=True)

            # Clean old entries and add new one for user RPM
            pipe.zremrangebyscore(user_rpm_key, 0, window_start)
            pipe.zadd(user_rpm_key, {f"{now}": now})
            pipe.zcard(user_rpm_key)
            pipe.expire(user_rpm_key, self._window_seconds + 10)

            # Department RPM
            pipe.zremrangebyscore(dept_rpm_key, 0, window_start)
            pipe.zadd(dept_rpm_key, {f"{now}:{user.user_id}": now})
            pipe.zcard(dept_rpm_key)
            pipe.expire(dept_rpm_key, self._window_seconds + 10)

            results = await pipe.execute()

            user_rpm_count = results[2]
            dept_rpm_count = results[6]

            # Check RPM limits
            if user_rpm_count > settings.rate_limit_user_rpm:
                retry_after = int(self._window_seconds - (now - window_start))
                raise HTTPException(
                    status_code=429,
                    detail=f"User rate limit exceeded: {user_rpm_count}/{settings.rate_limit_user_rpm} RPM",
                    headers={"Retry-After": str(max(1, retry_after))},
                )

            if dept_rpm_count > settings.rate_limit_dept_rpm:
                raise HTTPException(
                    status_code=429,
                    detail=f"Department rate limit exceeded: {dept_rpm_count}/{settings.rate_limit_dept_rpm} RPM",
                    headers={"Retry-After": str(max(1, int(self._window_seconds)))},
                )

            # Track token usage if tokens provided
            if token_count > 0:
                pipe2 = redis.pipeline(transaction=True)
                pipe2.incrbyfloat(user_tpm_key, token_count)
                pipe2.expire(user_tpm_key, self._window_seconds + 10)
                pipe2.incrbyfloat(dept_tpm_key, token_count)
                pipe2.expire(dept_tpm_key, self._window_seconds + 10)
                tpm_results = await pipe2.execute()

                user_tpm = int(float(tpm_results[0]))
                dept_tpm = int(float(tpm_results[2]))

                if user_tpm > settings.rate_limit_user_tpm:
                    raise HTTPException(
                        status_code=429,
                        detail=f"User token limit exceeded: {user_tpm}/{settings.rate_limit_user_tpm} TPM",
                    )
                if dept_tpm > settings.rate_limit_dept_tpm:
                    raise HTTPException(
                        status_code=429,
                        detail=f"Department token limit exceeded: {dept_tpm}/{settings.rate_limit_dept_tpm} TPM",
                    )

        except HTTPException:
            raise
        except Exception as e:
            # Rate limiting should never block requests on Redis failure
            log.warning("rate_limit_check_failed", error=str(e))


rate_limiter = RateLimiter()
