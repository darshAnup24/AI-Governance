"""
AI Governance Firewall — Proxy Service
FastAPI application with lifespan management, middleware, and core routes.
"""

from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import httpx
import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CollectorRegistry, Counter, Histogram, generate_latest

from proxy.app.config import get_settings
from proxy.app.database import engine
from proxy.app.db_models import Base
from proxy.app.logging_config import setup_logging
from proxy.app.models import ProblemDetail
from proxy.app.routes import router as proxy_router
from proxy.app.policy_engine import router as policy_router

# ─── Globals ──────────────────────────────────────────────

settings = get_settings()
log = structlog.get_logger()

# Prometheus metrics
prom_registry = CollectorRegistry()
REQUEST_COUNT = Counter(
    "proxy_requests_total",
    "Total proxy requests",
    ["method", "endpoint", "status"],
    registry=prom_registry,
)
REQUEST_LATENCY = Histogram(
    "proxy_request_duration_seconds",
    "Request duration in seconds",
    ["method", "endpoint"],
    registry=prom_registry,
)


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

    # Create shared HTTP client
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=5.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    )

    # Redis connection — required for audit queue and rate limiting
    try:
        import redis.asyncio as aioredis
        app.state.redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        # Verify connection
        await app.state.redis.ping()
        log.info("proxy.redis_connected", url=settings.redis_url)
    except Exception as e:
        log.warning("proxy.redis_unavailable", error=str(e))
        app.state.redis = None

    # Ensure DB tables exist in dev/local runs.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    # Shutdown
    await app.state.http_client.aclose()
    if app.state.redis:
        await app.state.redis.aclose()
    log.info("proxy.shutdown")


# ─── App ──────────────────────────────────────────────────

app = FastAPI(
    title="AI Governance Firewall — Proxy",
    description="API proxy for LLM governance, detection, and compliance",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://dashboard:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Middleware ───────────────────────────────────────────

@app.middleware("http")
async def request_id_middleware(request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
    """Inject a unique request ID into every request."""
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    start = time.perf_counter()
    response: Response = await call_next(request)
    duration = time.perf_counter() - start

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
    problem = ProblemDetail(
        type="https://ai-governance.dev/errors/internal",
        title="Internal Server Error",
        status=500,
        detail=str(exc) if settings.is_dev else "An unexpected error occurred",
        instance=str(request.url),
    )
    return JSONResponse(status_code=500, content=problem.model_dump())


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
        content=generate_latest(prom_registry),
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


# Register proxy routes
app.include_router(proxy_router)
app.include_router(policy_router)
