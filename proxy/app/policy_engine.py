"""
Policy rule evaluator engine.
Loads org policy rules from cache/DB, evaluates incoming requests, returns decisions.
"""

from __future__ import annotations

import json
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from proxy.app.models import ActionType, PolicyDecision, UserContext
from proxy.app.auth import get_current_user

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1/policies", tags=["policies"])


# ─── In-memory policy store (replaced with DB in production) ─

_policy_store: list[dict[str, Any]] = [
    {
        "rule_id": "default-block-api-keys",
        "name": "Block API Key Leakage",
        "conditions": {
            "operator": "AND",
            "conditions": [
                {"field": "risk_score", "op": "gte", "value": 90},
                {"field": "detection.category", "op": "contains", "value": "API_KEY"},
            ],
        },
        "action": "BLOCK",
        "priority": 10,
        "enabled": True,
    },
    {
        "rule_id": "default-redact-pii",
        "name": "Redact PII in Prompts",
        "conditions": {
            "operator": "AND",
            "conditions": [
                {"field": "risk_score", "op": "gte", "value": 80},
                {"field": "detection.category", "op": "contains", "value": "PII"},
            ],
        },
        "action": "REDACT",
        "priority": 20,
        "enabled": True,
    },
    {
        "rule_id": "default-warn-credentials",
        "name": "Warn on Credential Detection",
        "conditions": {
            "operator": "OR",
            "conditions": [
                {"field": "risk_score", "op": "gte", "value": 60},
                {"field": "detection.category", "op": "contains", "value": "CREDENTIALS"},
            ],
        },
        "action": "WARN",
        "priority": 30,
        "enabled": True,
    },
]


# ─── Request Context ─────────────────────────────────────

class RequestContext(BaseModel):
    user_id: str = ""
    department: str = ""
    role: str = ""
    org_id: str = ""
    risk_score: int = 0
    detection_categories: list[str] = []
    tool_name: str = ""


# ─── Condition Evaluator ─────────────────────────────────

def _evaluate_condition(condition: dict[str, Any], ctx: RequestContext) -> bool:
    """Evaluate a single condition against request context."""
    field = condition.get("field", "")
    op = condition.get("op", "eq")
    value = condition.get("value")

    # Resolve field value from context
    if field == "risk_score":
        field_value: Any = ctx.risk_score
    elif field == "user.department":
        field_value = ctx.department
    elif field == "user.role":
        field_value = ctx.role
    elif field == "detection.category":
        field_value = ctx.detection_categories
    elif field == "tool_name":
        field_value = ctx.tool_name
    else:
        return False

    # Apply operator
    if op == "eq":
        return field_value == value
    elif op == "neq":
        return field_value != value
    elif op == "gt":
        return isinstance(field_value, (int, float)) and field_value > value
    elif op == "gte":
        return isinstance(field_value, (int, float)) and field_value >= value
    elif op == "lt":
        return isinstance(field_value, (int, float)) and field_value < value
    elif op == "lte":
        return isinstance(field_value, (int, float)) and field_value <= value
    elif op == "contains":
        if isinstance(field_value, list):
            return value in field_value
        return value in str(field_value)
    elif op == "not_contains":
        if isinstance(field_value, list):
            return value not in field_value
        return value not in str(field_value)
    elif op == "in":
        return field_value in (value if isinstance(value, list) else [value])
    elif op == "not_in":
        return field_value not in (value if isinstance(value, list) else [value])

    return False


def _evaluate_conditions(conditions_block: dict[str, Any], ctx: RequestContext) -> bool:
    """Evaluate a conditions block (AND/OR) recursively."""
    operator = conditions_block.get("operator", "AND")
    conditions = conditions_block.get("conditions", [])

    if not conditions:
        return True

    if operator == "AND":
        return all(_evaluate_condition(c, ctx) for c in conditions)
    elif operator == "OR":
        return any(_evaluate_condition(c, ctx) for c in conditions)
    return False


# ─── Policy Engine ────────────────────────────────────────

