# 🛡️ AI Governance Firewall — ShieldAI
## Detailed Implementation Plan

> **Project:** Enterprise LLM Prompt Governance & AI Usage Control Gateway  
> **Codename:** ShieldAI  
> **Stack:** Python · FastAPI · spaCy/Llama · React.js (Vite + TypeScript) · PostgreSQL (TimescaleDB) · Redis · Docker · Node.js (Governance Service)  
> **Last Updated:** April 2026

---

## 1. WHAT THIS PROJECT DOES

ShieldAI is an **enterprise-grade transparent API proxy gateway** that sits between all employees and external LLM endpoints (OpenAI, Anthropic, Azure OpenAI, Gemini, Copilot, etc.) and:

1. **Intercepts** every outbound LLM-bound prompt in real time without changing the user's workflow.
2. **Classifies** each prompt using a multi-tier hybrid engine: deterministic Regex → NER (spaCy) → contextual detectors (Hallucination, Bias, Security Vuln, Regulatory, Prompt Injection) → on-premise Llama fallback.
3. **Scores** the risk of each prompt on a 0–100 normalized scale, mapped to EU AI Act risk tiers.
4. **Enforces** policy: ALLOW (< 30), LOG (30–60), WARN (60–80), REDACT (80–90), or BLOCK (≥ 90) — configurable per organization.
5. **Redacts** sensitive spans in-flight before they reach external LLMs.
6. **Detects Shadow AI** — unauthorized AI tools accessed via DNS/SNI fingerprinting.
7. **Logs everything** to an immutable audit trail in PostgreSQL (TimescaleDB) with compliance reports for GDPR, HIPAA, RBI, and EU AI Act.
8. **Surfaces** all of this to admins through a real-time React dashboard with risk analytics, user behavior, and exportable compliance evidence.

---

## 2. WHAT MAKES THIS UNIQUE (COMPETITIVE DIFFERENTIATION)

| Feature | Traditional DLP | Existing AI Firewalls | ShieldAI |
|---|---|---|---|
| Semantic-layer prompt analysis | ❌ | Partial | ✅ Full pipeline |
| Sub-100ms detection latency | N/A | ❌ | ✅ Parallel async pipeline |
| 7-tier detection (Regex→NER→Llama) | ❌ | 1–2 tiers | ✅ |
| Prompt Injection detection | ❌ | ❌ | ✅ |
| Hallucination / Bias detection | ❌ | ❌ | ✅ |
| EU AI Act risk tier mapping | ❌ | ❌ | ✅ Automated |
| Shadow AI DNS fingerprinting | ❌ | ❌ | ✅ YAML-driven registry |
| On-premise LLM (Llama fallback) | ❌ | ❌ | ✅ Ollama integration |
| OpenAI-compatible API (drop-in) | N/A | Partial | ✅ Zero-config swap |
| Regulatory-specific detectors | ❌ | ❌ | ✅ GDPR/HIPAA/RBI/PCI |
| Streaming SSE proxy support | N/A | ❌ | ✅ |
| TimescaleDB time-series audit | ❌ | ❌ | ✅ |
| Role-aware risk reduction | ❌ | ❌ | ✅ (CISO/Admin get 0.5× modifier) |
| Multi-provider adapter (OpenAI/Anthropic/Azure) | N/A | Partial | ✅ |
| Governance service (Node.js Prisma) | ❌ | ❌ | ✅ Separate policy+audit microservice |

**Key differentiator:** ShieldAI operates at the **semantic layer** — not the network packet layer. It understands what a prompt *means*, not just what bytes it contains. No current enterprise DLP product can do this. ShieldAI also uniquely adds Prompt Injection, Hallucination, and Bias detection — capabilities absent from every competitor product on the market today.

---

