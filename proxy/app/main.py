"""
AI Governance Firewall — Proxy Service
FastAPI application with lifespan management, middleware, and core routes.
"""

from __future__ import annotations

import asyncio
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import httpx
import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import generate_latest

from proxy.app.config import get_settings
from proxy.app.logging_config import setup_logging
from proxy.app.models import ProblemDetail, AirlockErrorDetail
from proxy.app.error_middleware import AirlockErrorMiddleware
from proxy.app.routes import router as proxy_router
from proxy.app.policy_engine import router as policy_router
from proxy.app.governance_api import router as governance_router
from proxy.app.api_key_routes import router as api_key_router
from proxy.app.tracing import get_tracer, force_flush, shutdown as otel_shutdown, add_span_event, record_exception
from proxy.app.metrics import (
    PROM_REGISTRY,
    AUDIT_QUEUE_DEPTH,
    UPSTREAM_LATENCY,
    UPSTREAM_ERRORS,
    CACHE_HITS,
    CACHE_MISSES,
    REQUEST_COUNT,
    REQUEST_LATENCY,
    DETECTION_HITS,
    DETECTION_LATENCY,
    POLICY_BLOCKS,
    SDK_VERBOSE_USAGE,
)

# ─── Globals ──────────────────────────────────────────────

settings = get_settings()
log = structlog.get_logger()

# ─── Lifespan ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application startup and shutdown lifecycle."""
    setup_logging(settings.log_level)
    log.info(
        "proxy.startup",
        environment=settings.environment,
        upstream_openai=settings.upstream_openai_url,
    )

    # Initialize OpenTelemetry
    tracer = get_tracer()
    with tracer.start_as_current_span("proxy.lifespan") as lifespan_span:
        lifespan_span.set_attribute("environment", settings.environment)
        lifespan_span.set_attribute("version", "0.1.0")

        # Create shared HTTP client
        app.state.http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=5.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )

        # Redis connection for async audit emitter + cache
        redis_url = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        try:
            from redis.asyncio import Redis as AsyncRedis
            app.state.redis = AsyncRedis.from_url(redis_url, decode_responses=True)
            await app.state.redis.ping()
            log.info("proxy.redis_connected")
        except Exception as e:
            log.warning("proxy.redis_init_failed", error=str(e))
            app.state.redis = None

        # Background audit consumer — reads audit:events stream → TimescaleDB
        audit_task: asyncio.Task | None = None
        if app.state.redis:
            try:
                from proxy.app.audit_consumer import run_consumer_forever
                audit_task = asyncio.create_task(
                    run_consumer_forever(app.state.redis)
                )
                log.info("proxy.audit_consumer_started")
            except Exception as e:
                log.warning("proxy.audit_consumer_init_failed", error=str(e))

        # Background analytics ingestor — reads durable Redis event streams → ClickHouse.
        # Degrade cleanly when Redis is unavailable instead of spawning a worker that
        # will fail during shutdown in local/tests.
        analytics_task: asyncio.Task | None = None
        if app.state.redis:
            try:
                from proxy.app.analytics_ingestor import run_ingestor_forever
                analytics_task = asyncio.create_task(
                    run_ingestor_forever()
                )
                log.info("proxy.analytics_ingestor_started")
            except Exception as e:
                log.warning("proxy.analytics_ingestor_init_failed", error=str(e))
        else:
            log.info("proxy.analytics_ingestor_skipped", reason="redis_unavailable")

    yield

    # Shutdown
    if audit_task:
        audit_task.cancel()
        try:
            await audit_task
        except asyncio.CancelledError:
            pass
    if analytics_task:
        analytics_task.cancel()
        try:
            await analytics_task
        except asyncio.CancelledError:
            pass
    await app.state.http_client.aclose()
    if app.state.redis:
        await app.state.redis.aclose()
    force_flush()
    otel_shutdown()
    log.info("proxy.shutdown")


# ─── App ──────────────────────────────────────────────────

app = FastAPI(
    title="AI Governance Firewall — Proxy",
    description="API proxy for LLM governance, detection, and compliance",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — exact origins for dashboard (need credentials) + regex for AI sites + Chrome extensions
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:5173",
        "http://dashboard:3000",
        "http://governance-ui:3000",
        "http://demo-ui:3001",
        "https://chatgpt.com",
        "https://claude.ai",
        "https://gemini.google.com",
        "https://copilot.microsoft.com",
        "https://www.bing.com",
        "https://poe.com",
    ],
    allow_origin_regex=(
        r"https?://(www\.)?(chatgpt\.com|claude\.ai|anthropic\.com|gemini\.google\.com"
        r"|copilot\.microsoft\.com|bing\.com|poe\.com|openai\.com)"
        r"|chrome-extension://[a-z]{32}"
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ─── Middleware ───────────────────────────────────────────

# Airlock Error Middleware enriches 403/4xx with diagnostics in verbose mode
app.add_middleware(
    AirlockErrorMiddleware,
    is_dev=settings.is_dev,
)

@app.middleware("http")
async def tracing_middleware(request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
    """Inject unique request ID, OTEL span, and metrics per request."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    tracer = get_tracer()
    span_attrs = {
        "http.method": request.method,
        "http.url": str(request.url),
        "http.target": request.url.path,
        "request_id": request_id,
        "user_agent": request.headers.get("user-agent", ""),
    }

    with tracer.start_as_current_span("proxy.request") as span:
        for k, v in span_attrs.items():
            span.set_attribute(k, v)

        start = time.perf_counter()
        try:
            response: Response = await call_next(request)
            duration = time.perf_counter() - start
            span.set_attribute("http.status_code", response.status_code)
            span.set_attribute("duration_ms", round(duration * 1000, 2))
        except Exception as exc:
            duration = time.perf_counter() - start
            record_exception(exc)
            span.set_attribute("error", True)
            raise
        finally:
            pass

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = f"{duration:.4f}s"

    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code,
    ).inc()
    REQUEST_LATENCY.labels(
        method=request.method,
        endpoint=request.url.path,
    ).observe(duration)

    log.info(
        "request.completed",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round(duration * 1000, 2),
    )
    return response


# ─── Global Exception Handler ────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return RFC 7807 Problem JSON for all unhandled exceptions."""
    log.error("unhandled_exception", error=str(exc), path=request.url.path, exc_info=exc)
    record_exception(exc, {"path": request.url.path})
    trace_id = request.headers.get("X-Request-ID", "")
    error_detail = AirlockErrorDetail(
        type="https://airlock.dev/errors/INTERNAL_ERROR",
        title="Internal Server Error",
        status=500,
        detail=str(exc) if settings.is_dev else "An unexpected error occurred",
        instance=str(request.url),
        trace_id=trace_id,
    )
    return JSONResponse(status_code=500, content=error_detail.model_dump())


# ─── Routes ──────────────────────────────────────────────

@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint for load balancers and orchestrators."""
    return {
        "status": "healthy",
        "service": "proxy",
        "version": "0.1.0",
        "environment": settings.environment,
    }


@app.get("/metrics")
async def metrics() -> Response:
    """Prometheus metrics endpoint."""
    return Response(
        content=generate_latest(PROM_REGISTRY),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


@app.get("/")
async def root() -> dict:
    """Root endpoint."""
    return {
        "service": "AI Governance Firewall — Proxy",
        "version": "0.1.0",
        "docs": "/docs",
    }


# Register all routers
app.include_router(proxy_router)
app.include_router(policy_router)
app.include_router(governance_router)
app.include_router(api_key_router)
