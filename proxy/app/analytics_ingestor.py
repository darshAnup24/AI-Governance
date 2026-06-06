from __future__ import annotations

import structlog

from proxy.app.clickhouse import ClickHouseWriter
from proxy.app.events.schema import EventStream
from proxy.app.events.worker import GenericStreamWorker

log = structlog.get_logger()
clickhouse_writer = ClickHouseWriter()


async def _handle_telemetry_batch(events: list[dict]) -> bool:
    try:
        await clickhouse_writer.write_telemetry_events(events)
    except Exception as exc:
        log.warning("telemetry_worker.clickhouse_degraded", error=str(exc), count=len(events))
    return True


async def _handle_policy_batch(events: list[dict]) -> bool:
    try:
        await clickhouse_writer.write_policy_events(events)
    except Exception as exc:
        log.warning("policy_worker.clickhouse_degraded", error=str(exc), count=len(events))
    return True


async def _handle_incident_batch(events: list[dict]) -> bool:
    try:
        await clickhouse_writer.write_incident_events(events)
    except Exception as exc:
        log.warning("incident_worker.clickhouse_degraded", error=str(exc), count=len(events))
    return True


async def run_ingestor_forever() -> None:
    worker = GenericStreamWorker(
        stream=EventStream.TELEMETRY_EVENTS,
        consumer_group="telemetry-workers",
        consumer_prefix="telemetry",
        batch_handler=_handle_telemetry_batch,
    )
    await worker.run()


async def run_policy_ingestor_forever() -> None:
    worker = GenericStreamWorker(
        stream=EventStream.POLICY_EVENTS,
        consumer_group="policy-analytics-workers",
        consumer_prefix="policy-analytics",
        batch_handler=_handle_policy_batch,
    )
    await worker.run()


async def run_incident_ingestor_forever() -> None:
    worker = GenericStreamWorker(
        stream=EventStream.INCIDENT_EVENTS,
        consumer_group="incident-analytics-workers",
        consumer_prefix="incident-analytics",
        batch_handler=_handle_incident_batch,
    )
    await worker.run()