## 3. SYSTEM ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Enterprise Network                                │
│                                                                          │
│  Employee Browser / IDE / App                                            │
│       │ (DNS redirect / proxy settings / browser extension)              │
│       ▼                                                                  │
│  ┌─────────────────────────────────┐                                     │
│  │   PROXY SERVICE  (port 8000)    │  FastAPI + httpx                    │
│  │   /v1/chat/completions          │  ◄── OpenAI-compatible              │
│  │   Rate Limiter │ Auth (JWT)     │                                     │
│  │   Audit Emitter → Redis queue   │                                     │
│  └──────────┬──────────────────────┘                                     │
│             │ POST /detect                                                │
│             ▼                                                             │
│  ┌─────────────────────────────────────────────────────────┐             │
│  │   DETECTION SERVICE  (port 8001)                        │             │
│  │                                                         │             │
│  │   Tier 1  Regex (PII, API keys, Aadhaar, PAN, CC)       │             │
│  │     ↓ parallel                                          │             │
│  │   Tier 2  spaCy NER + 5 Specialized Detectors:          │             │
│  │           Hallucination · Bias · SecCode                │             │
│  │           Regulatory · PromptInjection                  │             │
│  │     ↓ only if score 40–70                               │             │
│  │   Tier 3  Ollama Llama3.1:8b (on-premise LLM)           │             │
│  │                                                         │             │
│  │   Risk Scorer → EU AI Act tier → Action                 │             │
│  └─────────────────────────────────────────────────────────┘             │
│             │                                                             │
│             ▼                                                             │
│  ┌──────────────────────────────────────────────┐                        │
│  │   GOVERNANCE SERVICE  (port 4000) Node.js    │                        │
│  │   Prisma ORM · PostgreSQL                    │                        │
│  │   Policy CRUD · User Mgmt · Audit API        │                        │
│  └──────────────────────────────────────────────┘                        │
│             │                                                             │
│             ▼                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  DASHBOARD  (port 3000) React + Vite + TypeScript + Tailwind       │  │
│  │  Risk Timeline · User Heatmap · Shadow AI Map · Compliance Reports │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Infrastructure: PostgreSQL(TimescaleDB) · Redis · Ollama               │
└──────────────────────────────────────────────────────────────────────────┘
                              │
                (After enforcement — ALLOW / REDACT)
                              │
              ┌───────────────┴───────────────┐
              │         External LLMs         │
              │  OpenAI · Anthropic · Azure   │
              │  Gemini · Copilot · Custom    │
              └───────────────────────────────┘
```

---

## 4. SERVICE BREAKDOWN

### 4.1 Proxy Service (`proxy/`) — Port 8000

**Tech:** Python 3.11 · FastAPI · httpx · structlog · Prometheus · SQLAlchemy Async

**Current status:** ✅ Built

**Files:**
| File | Role | Status |
|---|---|---|
| `app/main.py` | App factory, lifespan, middleware, Prometheus metrics | ✅ Done |
| `app/routes.py` | `/v1/chat/completions` — intercept, detect, enforce, forward | ✅ Done |
| `app/policy_engine.py` | Rules evaluator with AND/OR conditions, CRUD API | ✅ Done |
| `app/adapters.py` | Multi-provider adapter (OpenAI/Anthropic/Azure/Gemini) | ✅ Done |
| `app/auth.py` | JWT auth (HS256 dev / RS256 prod JWKS), rate limiter | ✅ Done |
| `app/audit.py` | Async audit emitter → Redis queue | ✅ Done |
| `app/audit_consumer.py` | Background consumer writes events to PostgreSQL | ✅ Done |
| `app/config.py` | Pydantic Settings (env-driven) | ✅ Done |
| `app/database.py` | SQLAlchemy async engine + session | ✅ Done |
| `app/db_models.py` | ORM models: AuditEvent, User, Organization | ✅ Done |
| `app/models.py` | Pydantic schemas: ChatCompletionRequest, DetectionResult, etc. | ✅ Done |
| `app/logging_config.py` | structlog JSON logging setup | ✅ Done |

**Remaining work:**
- [ ] Real audit events DB read-back in `/api/v1/audit-events` (currently returns stub)
- [ ] Real analytics from TimescaleDB in `/api/v1/analytics/trend`
- [ ] Shadow AI webhook endpoint for DNS log ingestion
- [ ] Multi-tenant org isolation in policy store (move from in-memory to DB)
- [ ] Response inspection (check LLM *responses* for data leakage, not just prompts)

---

### 4.2 Detection Service (`detection/`) — Port 8001

**Tech:** Python 3.11 · FastAPI · spaCy · Ollama (Llama3.1:8b) · YAML

**Current status:** ✅ Built (7 detectors)

**Detection pipeline:**

```
Prompt text
    │
    ├── Tier 1 (always runs, parallel)
    │   ├── RegexDetector       → PII, API keys, Aadhaar, PAN, CC, phone, email
    │   ├── SpacyNERDetector    → Named entity recognition (persons, orgs, locations)
    │   ├── HallucinationDetector → Confident false claims, fabricated citations
    │   ├── BiasDetector        → Discriminatory language, stereotyping
    │   ├── SecurityCodeDetector → Vulnerabilities, exploit patterns, secrets in code
    │   ├── RegulatoryDetector  → GDPR/HIPAA/PCI/RBI-specific clauses
    │   └── PromptInjectionDetector → Jailbreak attempts, role override attacks
    │
    ├── Risk Scorer (intermediate score = Σ weight × confidence × severity × 30)
    │
    └── Tier 3 (only if 40 ≤ score ≤ 70, ambiguous zone)
        └── LlamaClassifier → Ollama local inference → disambiguation
