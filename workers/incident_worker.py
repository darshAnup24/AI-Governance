from __future__ import annotations

import asyncio
import structlog

from proxy.app.events.schema import EventStream
from proxy.app.events.worker import GenericStreamWorker, PlatformEventStore

log = structlog.get_logger()
incident_store = PlatformEventStore(stream=EventStream.INCIDENT_EVENTS)


async def _handle_incident_batch(events: list[dict]) -> bool:
    log.info("incident_worker.batch_processed", count=len(events))
    return await incident_store.persist(events)


async def main() -> None:
    worker = GenericStreamWorker(
        stream=EventStream.INCIDENT_EVENTS,
        consumer_group="incident-workers",
        consumer_prefix="incident",
        batch_handler=_handle_incident_batch,
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
