-- AI Governance Firewall — Database Initialization
-- This script runs on first container start.

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Demo / Sandbox Schema (isolated from production) ─────────────────────────
-- This schema is ONLY used by demo-api (port 4001).
-- The governance backend (port 4000) MUST NOT access this schema.
CREATE SCHEMA IF NOT EXISTS demo_sandbox;

CREATE TABLE IF NOT EXISTS demo_sandbox.sandbox_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID,
  user_id      TEXT NOT NULL,
  run_type     TEXT NOT NULL, -- prompt_inspect | policy_simulate | attack_replay | shadow_ai
  input        JSONB,
  output       JSONB,
  risk_score   INT,
  action       TEXT,          -- BLOCK | ALLOW | REDACT
  simulated    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demo_sandbox.sandbox_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT,
  action       TEXT NOT NULL,
  payload      JSONB,
  source       TEXT DEFAULT 'demo-api',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Efficient time-series queries per user
CREATE INDEX IF NOT EXISTS sandbox_runs_user_time_idx
  ON demo_sandbox.sandbox_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sandbox_audit_time_idx
  ON demo_sandbox.sandbox_audit (created_at DESC);

