"""
SQLAlchemy ORM models for the AI Governance Firewall database.
PostgreSQL + TimescaleDB schema.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"

    org_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    settings = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="organization")
    policy_rules = relationship("PolicyRule", back_populates="organization")


class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.org_id"), nullable=False)
    email = Column(String(255), nullable=False)
    department = Column(String(100), default="")
    role = Column(String(50), default="user")
    risk_multiplier = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    organization = relationship("Organization", back_populates="users")

    __table_args__ = (
        Index("ix_users_org_id", "org_id"),
        Index("ix_users_email", "email"),
    )


class PolicyRule(Base):
    __tablename__ = "policy_rules"

    rule_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), ForeignKey("organizations.org_id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    conditions = Column(JSON, nullable=False)
    action = Column(String(20), nullable=False)  # BLOCK, REDACT, WARN, ALLOW
    scope = Column(String(50), default="all")  # all, department, user
    priority = Column(Integer, default=100)  # Lower = higher priority
    enabled = Column(Boolean, default=True)
    exceptions = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)  # Soft delete

    organization = relationship("Organization", back_populates="policy_rules")

    __table_args__ = (
        Index("ix_policy_rules_org_id", "org_id"),
        Index("ix_policy_rules_priority", "priority"),
        Index("ix_policy_rules_enabled", "enabled"),
    )


class AuditEventRecord(Base):
    """
    TimescaleDB hypertable for time-series audit events.
    Partitioned by timestamp for efficient time-range queries.
    """
    __tablename__ = "audit_events"

    event_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    org_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    session_id = Column(String(100), default="")
    tool_name = Column(String(100), default="")
    llm_provider = Column(String(50), default="")
    prompt_hash = Column(String(64), default="")
<<<<<<< HEAD
    encrypted_prompt_hash = Column(Text, nullable=True)
    detection_results = Column(JSON, default={})
    encrypted_detected_spans = Column(Text, nullable=True)
=======
    detection_results = Column(JSON, default={})
>>>>>>> 0e1d75011b86daf0acf81fcc8abce865b10a3fb2
    risk_score = Column(Integer, default=0)
    action_taken = Column(String(20), default="ALLOW")
    policy_rule_id = Column(UUID(as_uuid=True), nullable=True)
    redacted_prompt = Column(Text, nullable=True)
    request_duration_ms = Column(Float, default=0)
    upstream_status_code = Column(Integer, nullable=True)

    __table_args__ = (
        Index("ix_audit_events_org_id", "org_id"),
        Index("ix_audit_events_user_id", "user_id"),
        Index("ix_audit_events_timestamp", "timestamp"),
        Index("ix_audit_events_risk_score", "risk_score"),
        Index("ix_audit_events_action_taken", "action_taken"),
    )


class ShadowAIAlert(Base):
    __tablename__ = "shadow_ai_alerts"

    alert_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(255), nullable=False)
    org_id = Column(UUID(as_uuid=True), nullable=True)
    tool_name = Column(String(255), default="")
    domain = Column(String(255), default="")
    category = Column(String(100), default="")
    is_authorized = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("ix_shadow_ai_alerts_user_id", "user_id"),
        Index("ix_shadow_ai_alerts_timestamp", "timestamp"),
    )