```

**Files:**
| File | Role | Status |
|---|---|---|
| `app/main.py` | FastAPI app, `/detect` endpoint, parallel pipeline orchestration | ✅ Done |
| `app/regex_detector.py` | 30+ regex patterns, span extraction with offsets | ✅ Done |
| `app/ner_detector.py` | spaCy `en_core_web_sm`, entity→category mapping | ✅ Done |
| `app/risk_scorer.py` | Weighted aggregator, EU AI Act mapping, redact_prompt() | ✅ Done |
| `app/llama_classifier.py` | Ollama client, prompt template, JSON response parsing | ✅ Done |
| `app/shadow_ai.py` | DNS log parser (BIND + generic), domain registry, event emitter | ✅ Done |
| `app/ai_domains.yaml` | YAML registry of 50+ known AI tool domains | ✅ Done |
| `app/detectors/hallucination_detector.py` | Pattern + heuristic hallucination detection | ✅ Done |
| `app/detectors/bias_detector.py` | Bias pattern library with severity scoring | ✅ Done |
| `app/detectors/security_code_detector.py` | SQL injection, XSS, hardcoded secrets detection | ✅ Done |
| `app/detectors/regulatory_detector.py` | GDPR Art 9, HIPAA PHI, RBI, PCI-DSS patterns | ✅ Done |
| `app/detectors/prompt_injection_detector.py` | 20+ jailbreak patterns, role override attacks | ✅ Done |

**Remaining work:**
- [ ] Fine-tune spaCy model on enterprise PII datasets (currently uses `en_core_web_sm`)
- [ ] Add `en_core_web_trf` (transformer-based) as an optional upgrade for higher accuracy
- [ ] Llama classifier: structured output enforcement with Pydantic validation
- [ ] Add BERT-based secondary classifier as an alternative to Llama (lower latency)
- [ ] Cache regex-only results in Redis (deterministic → cacheable by prompt hash)
- [ ] Add Indian-specific patterns: Aadhaar validation checksum, GSTIN, IFSC, UAN

---

### 4.3 Governance Service (`governance/`) — Port 4000

**Tech:** Node.js · TypeScript · Express/Fastify · Prisma ORM · PostgreSQL · Redis

**Current status:** 🟡 Partial (scaffolding present)

**Files:**
| File | Role | Status |
|---|---|---|
| `src/index.ts` | Service entry point | ✅ Done |
| `src/routes/` | API routes | 🟡 Partial |
| `src/middleware/` | Auth, error handling | 🟡 Partial |
| `prisma/schema.prisma` | DB schema | 🟡 Needs review |

**Remaining work:**
- [ ] Finalize Prisma schema: User, Organization, PolicyRule, AuditEvent, ShadowAIAlert
- [ ] Implement policy CRUD endpoints with org-level isolation
- [ ] Implement user management (invite, roles, department assignment)
- [ ] Implement compliance report generation endpoints (PDF/CSV)
- [ ] Add Ollama governance advisor endpoint (`/api/governance/advisor`)
- [ ] Add real-time WebSocket push for live dashboard events
- [ ] Seed script for demo data

---

### 4.4 React Dashboard (`dashboard/`) — Port 3000

**Tech:** React 18 · Vite · TypeScript · Tailwind CSS · React Router v6

**Current status:** 🟡 Partial (routing + layout + some pages)

**Pages:**
| Route | Page | Status |
|---|---|---|
| `/governance` | Main governance dashboard | 🟡 Partial |
| `/governance/models` | Registered LLM models | 🟡 Partial |
| `/governance/threats` | Real-time threat detection feed | 🟡 Partial |
| `/governance/compliance` | GDPR/HIPAA/EU AI Act compliance status | 🟡 Partial |
| `/governance/advisor` | AI governance advisory (Llama-powered) | 🟡 Partial |
| `/governance/incidents` | Incident management | 🟡 Partial |
| `/governance/policies` | Policy rule management | 🟡 Partial |
| `/governance/vendors` | AI vendor risk assessment | 🟡 Partial |
| `/governance/reports` | Compliance report exports | 🟡 Partial |
| `/dashboard` | Proxy monitoring (legacy) | 🟡 Partial |
| `/incidents` | Audit event log | 🟡 Partial |
| `/shadow-ai` | Shadow AI detections | 🟡 Partial |
| `/reports` | Exportable reports | 🟡 Partial |

**Remaining work:**
- [ ] Connect all pages to real API endpoints (currently using mock data)
- [ ] Implement charts: ECharts / Recharts for risk trend, blocked/redacted/warned timeline
- [ ] Implement user behavior heatmap (risk by user × time)
- [ ] Shadow AI world-map visualization (geo-IP of unauthorized AI endpoints)
- [ ] PDF/CSV export for GDPR Article 30, HIPAA, EU AI Act reports
- [ ] Real-time WebSocket feed for live threat events
- [ ] Policy builder UI (drag-and-drop condition tree)
- [ ] Dark mode, loading states, error boundaries

---

### 4.5 Infrastructure

| Component | Image | Port | Purpose | Status |
|---|---|---|---|---|
| PostgreSQL (TimescaleDB) | `timescale/timescaledb:2.17.2-pg15` | 5432 | Audit log, users, policies | ✅ Configured |
| Redis 7 | `redis:7-alpine` | 6379 | Rate limiting, audit queue, detection cache | ✅ Configured |
| Ollama | `ollama/ollama:latest` | 11434 | Local Llama3.1:8b inference | ✅ Configured |
| All services | Docker Compose | — | Orchestration | ✅ Configured |

---

## 5. DETECTION CATEGORIES & RISK WEIGHTS

| Category | Weight | Severity | Example |
|---|---|---|---|
| `API_KEY` | 1.0 | Critical | `sk-xxxxx`, `AKIA...` |
| `CREDENTIALS` | 1.0 | Critical | Passwords, tokens |
| `REGULATORY` | 1.0 | Critical | HIPAA PHI, GDPR special data |
| `PROMPT_INJECTION` | 1.0 | Critical | Jailbreak attempts |
| `SECURITY_VULN` | 0.95 | Critical | SQL injection, exploit code |
| `HALLUCINATION` | 0.85 | Medium | False confident claims |
| `PII` | 0.9 | High | Email, phone, Aadhaar, PAN |
| `BIAS` | 0.80 | High | Discriminatory content |
| `SOURCE_CODE` | 0.8 | Medium | Internal code snippets |
| `CONFIDENTIAL` | 0.7 | Medium | Confidential docs |

**Risk Score Formula:**
```
base_score = Σ (detector_weight × span.confidence × severity_multiplier × 30)
final_score = min(100, base_score × context_modifier)

