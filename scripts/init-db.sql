-- AI Governance Firewall — Database Initialization
-- This script runs on first container start.

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Core tables for proxy service
CREATE TABLE IF NOT EXISTS organizations (
    org_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    email VARCHAR(255) NOT NULL,
    department VARCHAR(100) DEFAULT '',
    role VARCHAR(50) DEFAULT 'user',
    risk_multiplier DOUBLE PRECISION DEFAULT 1.0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_users_org_id ON users(org_id);
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);

CREATE TABLE IF NOT EXISTS policy_rules (
    rule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(org_id),
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    conditions JSONB NOT NULL,
    action VARCHAR(20) NOT NULL,
    scope VARCHAR(50) DEFAULT 'all',
    priority INTEGER DEFAULT 100,
    enabled BOOLEAN DEFAULT TRUE,
    exceptions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS ix_policy_rules_org_id ON policy_rules(org_id);
CREATE INDEX IF NOT EXISTS ix_policy_rules_priority ON policy_rules(priority);
CREATE INDEX IF NOT EXISTS ix_policy_rules_enabled ON policy_rules(enabled);

CREATE TABLE IF NOT EXISTS audit_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
    org_id UUID NOT NULL,
    user_id UUID NOT NULL,
    session_id VARCHAR(100) DEFAULT '',
    tool_name VARCHAR(100) DEFAULT '',
    llm_provider VARCHAR(50) DEFAULT '',
    prompt_hash VARCHAR(64) DEFAULT '',
    encrypted_prompt_hash TEXT NULL,
    detection_results JSONB DEFAULT '{}'::jsonb,
    encrypted_detected_spans TEXT NULL,
    risk_score INTEGER DEFAULT 0,
    action_taken VARCHAR(20) DEFAULT 'ALLOW',
    policy_rule_id UUID NULL,
    redacted_prompt TEXT NULL,
    request_duration_ms DOUBLE PRECISION DEFAULT 0,
    upstream_status_code INTEGER NULL
);

CREATE INDEX IF NOT EXISTS ix_audit_events_org_id ON audit_events(org_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_user_id ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS ix_audit_events_timestamp ON audit_events("timestamp");
CREATE INDEX IF NOT EXISTS ix_audit_events_risk_score ON audit_events(risk_score);
CREATE INDEX IF NOT EXISTS ix_audit_events_action_taken ON audit_events(action_taken);

SELECT create_hypertable('audit_events', 'timestamp', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS shadow_ai_alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    org_id UUID NULL,
    tool_name VARCHAR(255) DEFAULT '',
    domain VARCHAR(255) DEFAULT '',
    category VARCHAR(100) DEFAULT '',
    is_authorized BOOLEAN DEFAULT FALSE,
    "timestamp" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_shadow_ai_alerts_user_id ON shadow_ai_alerts(user_id);
CREATE INDEX IF NOT EXISTS ix_shadow_ai_alerts_timestamp ON shadow_ai_alerts("timestamp");
