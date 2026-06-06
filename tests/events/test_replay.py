from __future__ import annotations

import pytest

from proxy.app.events.replay import inspect_stream, replay_stream


class FakeRedis:
    def __init__(self) -> None:
        self.streams: dict[str, list[tuple[str, dict[str, str]]]] = {}

    async def xadd(self, stream: str, data: dict[str, str], **_: object) -> str:
        msg_id = f"{len(self.streams.get(stream, [])) + 1}-0"
        self.streams.setdefault(stream, []).append((msg_id, dict(data)))
        return msg_id

    async def xrange(
        self,
        stream: str,
        min: str = "-",
        max: str = "+",
        count: int = 100,
    ) -> list[tuple[str, dict[str, str]]]:
        del min, max
        return list(self.streams.get(stream, []))[:count]

    async def xdel(self, stream: str, message_id: str) -> int:
        self.streams[stream] = [
            (msg_id, payload)
            for msg_id, payload in self.streams.get(stream, [])
            if msg_id != message_id
        ]
        return 1


@pytest.mark.asyncio
async def test_inspect_stream_returns_message_ids_and_fields() -> None:
    redis = FakeRedis()
    await redis.xadd("audit_events_dlq", {"event_id": "evt-1", "retry_count": "2"})

    records = await inspect_stream(redis, "audit_events_dlq", limit=10)

    assert records == [
        {
            "message_id": "1-0",
            "fields": {"event_id": "evt-1", "retry_count": "2"},
        }
    ]


@pytest.mark.asyncio
async def test_replay_stream_moves_messages_and_resets_retry_count() -> None:
    redis = FakeRedis()
    await redis.xadd("audit_events_dlq", {"event_id": "evt-2", "retry_count": "9"})

    replayed = await replay_stream(
        redis,
        source_stream="audit_events_dlq",
        destination_stream="audit_events_retry",
        limit=10,
    )

    assert replayed == 1
    assert redis.streams["audit_events_dlq"] == []
    assert redis.streams["audit_events_retry"][0][1]["retry_count"] == "0"
    assert redis.streams["audit_events_retry"][0][1]["_replayed_from"] == "audit_events_dlq"
