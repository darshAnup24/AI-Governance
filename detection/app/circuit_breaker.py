from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


class CircuitBreakerOpenError(RuntimeError):
    def __init__(self, name: str) -> None:
        super().__init__(f"Circuit breaker open for {name}")
        self.name = name


@dataclass
class CircuitBreaker:
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

    name: str
    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    state: str = field(default=CLOSED, init=False)
    failure_count: int = field(default=0, init=False)
    last_failure_at: float | None = field(default=None, init=False)
    last_success_at: float | None = field(default=None, init=False)

    def _now(self) -> float:
        return time.time()

    def _transition_if_recovered(self) -> None:
        if self.state != self.OPEN or self.last_failure_at is None:
            return
        if (self._now() - self.last_failure_at) >= self.recovery_timeout:
            self.state = self.HALF_OPEN

    def record_success(self) -> None:
        self.last_success_at = self._now()
        self.failure_count = 0
        self.state = self.CLOSED

    def record_failure(self) -> None:
        self.failure_count += 1
        self.last_failure_at = self._now()
        if self.failure_count >= self.failure_threshold:
            self.state = self.OPEN

    def metrics(self) -> dict[str, Any]:
        self._transition_if_recovered()
        return {
            "name": self.name,
            "state": self.state,
            "failure_count": self.failure_count,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "last_failure_at": self.last_failure_at,
            "last_success_at": self.last_success_at,
        }
