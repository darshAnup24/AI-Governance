from __future__ import annotations

import pytest

from proxy.app.clickhouse import ClickHouseWriter


@pytest.mark.asyncio
async def test_clickhouse_writer_ensures_rollup_schema() -> None:
    executed: list[str] = []
    writer = ClickHouseWriter(base_url="http://example.invalid")

    async def fake_execute(query: str) -> None:
        executed.append(query)

    writer._execute = fake_execute  # type: ignore[method-assign]

    await writer.ensure_telemetry_table()
    await writer.ensure_policy_table()
    await writer.ensure_incident_table()
    await writer.ensure_queue_metrics_table()

    ddl = "\n".join(executed)
    assert "telemetry_events_by_hour_mv" in ddl
    assert "policy_events_by_hour_mv" in ddl
    assert "incident_events_by_hour_mv" in ddl
    assert "queue_metrics_raw" in ddl

    await writer.close()
