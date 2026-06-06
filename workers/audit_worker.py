from __future__ import annotations

import asyncio

from proxy.app.audit_consumer import main


if __name__ == "__main__":
    asyncio.run(main())
