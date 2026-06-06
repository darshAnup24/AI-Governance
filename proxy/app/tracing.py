"""
Minimal tracing compatibility layer.

The proxy was wired for OpenTelemetry helpers, but the local module was missing.
These shims preserve the public functions used across the app while degrading
gracefully when no OTEL SDK is configured.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator


class _NoopSpan:
    def __enter__(self) -> "_NoopSpan":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        return False

    def set_attribute(self, key: str, value: Any) -> None:
        del key, value

    def add_event(self, name: str, attributes: dict[str, Any] | None = None) -> None:
        del name, attributes

    def record_exception(self, exc: Exception) -> None:
        del exc


class _NoopTracer:
    def start_as_current_span(self, name: str) -> _NoopSpan:
        del name
        return _NoopSpan()


_TRACER = _NoopTracer()


def get_tracer() -> _NoopTracer:
    return _TRACER


@contextmanager
def span(name: str) -> Iterator[_NoopSpan]:
    yield _TRACER.start_as_current_span(name)


def add_span_event(name: str, attributes: dict[str, Any] | None = None) -> None:
    del name, attributes


def record_exception(exc: Exception, attributes: dict[str, Any] | None = None) -> None:
    del exc, attributes


def force_flush() -> None:
    return None


def shutdown() -> None:
    return None