context_modifier:
  - 0.5 for privileged roles (security, admin, ciso)
  - 1.0 for all other roles
```

**Action Thresholds (configurable per org):**
```
≥ 90 → BLOCK   (request rejected, 403 returned)
≥ 80 → REDACT  (sensitive spans replaced with [REDACTED:CATEGORY])
≥ 60 → WARN    (forwarded with warning headers)
≥ 30 → LOG     (forwarded, logged for review)
<  30 → ALLOW   (forwarded silently)
```

**EU AI Act Tier Mapping:**
```
score ≥ 90 → UNACCEPTABLE RISK
score ≥ 70 → HIGH RISK
score ≥ 40 → LIMITED RISK
score  < 40 → MINIMAL RISK
```

---

## 6. REMAINING WORK — PHASE-WISE COMPLETION PLAN

### Phase A: Backend Hardening (Week 1–2)

#### A1. Persist Policy Rules to PostgreSQL
- Move `_policy_store` from in-memory dict in `policy_engine.py` to `PolicyRule` DB table
- Add Alembic migration for `policy_rules` table
- Update PolicyEngine to load/cache rules from DB on startup, invalidate on write

#### A2. Real Audit Event Read-Back
- Implement `/api/v1/audit-events` in `routes.py` to query PostgreSQL (not stub)
- Add pagination, filtering by action, user_id, date range, org_id
- Use TimescaleDB `time_bucket` for aggregated trend queries

#### A3. Real Analytics Endpoint
- Implement `/api/v1/analytics/trend` using TimescaleDB:
  ```sql
  SELECT time_bucket('1 day', created_at) AS day,
         COUNT(*) FILTER (WHERE action_taken = 'BLOCK') as blocked,
         COUNT(*) FILTER (WHERE action_taken = 'REDACT') as redacted
  FROM audit_events
  WHERE org_id = $1 AND created_at > NOW() - INTERVAL '$2 days'
  GROUP BY day ORDER BY day;
  ```

#### A4. Shadow AI REST Endpoint
- Add `POST /api/v1/shadow-ai/events` in proxy for receiving DNS log parsed events
- Add `GET /api/v1/shadow-ai/detections` for dashboard consumption
- Store events in a `shadow_ai_alerts` DB table

#### A5. Response Inspection
- After upstream LLM responds, run a second detection pass on the *response* text
- Detect if LLM leaked or reconstructed sensitive data in its response
- This is a unique capability no competitor currently offers

---

### Phase B: Detection Engine Enhancement (Week 3–4)

#### B1. spaCy Model Upgrade
- Download `en_core_web_trf` (transformer-based) as production model
- Keep `en_core_web_sm` for fallback / low-memory deployments
- Add Indian language NER via spaCy-Indic

#### B2. BERT-based Classifier (Alternative to Llama for Tier 3)
- Fine-tune `distilbert-base-uncased` on synthetic enterprise leakage dataset
- Faster inference than Llama (< 20ms vs 100–500ms)
- Use ONNX runtime for production serving
- Architecture: `prompt → tokenize → BERT → [SENSITIVE/SAFE + confidence]`

#### B3. Prompt Injection Enhancement
- Add semantic similarity check against known jailbreak corpus
- Add detection of multi-turn injection (across message history, not just last message)

#### B4. Redis Detection Cache
- Hash prompt with SHA-256
- Cache detection results for 60 seconds (for repeated identical prompts)
- Skip full pipeline on cache hit — saves ~80–100ms per repeated prompt

#### B5. Indian Regulatory Patterns
- GSTIN: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
- UAN (EPFO): 12-digit
- Voter ID, Passport, Driving License patterns
- RBI data localization clauses

---

### Phase C: Governance Service Completion (Week 5–6)

#### C1. Prisma Schema Finalization
```prisma
model Organization {
  id          String   @id @default(uuid())
  name        String
  domain      String   @unique
  ...
  users       User[]
  policies    PolicyRule[]
  auditEvents AuditEvent[]
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  role         String   // admin | analyst | user
  department   String
  orgId        String
  org          Organization @relation(fields: [orgId], references: [id])
}

