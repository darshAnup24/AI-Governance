"""
Sprint 4 — Active DNS Sinkhole for Shadow AI
=============================================
Unlike VerifyWise (which just logs shadow AI events from DNS logs),
ShieldAI actively intercepts DNS queries for unauthorized AI domains and
redirects them through the ShieldAI proxy — transparently wrapping usage
in corporate governance policies WITHOUT requiring browser extensions.

Architecture:
  - Runs a lightweight DNS server (dnslib) on UDP port 5353 (internally)
  - Authoritative only for AI tool domains listed in ai_domains.yaml
  - For unauthorized domains: returns the ShieldAI proxy IP
  - For authorized domains: forwards to upstream DNS (pass-through)
  - Every sinkholed query generates a ShadowAI alert pushed to the proxy

How it integrates:
  - Run as a sidecar container: `python -m detection.app.dns_sinkhole`
  - Corporate DHCP/DNS points to this service as the secondary resolver
  - Or: Kubernetes CoreDNS policy routes AI domain queries here

Configuration (env vars):
  DNS_UPSTREAM          Upstream DNS resolver (default: 8.8.8.8)
  DNS_PORT              Port to listen on (default: 5353)
  DNS_SINKHOLE_IP       IP to return for sinkholed domains (ShieldAI proxy IP)
  PROXY_ALERT_URL       URL to POST shadow AI alerts to (default: http://proxy:8000)
  SINKHOLE_PASSTHROUGH  Set to "true" to disable blocking and only log (safe mode)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
from datetime import datetime
from typing import Any

log = logging.getLogger("dns_sinkhole")

DNS_UPSTREAM = os.getenv("DNS_UPSTREAM", "8.8.8.8")
DNS_PORT = int(os.getenv("DNS_PORT", "5353"))
DNS_SINKHOLE_IP = os.getenv("DNS_SINKHOLE_IP", "127.0.0.1")
PROXY_ALERT_URL = os.getenv("PROXY_ALERT_URL", "http://proxy:8000")
PASSTHROUGH_MODE = os.getenv("SINKHOLE_PASSTHROUGH", "false").lower() == "true"


async def _post_shadow_alert(domain: str, client_ip: str, tool_name: str, category: str) -> None:
    """POST a shadow AI alert to the proxy service in the background."""
    try:
        import httpx
        payload = {
            "user_id": client_ip,
            "tool_name": tool_name,
            "domain": domain,
            "category": category,
            "is_authorized": False,
            "timestamp": datetime.utcnow().isoformat(),
        }
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{PROXY_ALERT_URL}/api/v1/shadow-ai/events",
                json=payload,
                timeout=2.0,
            )
        log.info(f"shadow_alert posted: {domain} from {client_ip}")
    except Exception as exc:
        log.warning(f"shadow_alert failed: {exc}")


def _resolve_upstream(query_name: str, qtype: int) -> bytes | None:
    """
    Forward a DNS query to the upstream resolver and return raw response bytes.
    Simple UDP query via socket — no dependencies beyond stdlib.
    """
    try:
        import dnslib
        qname = dnslib.DNSLabel(query_name)
        q = dnslib.DNSRecord.question(str(qname), dnslib.QTYPE[qtype] if qtype in dnslib.QTYPE.reverse else "A")
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(2.0)
        sock.sendto(q.pack(), (DNS_UPSTREAM, 53))
        data, _ = sock.recvfrom(4096)
        sock.close()
        return data
    except Exception as exc:
        log.warning(f"upstream dns failed for {query_name}: {exc}")
        return None


class DNSSinkholeProtocol(asyncio.DatagramProtocol):
    """
    Asyncio UDP datagram protocol implementing the DNS sinkhole.
    """

    def __init__(self, registry: Any) -> None:
        self.registry = registry
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.DatagramTransport) -> None:  # type: ignore[override]
        self.transport = transport
        log.info(f"DNS sinkhole listening on UDP :{DNS_PORT}")

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        asyncio.create_task(self._handle(data, addr))

    async def _handle(self, data: bytes, addr: tuple[str, int]) -> None:
        try:
            import dnslib
            request = dnslib.DNSRecord.parse(data)
        except Exception:
            return

        client_ip = addr[0]
        reply = request.reply()

        for question in request.questions:
            qname = str(question.qname).rstrip(".")

            if self.registry.is_shadow_ai(qname):
                tool = self.registry.get_tool_name(qname)
                cat = self.registry.get_category(qname).value

                log.warning(f"SINKHOLED: {qname} from {client_ip} → {tool}")

                # Fire-and-forget alert to proxy
                asyncio.create_task(_post_shadow_alert(qname, client_ip, tool, cat))

                if not PASSTHROUGH_MODE:
                    # Return ShieldAI proxy IP — traffic goes through governance
                    import dnslib
                    reply.add_answer(
                        dnslib.RR(
                            qname,
                            dnslib.QTYPE.A,
                            rdata=dnslib.A(DNS_SINKHOLE_IP),
                            ttl=30,
                        )
                    )
                    if self.transport:
                        self.transport.sendto(reply.pack(), addr)
                    return
                # PASSTHROUGH_MODE: log only, forward normally
            else:
                # Authorized or non-AI domain → forward upstream
                pass

        # Forward to upstream DNS
        upstream_response = await asyncio.get_event_loop().run_in_executor(
            None, _resolve_upstream, qname, question.qtype
        )
        if upstream_response and self.transport:
            self.transport.sendto(upstream_response, addr)


async def run_sinkhole() -> None:
    """Start the DNS sinkhole event loop."""
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
    from detection.app.shadow_ai import AIDomainRegistry
    registry = AIDomainRegistry()

    loop = asyncio.get_event_loop()
    transport, _ = await loop.create_datagram_endpoint(
        lambda: DNSSinkholeProtocol(registry),
        local_addr=("0.0.0.0", DNS_PORT),
    )
    log.info(f"DNS Sinkhole active on :{DNS_PORT}. Upstream: {DNS_UPSTREAM}. Sinkhole IP: {DNS_SINKHOLE_IP}")
    try:
        await asyncio.sleep(float("inf"))
    finally:
        transport.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [dns_sinkhole] %(levelname)s %(message)s",
    )
    try:
        import dnslib  # noqa: F401
    except ImportError:
        print("ERROR: dnslib is required. Run: pip install dnslib")
        raise SystemExit(1)
    asyncio.run(run_sinkhole())
