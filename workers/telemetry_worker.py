from __future__ import annotations

import asyncio

from proxy.app.analytics_ingestor import run_ingestor_forever


if __name__ == "__main__":
    asyncio.run(run_ingestor_forever())