model PolicyRule {
  id          String   @id @default(uuid())
  orgId       String
  name        String
  conditions  Json
  action      String
  priority    Int      @default(100)
  enabled     Boolean  @default(true)
}

model ShadowAIAlert {
  id          String   @id @default(uuid())
  userId      String
  toolName    String
  domain      String
  category    String
  authorized  Boolean
  detectedAt  DateTime @default(now())
}
```

#### C2. Governance Advisor
- LLM-powered governance recommendations via Ollama
- Endpoint: `POST /api/governance/advisor`
- Input: org context, recent violations, industry vertical
- Output: ranked remediation recommendations with regulation citations

#### C3. WebSocket Live Feed
- `ws://governance:4000/ws/events` — push real-time audit events to dashboard
- Subscribe by org_id, filter by severity

#### C4. Compliance Report Generation
- PDF: `pdfkit` or `Playwright` server-side PDF generation
- CSV: standard `json-2-csv`
- Templates: GDPR Article 30 Record of Processing, HIPAA Audit Report, EU AI Act Annex

---

### Phase D: Dashboard Completion (Week 7–9)

#### D1. Real Data Integration
- Replace all `mockData` with API calls using `useQuery` (React Query / TanStack Query)
- Add proper error boundaries and loading skeletons
- Add retry logic for failed API calls

