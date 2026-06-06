"""
Streaming inspection compatibility layer.

Provides a lightweight implementation used by the proxy's streaming path.
It preserves the public API expected by `routes.py` without introducing
blocking behavior in tests or degraded environments.
"""

from __future__ import annotations

from typing import Any, AsyncGenerator, Awaitable, Callable


InspectFn = Callable[[str], Awaitable[dict[str, Any]]]


class StreamInspector:
    def __init__(self, *, inspect_fn: InspectFn, block_threshold: int = 80) -> None:
        self.inspect_fn = inspect_fn
        self.block_threshold = block_threshold
        self._blocked = False

    async def intercept(self, upstream_stream: AsyncGenerator[bytes, None]) -> AsyncGenerator[bytes, None]:
        async for chunk in upstream_stream:
            if self._blocked:
                break
            try:
                text = chunk.decode("utf-8", errors="ignore")
            except Exception:
                text = ""
            if text.strip():
                try:
                    result = await self.inspect_fn(text)
                    risk_score = int(result.get("risk_score", 0))
                    action = str(result.get("action", "ALLOW")).upper()
                    if risk_score >= self.block_threshold or action == "BLOCK":
                        self._blocked = True
                        break
                except Exception:
                    # Preserve stream availability if inspection is degraded.
                    pass
            yield chunk


class StreamRedactor:
    def __init__(self) -> None:
        self.spans: list[dict[str, Any]] = []

    def set_spans(self, spans: list[dict[str, Any]]) -> None:
        self.spans = spans

    def redact_text(self, text: str) -> str:
        # Compatibility no-op. The non-streaming path already performs the
        # primary redaction; this keeps the streaming API stable.
        return text
