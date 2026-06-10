"""
Governance API client — fetches org policy rules from the governance service
(Node.js/Prisma on port 4000) and normalises them into the format expected
by the proxy's PolicyEngine.

Condition schema from Dashboard UI:
  conditions: [{id, field, operator, value}, ...]   (array)
  logic: "AND" | "OR"                               (top-level field)

PolicyEngine expects:
  conditions: {operator: "AND"|"OR", conditions: [{field, op, value}]}
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import structlog

log = structlog.get_logger()

# ─── Field name mapping: governance UI → proxy engine ──────────────────────
_FIELD_MAP: dict[str, str] = {
    "riskScore":     "risk_score",
    "category":      "detection.category",
    "role":          "user.role",
    "userId":        "user_id",
    "orgId":         "org_id",
    "promptLength":  "prompt_length",
    "euAiActTier":   "eu_ai_act_tier",
}

# ─── Operator mapping: governance UI → proxy engine ────────────────────────
_OP_MAP: dict[str, str] = {
    "equals":     "eq",
    "not_equals": "neq",
    "gte":        "gte",
    "lte":        "lte",
    "contains":   "contains",
}

_NUMERIC_FIELDS = {"risk_score", "prompt_length"}


def _normalize_conditions(
    raw: list[dict[str, Any]],
    logic: str = "AND",
) -> dict[str, Any]:
    """Convert a governance UI conditions array into a proxy engine conditions block."""
    normalized: list[dict[str, Any]] = []
    for c in raw:
        field = _FIELD_MAP.get(c.get("field", ""), c.get("field", ""))
        op = _OP_MAP.get(c.get("operator", ""), c.get("operator", ""))
        raw_value = c.get("value", "")
        if field in _NUMERIC_FIELDS:
            try:
                value: Any = int(raw_value)
            except (ValueError, TypeError):
                try:
                    value = float(raw_value)
                except (ValueError, TypeError):
                    value = raw_value
        else:
            value = raw_value
        normalized.append({"field": field, "op": op, "value": value})
    return {"operator": logic.upper(), "conditions": normalized}


def normalize_governance_policy(p: dict[str, Any]) -> dict[str, Any]:
    """Translate a raw governance API policy record into proxy engine format."""
    raw_conditions = p.get("conditions", [])
    logic = p.get("logic", "AND")
    if not isinstance(raw_conditions, list):
        raw_conditions = []
    return {
        "rule_id":     p.get("id") or p.get("rule_id") or "",
        "name":        p.get("name", ""),
        "description": p.get("description", ""),
        "conditions":  _normalize_conditions(raw_conditions, logic),
        "action":      p.get("action", "ALLOW"),
        "priority":    p.get("priority", 100),
        "enabled":     p.get("enabled", True),
    }


# ─── In-memory cache: org_id → (policies, expires_at) ──────────────────────
_CACHE: dict[str, tuple[list[dict[str, Any]], float]] = {}


class GovernanceClient:
    """Async client that fetches policies from the governance service with TTL caching.

    Uses the internal service endpoint /api/internal/policies?org_id=<id>
    authenticated with X-Service-Token so no user JWT is needed.
    """

    def __init__(self, base_url: str, service_token: str, cache_ttl: int = 30) -> None:
        self._base_url = base_url.rstrip("/")
        self._service_token = service_token
        self._ttl = float(cache_ttl)

    def invalidate(self, org_id: str) -> None:
        """Force cache expiry for an org (call after policy create/update/delete)."""
        _CACHE.pop(org_id, None)

    async def fetch_policies(
        self,
        org_id: str,
        auth_header: str = "",  # kept for API compatibility, no longer forwarded
    ) -> list[dict[str, Any]]:
        """
        Return normalized, enabled policy rules for the org ordered by priority.
        Falls back to stale cache on network error; returns [] if no cache exists.
        """
        now = time.monotonic()
        cached_val, expires = _CACHE.get(org_id, (None, 0.0))
        if cached_val is not None and now < expires:
            return cached_val

        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(
                    f"{self._base_url}/api/internal/policies",
                    params={"org_id": org_id},
                    headers={"X-Service-Token": self._service_token},
                )
                resp.raise_for_status()
                raw: list[dict[str, Any]] = resp.json()
                policies = [normalize_governance_policy(p) for p in raw]
                _CACHE[org_id] = (policies, now + self._ttl)
                log.info(
                    "governance_client.fetched",
                    org_id=org_id,
                    count=len(policies),
                )
                return policies
        except Exception as exc:
            log.warning(
                "governance_client.fetch_failed",
                org_id=org_id,
                error=str(exc),
            )
            if cached_val is not None:
                return cached_val
            return []

    async def create_incident(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{self._base_url}/api/internal/incidents",
                headers={"X-Service-Token": self._service_token},
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()

    async def generate_incident_summary(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{self._base_url}/api/internal/advisor/incident-summary",
                headers={"X-Service-Token": self._service_token},
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()