#### D2. Charts & Visualizations
- **Risk Trend (30d):** `Recharts` LineChart — BLOCK / REDACT / WARN / ALLOW per day
- **Detection Category Breakdown:** PieChart by category (PII, API_KEY, PROMPT_INJECTION, etc.)
- **User Risk Heatmap:** 2D heat grid (users × days of week) using `react-heatmap-grid`
- **Shadow AI World Map:** `react-leaflet` + GeoIP → unauthorized AI URL ping locations
- **Live Threat Feed:** virtualized list with 1s auto-refresh using WebSocket

#### D3. Policy Builder UI
- Visual rule builder: `IF [field] [operator] [value] AND/OR ... THEN [action]`
- Test button: run policy against sample context, see which rule triggers
- Drag-and-drop priority reordering

#### D4. Compliance Reports
- Generate reports on demand (GDPR / HIPAA / EU AI Act / RBI)
- PDF preview in browser, then download
- Show compliance score percentage per regulation

#### D5. Progressive Web App (PWA)
- Service worker for offline dashboard viewing
- Push notifications for critical BLOCK events on mobile
- This gives a unique "enterprise app" feel no competitor offers

---

### Phase E: Integration Testing & Load Testing (Week 10–11)

#### E1. Integration Test Suite (`tests/test_integration.py`)
- Use `testcontainers` to spin up real PostgreSQL + Redis in CI
- Test the full pipeline: request → detection → policy → action
- Latency assertions: P95 round-trip < 200ms (detection goal < 100ms)

#### E2. Load Testing (`tests/load_test.py`)
- `Locust` load test with realistic prompt corpus
- Target: 500 concurrent users, P99 < 500ms
- Stress test: 2000 RPS burst, verify Redis rate limiter kicks in correctly

#### E3. End-to-End Test Scenarios
```
Test 1: Plain prompt → ALLOW (score < 30)
Test 2: Prompt with API key → BLOCK (score ≥ 90)
Test 3: Prompt with email → REDACT (score ~80)
Test 4: Prompt injection attempt → BLOCK (score ≥ 90)
Test 5: Shadow AI DNS log → alert created
Test 6: Admin role → same prompt scores 50% lower
Test 7: Compliance report generation → PDF valid
```

---

### Phase F: Security Hardening (Week 11–12)

#### F1. JWT → JWKS in Production
- Switch from `DEV_JWT_SECRET` (HS256) to enterprise OIDC/JWKS (RS256)
- Support Okta, Azure AD, Google Workspace as identity providers

#### F2. Secrets Management
- Replace env var secrets with HashiCorp Vault or AWS Secrets Manager
- Rotate DB credentials without downtime

#### F3. Network Hardening
- All inter-service communication over mTLS
- Docker network: only proxy can reach external internet; detection + governance are internal-only

#### F4. Data Encryption at Rest
- Encrypt `prompt_hash` column (store only hash, never raw prompt)
- Encrypt PII in `detected_spans` JSONB column

---

## 7. HOW TO RUN THE PROJECT

### Prerequisites
- Docker Desktop or Docker Engine (≥ 24.x) + Compose v2
- Git
- 8 GB RAM minimum (16 GB recommended for Ollama)
- NVIDIA GPU + Container Toolkit (optional, for faster Llama inference)

### Step 1: Clone and Configure
```bash
git clone https://github.com/your-org/AI-Governance.git
cd AI-Governance

# Copy environment file and fill in your values
cp .env.example .env

# Required for real LLM proxying (optional for local testing):
# UPSTREAM_OPENAI_URL=https://api.openai.com
# Add your OpenAI API key via X-API-Key header in actual requests
```

### Step 2: Start All Services
```bash
# Start all services (builds images if needed)
make dev

# Or in detached mode:
make docker-up
```

This starts:
| Service | URL | Credentials |
|---|---|---|
| Proxy (FastAPI) | http://localhost:8000 | JWT via `Authorization: Bearer <token>` |
| Detection (FastAPI) | http://localhost:8001 | Internal only |
| Governance (Node.js) | http://localhost:4000 | JWT |
| Dashboard (React) | http://localhost:3000 | demo / demo |
| PostgreSQL | localhost:5432 | aigw / aigw_password |
| Redis | localhost:6379 | — |
| Ollama | http://localhost:11434 | — |

