from __future__ import annotations

import asyncio

from proxy.app.analytics_ingestor import run_policy_ingestor_forever


if __name__ == "__main__":
    asyncio.run(run_policy_ingestor_forever())
