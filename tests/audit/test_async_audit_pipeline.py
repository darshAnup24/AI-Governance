from __future__ import annotations

from datetime import datetime, timezone

import pytest

from proxy.app.audit import AuditEmitter
from proxy.app.models import AuditEvent


class FailingRedis:
    async def xadd(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        raise RuntimeError("redis down")


@pytest.mark.asyncio
async def test_async_audit_pipeline_falls_back_when_redis_fails(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUDIT_FALLBACK_FILE", str(tmp_path / "audit.jsonl"))
    emitter = AuditEmitter()
    event = AuditEvent(
        event_id="evt-async-1",
        timestamp=datetime.now(timezone.utc),
        org_id="org-1",
        workspace_id="ws-1",
        user_id="user-1",
        trace_id="trace-1",
    )

    await emitter.emit(FailingRedis(), event)

    assert (tmp_path / "audit.jsonl").exists()