### Step 3: Pull LLM Models (for Tier 3 detection)
```bash
# Pull primary model (Llama3.1:8b, ~4.7GB)
make pull-llama

# Pull fallback model (Mistral:7b, ~4.1GB)
docker exec ai-governance-ollama-1 ollama pull mistral:7b
```

### Step 4: Initialize Database
```bash
# Run Alembic migrations (Python services)
make migrate

# Initialize Governance service Prisma schema
make gov-setup

# Seed demo data (optional)
make gov-seed
```

### Step 5: Verify Health
```bash
curl http://localhost:8000/health    # {"status":"healthy","service":"proxy"}
curl http://localhost:8001/health    # {"status":"healthy","service":"detection"}
curl http://localhost:4000/health    # {"status":"healthy"}
```

### Step 6: Get a Dev JWT Token
```bash
# For local dev with DEV_JWT_SECRET, use the built-in dev token endpoint
curl -X POST http://localhost:8000/api/v1/auth/dev-token \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test-user","org_id":"test-org","role":"analyst"}'
```

### Step 7: Send a Test Prompt
```bash
# Test with a clean prompt (should ALLOW)
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-dev-token>" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "What is the capital of France?"}]
  }'

# Test with a sensitive prompt (should BLOCK)
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-dev-token>" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "My AWS key is AKIAIOSFODNN7EXAMPLE and secret key is wJalrXUtnFEMI/K7MDENG. Help me debug this."}]
  }'
```

### Step 8: Test Detection Service Directly
```bash
# Direct detection test (no auth required on port 8001)
curl -X POST http://localhost:8001/detect \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Email john.doe@company.com, Aadhaar: 1234 5678 9012, API key: sk-abc123xyz",
    "user_id": "test",
    "role": "developer"
  }'
```

---

## 8. HOW TO TEST

### Unit / Integration Tests
```bash
# Run full test suite with coverage
make test

# Fast run (stop on first failure)
make test-fast

# Individual modules
poetry run pytest tests/test_integration.py -v -k "test_detection"
poetry run pytest tests/test_integration.py -v -k "test_policy"
```

### Load Test
```bash
# Start Locust UI at http://localhost:8089
poetry run locust -f tests/load_test.py --host http://localhost:8000

# Headless (CI)
poetry run locust -f tests/load_test.py --host http://localhost:8000 \
  --users 100 --spawn-rate 10 --run-time 60s --headless
```

### Lint & Type Check
```bash
make lint       # ruff + mypy
make lint-fix   # auto-fix ruff issues
```

### Manual Dashboard Testing
1. Open http://localhost:3000
2. Log in with demo credentials
3. Navigate to **Governance** → see risk overview
4. Navigate to **Threats** → see live detection feed
5. Navigate to **Policies** → create/edit/test policy rules
6. Navigate to **Shadow AI** → see unauthorized AI tool detections
7. Navigate to **Reports** → generate GDPR/HIPAA compliance report

### Test Shadow AI Detection
```bash
# Parse a sample DNS log through the detection module
python -c "
from detection.app.shadow_ai import AIDomainRegistry, DNSLogParser
registry = AIDomainRegistry()
parser = DNSLogParser(registry)
event = parser.parse_line('2024-01-15T10:30:45 192.168.1.100 chat.openai.com')
print(event)  # Should detect as AI domain
"
```

---

## 9. DEVELOPMENT WORKFLOW

### Adding a New Detector
1. Create `detection/app/detectors/my_detector.py` implementing the `BaseDetector` protocol:
   ```python
   from proxy.app.models import DetectionResult
   class MyDetector:
       def detect(self, text: str) -> DetectionResult: ...
   ```
2. Register in `detection/app/main.py` in the parallel futures list
3. Add category weight in `detection/app/risk_scorer.py`
4. Add unit test in `tests/`

### Adding a New Policy Condition Field
1. Add field to `RequestContext` in `proxy/app/policy_engine.py`
2. Add resolution logic in `_evaluate_condition()`
3. Update Prisma schema if the field comes from DB
4. Add test case in `tests/test_integration.py`

### Adding a New Provider Adapter
1. Add enum value to `LLMProvider` in `proxy/app/models.py`
2. Implement `get_upstream_url()` and `get_headers()` in `proxy/app/adapters.py`
3. Test with `curl -H "X-LLM-Provider: newprovider" ...`

---

## 10. COMPLIANCE MAPPING