class PolicyEngine:
    """Evaluates incoming requests against organization policy rules."""

    def evaluate(self, ctx: RequestContext) -> PolicyDecision:
        """
        Evaluate request against policy rules.
        Rules sorted by priority (lower = higher priority); first match wins.
        """
        rules = sorted(
            [r for r in _policy_store if r.get("enabled", True)],
            key=lambda r: r.get("priority", 100),
        )

        for rule in rules:
            conditions = rule.get("conditions", {})
            if _evaluate_conditions(conditions, ctx):
                action = ActionType(rule["action"])
                log.info(
                    "policy.matched",
                    rule_id=rule["rule_id"],
                    rule_name=rule["name"],
                    action=action.value,
                )
                return PolicyDecision(
                    action=action,
                    matched_rule_id=rule["rule_id"],
                    reason=f"Matched policy: {rule['name']}",
                    risk_score=ctx.risk_score,
                )

        return PolicyDecision(
            action=ActionType.ALLOW,
            reason="No policy rules matched",
            risk_score=ctx.risk_score,
        )


policy_engine = PolicyEngine()


# ─── API Endpoints ────────────────────────────────────────

class PolicyRuleCreate(BaseModel):
    name: str
    description: str = ""
    conditions: dict[str, Any]
    action: str
    priority: int = 100
    enabled: bool = True


class PolicyRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    conditions: dict[str, Any] | None = None
    action: str | None = None
    priority: int | None = None
    enabled: bool | None = None


class PolicyTestRequest(BaseModel):
    risk_score: int = 0
    detection_categories: list[str] = []
    department: str = ""
    role: str = ""


@router.get("")
async def list_policies(user: UserContext = Depends(get_current_user)) -> list[dict[str, Any]]:
    """List all policy rules for the organization."""
    return [r for r in _policy_store if r.get("deleted_at") is None]


@router.post("")
async def create_policy(
    body: PolicyRuleCreate,
    user: UserContext = Depends(get_current_user),
) -> dict[str, Any]:
    """Create a new policy rule."""
    import uuid
    rule = {
        "rule_id": str(uuid.uuid4()),
        "name": body.name,
        "description": body.description,
        "conditions": body.conditions,
        "action": body.action,
        "priority": body.priority,
        "enabled": body.enabled,
    }
    _policy_store.append(rule)
    return rule


@router.post("/test")
async def test_policy(
    body: PolicyTestRequest,
    user: UserContext = Depends(get_current_user),
) -> PolicyDecision:
    """Test policy rules against a sample context."""
    ctx = RequestContext(
        risk_score=body.risk_score,
        detection_categories=body.detection_categories,
        department=body.department,
        role=body.role,
    )
    return policy_engine.evaluate(ctx)


@router.put("/{rule_id}")
async def update_policy(
    rule_id: str,
    body: PolicyRuleUpdate,
    user: UserContext = Depends(get_current_user),
) -> dict[str, Any]:
    """Update an existing policy rule."""
    for rule in _policy_store:
        if rule["rule_id"] == rule_id:
            if body.name is not None:
                rule["name"] = body.name
            if body.conditions is not None:
                rule["conditions"] = body.conditions
            if body.action is not None:
                rule["action"] = body.action
            if body.priority is not None:
                rule["priority"] = body.priority
            if body.enabled is not None:
                rule["enabled"] = body.enabled
            return rule
    raise HTTPException(status_code=404, detail="Policy rule not found")


@router.delete("/{rule_id}")
async def delete_policy(
    rule_id: str,
    user: UserContext = Depends(get_current_user),
) -> dict[str, str]:
    """Soft-delete a policy rule."""
    from datetime import datetime
    for rule in _policy_store:
        if rule["rule_id"] == rule_id:
            rule["deleted_at"] = datetime.utcnow().isoformat()
            rule["enabled"] = False
            return {"status": "deleted", "rule_id": rule_id}
    raise HTTPException(status_code=404, detail="Policy rule not found")
