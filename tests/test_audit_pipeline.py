from __future__ import annotations

from datetime import datetime, timezone

import pytest

from proxy.app.audit import AuditEmitter
from proxy.app.audit_consumer import (
    AuditConsumer,
    CONSUMER_GROUP,
    DEAD_LETTER_STREAM,
    MAX_RETRIES,
    RETRY_STREAM,
    STREAM_KEY,
)
from proxy.app.audit_replay import replay_dead_letters
from proxy.app.models import AuditEvent


class FakeRedis:
    def __init__(self, fail_xadd: bool = False) -> None:
        self.fail_xadd = fail_xadd
        self.streams: dict[str, list[tuple[str, dict[str, str]]]] = {}
        self.acks: list[tuple[str, str, tuple[str, ...]]] = []

    async def xadd(self, stream: str, data: dict[str, str], **_: object) -> str:
        if self.fail_xadd:
            raise RuntimeError("redis unavailable")
        msg_id = f"{len(self.streams.get(stream, [])) + 1}-0"
        self.streams.setdefault(stream, []).append((msg_id, dict(data)))
        return msg_id

    async def xack(self, stream: str, group: str, *message_ids: str) -> int:
        self.acks.append((stream, group, message_ids))
        return len(message_ids)

    async def xrange(self, stream: str, min: str = "-", max: str = "+", count: int = 100) -> list[tuple[str, dict[str, str]]]:
        del min, max
        return list(self.streams.get(stream, []))[:count]

    async def xdel(self, stream: str, message_id: str) -> int:
        messages = self.streams.get(stream, [])
        self.streams[stream] = [(msg_id, payload) for msg_id, payload in messages if msg_id != message_id]
        return 1

    async def xlen(self, stream: str) -> int:
        return len(self.streams.get(stream, []))

    async def xpending(self, stream: str, group: str) -> dict[str, int]:
        del stream, group
        return {"pending": 0}


@pytest.mark.asyncio
async def test_audit_emitter_falls_back_to_file(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    fallback_file = tmp_path / "audit_fallback.jsonl"
    monkeypatch.setenv("AUDIT_FALLBACK_FILE", str(fallback_file))
    emitter = AuditEmitter()
    event = AuditEvent(
        event_id="evt-1",
        timestamp=datetime.now(timezone.utc),
        org_id="org-1",
        user_id="user-1",
        prompt_hash="hash-1",
    )

    await emitter.emit(FakeRedis(fail_xadd=True), event)

    assert fallback_file.exists()
    content = fallback_file.read_text()
    assert '"event_id":"evt-1"' in content


@pytest.mark.asyncio
async def test_consumer_failed_message_goes_to_retry_before_dead_letter() -> None:
    consumer = AuditConsumer()
    redis = FakeRedis()
    payload = {"event_id": "evt-2", "retry_count": "0"}

    await consumer._handle_failed_message(redis, STREAM_KEY, "1-0", payload)

    assert RETRY_STREAM in redis.streams
    assert redis.streams[RETRY_STREAM][0][1]["retry_count"] == "1"
    assert redis.acks == [(STREAM_KEY, CONSUMER_GROUP, ("1-0",))]


@pytest.mark.asyncio
async def test_consumer_failed_message_dead_letters_after_max_retries() -> None:
    consumer = AuditConsumer()
    redis = FakeRedis()
    payload = {"event_id": "evt-3", "retry_count": str(MAX_RETRIES - 1)}

    await consumer._handle_failed_message(redis, STREAM_KEY, "2-0", payload)

    assert DEAD_LETTER_STREAM in redis.streams
    assert redis.streams[DEAD_LETTER_STREAM][0][1]["_dead_letter_reason"] == "max_retries_exceeded"


@pytest.mark.asyncio
async def test_replay_dead_letters_moves_events_to_retry_stream() -> None:
    redis = FakeRedis()
    await redis.xadd(DEAD_LETTER_STREAM, {"event_id": "evt-4", "retry_count": "2"})

    replayed = await replay_dead_letters(redis, limit=10)

    assert replayed == 1
    assert await redis.xlen(DEAD_LETTER_STREAM) == 0
    assert await redis.xlen(RETRY_STREAM) == 1
