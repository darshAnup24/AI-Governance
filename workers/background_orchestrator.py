from __future__ import annotations

import asyncio

from proxy.app.analytics_ingestor import (
    run_incident_ingestor_forever,
    run_ingestor_forever,
    run_policy_ingestor_forever,
)


async def main() -> None:
    await asyncio.gather(
        run_ingestor_forever(),
        run_policy_ingestor_forever(),
        run_incident_ingestor_forever(),
    )


if __name__ == "__main__":
    asyncio.run(main())