| Regulation | Coverage | Feature |
|---|---|---|
| **GDPR Art. 5** | Data minimization | Redaction before transmission |
| **GDPR Art. 30** | Records of processing | Audit log with all events |
| **GDPR Art. 9** | Special category data | Regulatory detector (health, biometric) |
| **HIPAA** | PHI detection | Regulatory detector + healthcare word patterns |
| **RBI** | Financial data localization | Indian-specific field detection |
| **EU AI Act Art. 4** | AI literacy obligations | Governance advisor recommendations |
| **EU AI Act Art. 9** | Risk management | Quantified 0–100 risk score |
| **EU AI Act Art. 13** | Transparency | Audit dashboard with full trace |
| **PCI-DSS** | Card data | Regex: credit card, CVV |
| **SOC 2** | Access control | JWT auth, rate limiting, audit trail |

---

## 11. PROJECT FILE TREE

```
AI-Governance/
├── proxy/                  # FastAPI proxy (port 8000)
│   ├── Dockerfile
│   └── app/
│       ├── main.py         # App factory
│       ├── routes.py       # /v1/chat/completions
│       ├── policy_engine.py
│       ├── adapters.py
│       ├── auth.py
│       ├── audit.py
│       ├── audit_consumer.py
│       ├── config.py
│       ├── database.py
│       ├── db_models.py
│       ├── models.py
│       └── logging_config.py
│
├── detection/              # Detection engine (port 8001)
│   ├── Dockerfile
│   └── app/
│       ├── main.py         # /detect endpoint
│       ├── regex_detector.py
│       ├── ner_detector.py
│       ├── risk_scorer.py
│       ├── llama_classifier.py
│       ├── shadow_ai.py
│       ├── ai_domains.yaml
│       └── detectors/
│           ├── hallucination_detector.py
│           ├── bias_detector.py
│           ├── security_code_detector.py
│           ├── regulatory_detector.py
│           └── prompt_injection_detector.py
│
├── governance/             # Governance service (port 4000, Node.js)
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── index.ts
│       ├── routes/
│       └── middleware/
│
├── dashboard/              # React dashboard (port 3000)
│   ├── Dockerfile
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/
│       ├── App.tsx
│       ├── pages/
│       │   ├── governance/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── ThreatDetection.tsx
│       │   │   ├── Compliance.tsx
│       │   │   ├── Advisor.tsx
│       │   │   └── ...
│       │   └── ...
│       ├── components/
│       ├── contexts/
│       └── layouts/
│
├── tests/
│   ├── test_integration.py
│   └── load_test.py
│
├── scripts/
│   └── init-db.sql
│
├── docker-compose.yml
├── Makefile
├── pyproject.toml
├── .env.example
└── IMPLEMENTATION_PLAN.md  ← this file
```

---

## 12. DEVELOPMENT TIMELINE (REMAINING)

| Week | Task | Owner |
|---|---|---|
| **Week 1** | Phase A: Backend hardening (DB audit read-back, real analytics) | Backend |
| **Week 2** | Phase B1–B4: Detection engine enhancement (spaCy upgrade, Redis cache) | ML/Backend |
| **Week 3** | Phase C1–C3: Governance service finalization (Prisma, WebSocket) | Backend |
| **Week 4** | Phase D1–D2: Dashboard real data + charts | Frontend |
| **Week 5** | Phase D3–D5: Policy builder, compliance reports, Shadow AI map | Frontend |
| **Week 6** | Phase B2: BERT/DistilBERT classifier (optional Tier 3 alternative) | ML |
| **Week 7** | Phase E: Integration + load testing | QA |
| **Week 8** | Phase F: Security hardening (mTLS, Vault, encryption) | Security |
| **Week 9** | Demo preparation, documentation, final integration | All |
| **Week 10** | Buffer / polish / competition submission | All |

---

## 13. QUICK REFERENCE COMMANDS

```bash
# Start everything
make dev

# Stop and remove volumes
make docker-down

# Run tests
make test

# Lint
make lint

# Pull Llama model
make pull-llama

# View logs
docker compose logs -f proxy
docker compose logs -f detection

# Open Prisma Studio (governance DB)
make gov-studio

# Force rebuild
docker compose build --no-cache
```

---

*ShieldAI — The world's first semantic-layer LLM firewall with EU AI Act compliance built in.*
