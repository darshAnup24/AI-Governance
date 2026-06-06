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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import uuid
from datetime import datetime

from proxy.app.models import ActionType, PolicyDecision, UserContext
from proxy.app.auth import get_current_user
from proxy.app.database import get_db
from proxy.app.db_models import PolicyRule as DBPolicyRule, PolicyVersion as DBPolicyVersion
from proxy.app.policy_cache import distributed_policy_cache

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1/policies", tags=["policies"])

# ─── In-memory policy cache (backward compat, superseded by DistributedPolicyCache) ──
_policy_cache: dict[str, list[dict[str, Any]]] = {}

async def _fetch_policies_from_db(org_id: str, db: AsyncSession) -> list[dict[str, Any]]:
    """Load policy rules for an org from DB (L3 source)."""
    try:
        org_id_val = uuid.UUID(org_id) if isinstance(org_id, str) else org_id
        query = select(DBPolicyRule).filter(
            DBPolicyRule.org_id == org_id_val,
            DBPolicyRule.deleted_at == None,
        ).order_by(DBPolicyRule.priority)
    except (ValueError, AttributeError):
        from sqlalchemy import cast, String
        query = select(DBPolicyRule).filter(
            cast(DBPolicyRule.org_id, String) == str(org_id),
            DBPolicyRule.deleted_at == None,
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

async def load_policies_for_org(org_id: str, db: AsyncSession, redis: Any = None) -> list[dict[str, Any]]:
    """Load policy rules using distributed cache (L1 → L2 → L3/DB)."""
    async def refresh_fn():
        return await _fetch_policies_from_db(org_id, db)

    key = f"policies:{org_id}"
    return await distributed_policy_cache.get(key, redis, refresh_fn)




# ─── Request Context ─────────────────────────────────────

class RequestContext(BaseModel):
    user_id: str = ""
    department: str = ""
    role: str = ""
    org_id: str = ""
    risk_score: int = 0
    detection_categories: list[str] = []
    tool_name: str = ""
    prompt_length: int = 0
    eu_ai_act_tier: str = ""


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
    elif field == "user.role" or field == "role":
        field_value = ctx.role
    elif field == "detection.category" or field == "category":
        field_value = ctx.detection_categories  # list
    elif field == "tool_name":
        field_value = ctx.tool_name
    elif field == "user_id":
        field_value = ctx.user_id
    elif field == "org_id":
        field_value = ctx.org_id
    elif field == "prompt_length":
        field_value = ctx.prompt_length
    elif field == "eu_ai_act_tier":
        field_value = ctx.eu_ai_act_tier
    else:
        return False

    # For list fields (detection categories), eq/neq behave as membership checks
    is_list = isinstance(field_value, list)

    # Apply operator
    if op == "eq" or op == "equals":
        if is_list:
            return value in field_value
        return str(field_value) == str(value) if not isinstance(field_value, (int, float)) else field_value == value
    elif op == "neq" or op == "not_equals":
        if is_list:
            return value not in field_value
        return str(field_value) != str(value) if not isinstance(field_value, (int, float)) else field_value != value
    elif op == "gt":
        return isinstance(field_value, (int, float)) and field_value > value
    elif op == "gte":
        return isinstance(field_value, (int, float)) and field_value >= value
    elif op == "lt":
        return isinstance(field_value, (int, float)) and field_value < value
    elif op == "lte":
        return isinstance(field_value, (int, float)) and field_value <= value
    elif op == "contains":
        if is_list:
            return value in field_value
        return str(value) in str(field_value)
    elif op == "not_contains":
        if is_list:
            return value not in field_value
        return str(value) not in str(field_value)
    elif op == "in":
        candidates = value if isinstance(value, list) else [value]
        if is_list:
            return any(v in candidates for v in field_value)
        return field_value in candidates
    elif op == "not_in":
        candidates = value if isinstance(value, list) else [value]
        if is_list:
            return not any(v in candidates for v in field_value)
        return field_value not in candidates

    return False


def _evaluate_conditions(conditions_block: dict[str, Any], ctx: RequestContext) -> bool:
    """Evaluate a conditions block (AND/OR) recursively."""
    operator = conditions_block.get("operator", "AND")
    conditions = conditions_block.get("conditions", [])

    if not conditions:
        return False  # No conditions = no match (fail-safe; prevents doc policies from blocking)

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
        Supports: staged rollout (percentage-based), inheritance chain.
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
            # Staged rollout: skip if rollout_percentage < 100 and user_id hash falls outside
            rollout_pct = rule.get("rollout_percentage", 100)
            if rollout_pct < 100:
                user_hash = abs(hash(ctx.user_id)) % 100
                if user_hash >= rollout_pct:
                    continue

            # Check rollout status
            rollout_status = rule.get("rollout_status", "ACTIVE")
            if rollout_status not in ("ACTIVE", "STAGED"):
                continue

            conditions = rule.get("conditions", {})
            if _evaluate_conditions(conditions, ctx):
                action = ActionType(rule["action"])
                log.info(
                    "policy.matched",
                    rule_id=rule["rule_id"],
                    rule_name=rule["name"],
                    action=action.value,
                    rollout_status=rollout_status,
                    rollout_pct=rollout_pct,
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


async def _create_policy_version(
    db: AsyncSession,
    rule: DBPolicyRule,
    changed_by: str,
    reason: str = "",
) -> None:
    """Create a snapshot version of a policy rule."""
    version = DBPolicyVersion(
        policy_id=rule.rule_id,
        version=rule.version or 1,
        snapshot={
            "name": rule.name,
            "description": rule.description,
            "conditions": rule.conditions,
            "action": rule.action,
            "priority": rule.priority,
            "enabled": rule.enabled,
            "scope": rule.scope,
            "rollout_percentage": rule.rollout_percentage,
            "rollout_status": rule.rollout_status,
        },
        changed_by=changed_by,
        reason=reason,
    )
    db.add(version)


# ─── API Endpoints ────────────────────────────────────────

class PolicyRuleCreate(BaseModel):
    name: str
    description: str = ""
    conditions: dict[str, Any]
    action: str
    priority: int = 100
    enabled: bool = True
    rollout_percentage: int = 100
    rollout_status: str = "ACTIVE"
    parent_rule_id: str | None = None


class PolicyRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    conditions: dict[str, Any] | None = None
    action: str | None = None
    priority: int | None = None
    enabled: bool | None = None
    rollout_percentage: int | None = None
    rollout_status: str | None = None


class PolicyTestRequest(BaseModel):
    risk_score: int = 0
    detection_categories: list[str] = []
    department: str = ""
    role: str = ""
    user_id: str = ""


class PolicySimulateRequest(BaseModel):
    sample_contexts: list[PolicyTestRequest] = []


class PolicySimulateResponse(BaseModel):
    total: int
    matches: int
    match_rate: float
    action_distribution: dict[str, int]
    matched_rule_ids: list[str]


@router.get("")
async def list_policies(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all policy rules for the organization."""
    rules = await load_policies_for_org(user.org_id, db)
    # Also return version count
    for rule in rules:
        try:
            vq = select(DBPolicyVersion).filter(
                DBPolicyVersion.policy_id == uuid.UUID(rule["rule_id"])
            )
            v_result = await db.execute(vq)
            versions = v_result.scalars().all()
            rule["version_count"] = len(versions)
        except Exception:
            rule["version_count"] = 0
    return rules


@router.post("")
async def create_policy(
    body: PolicyRuleCreate,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Create a new policy rule."""
    try:
        org_id_val = uuid.UUID(user.org_id) if isinstance(user.org_id, str) else user.org_id
    except (ValueError, AttributeError):
        org_id_val = user.org_id  # type: ignore[assignment]

    parent_id = None
    if body.parent_rule_id:
        try:
            parent_id = uuid.UUID(body.parent_rule_id)
        except (ValueError, AttributeError):
            pass

    rule = DBPolicyRule(
        org_id=org_id_val,
        parent_rule_id=parent_id,
        name=body.name,
        description=body.description,
        conditions=body.conditions,
        action=body.action,
        priority=body.priority,
        enabled=body.enabled,
        rollout_percentage=body.rollout_percentage,
        rollout_status=body.rollout_status,
        version=1,
    )
    db.add(rule)
    await db.flush()
    await _create_policy_version(db, rule, changed_by=user.user_id, reason="Initial creation")
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
        "rollout_percentage": rule.rollout_percentage,
        "rollout_status": rule.rollout_status,
        "version": rule.version,
    }


@router.post("/simulate")
async def simulate_policy(
    body: PolicySimulateRequest,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PolicySimulateResponse:
    """Simulate policy rules against a batch of sample contexts."""
    rules = await load_policies_for_org(user.org_id, db)
    total = len(body.sample_contexts)
    matches = 0
    action_distribution: dict[str, int] = {}
    matched_rule_ids: list[str] = []

    for sample in body.sample_contexts:
        ctx = RequestContext(
            user_id=sample.user_id or "sim-user",
            risk_score=sample.risk_score,
            detection_categories=sample.detection_categories,
            department=sample.department,
            role=sample.role,
            org_id=user.org_id,
        )
        decision = policy_engine.evaluate(ctx, rules=rules)
        if decision.matched_rule_id:
            matches += 1
            if decision.matched_rule_id not in matched_rule_ids:
                matched_rule_ids.append(decision.matched_rule_id)
        action_distribution[decision.action.value] = action_distribution.get(decision.action.value, 0) + 1

    return PolicySimulateResponse(
        total=total,
        matches=matches,
        match_rate=round(matches / max(total, 1) * 100, 2),
        action_distribution=action_distribution,
        matched_rule_ids=matched_rule_ids,
    )


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
    """Update an existing policy rule (auto-versioned)."""
    query = select(DBPolicyRule).filter(
        DBPolicyRule.rule_id == uuid.UUID(rule_id),
        DBPolicyRule.org_id == uuid.UUID(user.org_id),
        DBPolicyRule.deleted_at == None
    )
    result = await db.execute(query)
    rule = result.scalar_one_or_none()
    
    if not rule:
        raise HTTPException(status_code=404, detail="Policy rule not found")
    
    # Create version snapshot before mutating
    await _create_policy_version(db, rule, changed_by=user.user_id, reason="Pre-update snapshot")
    rule.version = (rule.version or 1) + 1
        
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
    if body.rollout_percentage is not None:
        rule.rollout_percentage = body.rollout_percentage
    if body.rollout_status is not None:
        rule.rollout_status = body.rollout_status
        
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
        "rollout_percentage": rule.rollout_percentage,
        "rollout_status": rule.rollout_status,
        "version": rule.version,
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
        DBPolicyRule.deleted_at == None
    )
    result = await db.execute(query)
    rule = result.scalar_one_or_none()
    
    if not rule:
        raise HTTPException(status_code=404, detail="Policy rule not found")
    
    await _create_policy_version(db, rule, changed_by=user.user_id, reason="Deleted")
    rule.deleted_at = datetime.utcnow()
    rule.enabled = False
    await db.commit()
    await load_policies_for_org(user.org_id, db)
    
    return {"status": "deleted", "rule_id": rule_id}


@router.get("/{rule_id}/versions")
async def list_policy_versions(
    rule_id: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    """List all versions of a policy rule."""
    query = select(DBPolicyVersion).filter(
        DBPolicyVersion.policy_id == uuid.UUID(rule_id)
    ).order_by(DBPolicyVersion.version.desc())
    result = await db.execute(query)
    versions = result.scalars().all()
    return [
        {
            "id": str(v.id),
            "version": v.version,
            "snapshot": v.snapshot,
            "changed_by": v.changed_by,
            "reason": v.reason,
            "created_at": v.created_at.isoformat() if v.created_at else None,
        }
        for v in versions
    ]


@router.post("/{rule_id}/rollback/{version}")
async def rollback_policy(
    rule_id: str,
    version: int,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Rollback a policy rule to a previous version."""
    # Find the target version
    vq = select(DBPolicyVersion).filter(
        DBPolicyVersion.policy_id == uuid.UUID(rule_id),
        DBPolicyVersion.version == version,
    )
    v_result = await db.execute(vq)
    target_version = v_result.scalar_one_or_none()
    
    if not target_version:
        raise HTTPException(status_code=404, detail=f"Version {version} not found")
    
    # Find the current rule
    query = select(DBPolicyRule).filter(
        DBPolicyRule.rule_id == uuid.UUID(rule_id),
        DBPolicyRule.org_id == uuid.UUID(user.org_id),
        DBPolicyRule.deleted_at == None
    )
    result = await db.execute(query)
    rule = result.scalar_one_or_none()
    
    if not rule:
        raise HTTPException(status_code=404, detail="Policy rule not found")
    
    # Save current state as version before rollback
    await _create_policy_version(db, rule, changed_by=user.user_id, reason=f"Pre-rollback from v{version}")
    
    # Apply snapshot
    snapshot = target_version.snapshot
    rule.name = snapshot.get("name", rule.name)
    rule.description = snapshot.get("description", rule.description)
    rule.conditions = snapshot.get("conditions", rule.conditions)
    rule.action = snapshot.get("action", rule.action)
    rule.priority = snapshot.get("priority", rule.priority)
    rule.enabled = snapshot.get("enabled", rule.enabled)
    rule.rollout_percentage = snapshot.get("rollout_percentage", 100)
    rule.rollout_status = snapshot.get("rollout_status", "ACTIVE")
    rule.version = (rule.version or 1) + 1
    
    await db.commit()
    await load_policies_for_org(user.org_id, db)
    
    return {
        "status": "rolled_back",
        "rule_id": rule_id,
        "version": rule.version,
        "restored_from_version": version,
    }
