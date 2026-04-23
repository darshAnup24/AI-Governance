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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from proxy.app.database import get_db
from proxy.app.db_models import PolicyRule as DBPolicyRule
import uuid
from datetime import datetime


# ─── In-memory policy cache ──────────────────────────────────
# Mapping from org_id (str) to list of policy dicts
_policy_cache: dict[str, list[dict[str, Any]]] = {}

async def load_policies_for_org(org_id: str, db: AsyncSession) -> list[dict[str, Any]]:
    """Load policy rules for an org from DB and update cache."""
    try:
        org_uuid = uuid.UUID(str(org_id))
    except (ValueError, AttributeError):
        org_uuid = uuid.UUID("00000000-0000-0000-0000-000000000000")

    query = select(DBPolicyRule).filter(
        DBPolicyRule.org_id == org_uuid,
        DBPolicyRule.deleted_at.is_(None)
    ).order_by(DBPolicyRule.priority)


    result = await db.execute(query)
    records = result.scalars().all()
    rules = []
    for r in records:
        rules.append({
            "rule_id": str(r.rule_id),
            "name": r.name,
            "description": r.description or "",
            "conditions": r.conditions,
            "action": r.action,
            "priority": r.priority,
            "enabled": r.enabled,
        })
    _policy_cache[str(org_id)] = rules
    return rules



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

    def evaluate(self, ctx: RequestContext, rules: list[dict[str, Any]] | None = None) -> PolicyDecision:
        """
        Evaluate request against policy rules.
        Rules sorted by priority (lower = higher priority); first match wins.
        """
        if rules is None:
            rules = sorted(
                [r for r in _policy_cache.get(ctx.org_id, []) if r.get("enabled", True)],
                key=lambda r: r.get("priority", 100),
            )
        else:
            rules = sorted(
                [r for r in rules if r.get("enabled", True)],
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
async def list_policies(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all policy rules for the organization."""
    return await load_policies_for_org(user.org_id, db)


@router.post("")
async def create_policy(
    body: PolicyRuleCreate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a new policy rule."""
    rule = DBPolicyRule(
        org_id=uuid.UUID(user.org_id) if isinstance(user.org_id, str) else user.org_id,
        name=body.name,
        description=body.description,
        conditions=body.conditions,
        action=body.action,
        priority=body.priority,
        enabled=body.enabled,
    )
    db.add(rule)
    await db.commit()
    await load_policies_for_org(user.org_id, db)
    return {
        "rule_id": str(rule.rule_id),
        "name": rule.name,
        "description": rule.description,
        "conditions": rule.conditions,
        "action": rule.action,
        "priority": rule.priority,
        "enabled": rule.enabled,
    }


@router.post("/test")
async def test_policy(
    body: PolicyTestRequest,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PolicyDecision:
    """Test policy rules against a sample context."""
    rules = await load_policies_for_org(user.org_id, db)
    ctx = RequestContext(
        risk_score=body.risk_score,
        detection_categories=body.detection_categories,
        department=body.department,
        role=body.role,
        org_id=user.org_id,
    )
    return policy_engine.evaluate(ctx, rules=rules)


@router.put("/{rule_id}")
async def update_policy(
    rule_id: str,
    body: PolicyRuleUpdate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Update an existing policy rule."""
    query = select(DBPolicyRule).filter(
        DBPolicyRule.rule_id == uuid.UUID(rule_id),
        DBPolicyRule.org_id == uuid.UUID(user.org_id),
        DBPolicyRule.deleted_at.is_(None)
    )
    result = await db.execute(query)
    rule = result.scalar_one_or_none()
    
    if not rule:
        raise HTTPException(status_code=404, detail="Policy rule not found")
        
    if body.name is not None:
        rule.name = body.name
    if body.description is not None:
        rule.description = body.description
    if body.conditions is not None:
        rule.conditions = body.conditions
    if body.action is not None:
        rule.action = body.action
    if body.priority is not None:
        rule.priority = body.priority
    if body.enabled is not None:
        rule.enabled = body.enabled
        
    await db.commit()
    await load_policies_for_org(user.org_id, db)
    
    return {
        "rule_id": str(rule.rule_id),
        "name": rule.name,
        "description": rule.description,
        "conditions": rule.conditions,
        "action": rule.action,
        "priority": rule.priority,
        "enabled": rule.enabled,
    }


@router.delete("/{rule_id}")
async def delete_policy(
    rule_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Soft-delete a policy rule."""
    query = select(DBPolicyRule).filter(
        DBPolicyRule.rule_id == uuid.UUID(rule_id),
        DBPolicyRule.org_id == uuid.UUID(user.org_id),
        DBPolicyRule.deleted_at.is_(None)
    )
    result = await db.execute(query)
    rule = result.scalar_one_or_none()
    
    if not rule:
        raise HTTPException(status_code=404, detail="Policy rule not found")
        
    rule.deleted_at = datetime.utcnow()
    rule.enabled = False
    await db.commit()
    await load_policies_for_org(user.org_id, db)
    
    return {"status": "deleted", "rule_id": rule_id}
