# 🛡️ ShieldAI Governance Platform

ShieldAI is an enterprise AI governance and runtime security platform that sits between employees, internal AI applications, and upstream LLM providers. It provides real-time prompt inspection, policy enforcement, asynchronous audit capture, tenant-aware governance workflows, incident response, shadow AI monitoring, and a unified command-center dashboard.

---

## 🏗️ Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      Dashboard / Governance UI                                         │
│                             React command center (:3000) + legacy UI (:3002)                           │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                   │
                                                   │ JWT / Refresh / Tenant Context
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                      Governance API (:4000)                                            │
│              Organizations · Workspaces · Environments · RBAC · Policies · Incidents · Reports        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                  │                                      │                                      │
                  │ internal service auth                │ analytics / config                    │ auth + tenancy
                  ▼                                      ▼                                      ▼
┌──────────────────────────────┐          ┌──────────────────────────────┐          ┌──────────────────────────────┐
│       Proxy Service          │          │      Detection Service       │          │          Demo API            │
│        FastAPI (:8000)       │─────────▶│        FastAPI (:8001)       │          │         Express (:4001)      │
│ Auth · Rate Limit · Policy   │          │ Multi-detector risk engine   │          │ Seeded lab and replay flows  │
│ Enforcement · Live Streams   │          │ Async advisory enrichment    │          │ for isolated demos           │
└──────────────┬───────────────┘          └──────────────────────────────┘          └──────────────┬───────────────┘
               │
               │ publish / consume
               ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Redis Streams Event Backbone (:6379)                                   │
│     audit_events · incident_events · telemetry_events · policy_events · detection_events + retry/DLQ  │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
               │                                      │                                      │
               ▼                                      ▼                                      ▼
┌──────────────────────────────┐          ┌──────────────────────────────┐          ┌──────────────────────────────┐
│   PostgreSQL + TimescaleDB   │          │         ClickHouse           │          │  Prometheus / Grafana / OTEL │
│   source of truth + audit    │          │ long-term analytics & rollup │          │ health, traces, queue metrics│
└──────────────────────────────┘          └──────────────────────────────┘          └──────────────────────────────┘
```

## ✨ What Changed In The Current Architecture

- **Synchronous audit writes were removed from the request path.**
  Proxy audit emission now publishes to durable Redis Streams and returns immediately; workers persist to PostgreSQL and ClickHouse asynchronously.
- **The platform is now tenant-aware by design.**
  Governance APIs and the dashboard operate with organization, workspace, and environment context instead of a flat single-tenant admin model.
- **RBAC moved from coarse roles to scoped permissions.**
  Owner, Admin, Security Admin, Compliance Officer, AI Engineer, Developer, SOC Analyst, Auditor, Viewer, and Incident Responder flows are now supported in the governance layer.
- **The dashboard is now a unified command center.**
  Monitoring, governance, risk, and admin workflows share one design system and one app shell, with the demo lab intentionally isolated but visually consistent.
- **Operational maturity is part of the architecture.**
  Queue metrics, degraded runtime modes, replay tooling, health checks, and demo seed data are built into the stack rather than treated as side utilities.

---

## 📋 High-Level Design (HLD)

### Core Components

| Component | Responsibility | Tech Stack |
|-----------|----------------|-----------|
| **Dashboard** | Unified command center for monitoring, governance, risk, settings, and demo lab navigation | React + Vite + Tailwind |
| **Proxy** | OpenAI-compatible gateway, request inspection, runtime modes, audit publishing, live telemetry | Python + FastAPI |
| **Detection Service** | Multi-detector pipeline, risk scoring, advisory enrichment, detector resilience | Python + FastAPI + ML models |
| **Governance Service** | Organizations, workspaces, environments, RBAC, incidents, providers, reports, onboarding | Node.js + Express + Prisma |
| **Demo API** | Isolated live-demo backend with seeded timelines and lab endpoints | Node.js + Express |
| **PostgreSQL / TimescaleDB** | Source of truth for governance, tenancy, audit, incidents, and session data | PostgreSQL 15 + TimescaleDB |
| **Redis Streams** | Durable event bus, retries, DLQ, cache, rate limiting, worker coordination | Redis 7 |
| **ClickHouse** | Analytical sink for event ingestion and operational rollups | ClickHouse |
| **Observability** | Metrics, tracing, queue health, runtime health | Prometheus + Grafana + OpenTelemetry |
| **Upstream LLMs** | Actual LLM inference (OpenAI, Anthropic, Azure, Ollama) | External APIs |

### Data Flow

1. **User Request**: A dashboard workflow, SDK client, or demo-lab session sends a prompt or governance action.
2. **Identity Resolution**: Governance-backed JWT/session context resolves user, organization, workspace, and environment.
3. **Proxy Enforcement**: The proxy authenticates, rate-limits, calls the detection service, and evaluates governance policies.
4. **Decision**: The request is allowed, warned, redacted, or blocked.
5. **Async Event Publish**: Audit, policy, incident, telemetry, and detection events are published to Redis Streams.
6. **Immediate Return**: The user-facing response is returned without waiting for audit persistence.
7. **Background Processing**: Workers consume the streams, apply retries/DLQ rules, and persist batches into PostgreSQL and ClickHouse.
8. **Live Operations**: Dashboard runtime panels consume live telemetry, governance analytics, and seeded demo activity from the backend services.

---

## 🚀 Quick Start

### Prerequisites

- **Docker** and **Docker Compose** v2+
- **Git**
- (Optional) NVIDIA GPU + drivers for Ollama Llama inference

### Development Setup

```bash
# 1. Clone the repository
git clone https://github.com/darshAnup24/AI-Governance.git
cd AI-Governance

# 2. Copy environment config
cp .env.example .env

# 3. Start all services
make setup

# This starts:
#   - Dashboard:      http://localhost:3000  (unified command center)
#   - Governance UI:  http://localhost:3002  (legacy governance UI)
#   - Demo UI:        http://localhost:3003  (isolated lab UI)
#   - Proxy:          http://localhost:8000  (FastAPI + Swagger at /docs)
#   - Detection:      http://localhost:8001  (detection engine)
#   - Governance:     http://localhost:4000  (governance API)
#   - Demo API:       http://localhost:4001
#   - PostgreSQL:     localhost:5434
#   - Redis:      localhost:6379
#   - ClickHouse: localhost:8123
#   - Prometheus: localhost:9090
#   - Grafana:    localhost:3001
```

### Access the Dashboard

Open `http://localhost:3000` in your browser.

Seeded local demo account:

- `sarah.chen@acme-financial.com`
- `Airlock123!`

---

## 📖 Dashboard Features

### Main Pages

| Page | Purpose | Key Features |
|------|---------|--------------|
| **Dashboard** | Operational command center | Queue health, runtime mode, policy outcomes, incident signals |
| **Shadow AI** | Unauthorized AI monitoring | Live detections, source trends, suspicious usage tracking |
| **Incidents** | Investigation workflow | Severity, ownership, activity history, governance actions |
| **Policies** | Policy management | Scoped rules, simulations, enforcement state |
| **Reports / Audit Logs** | Audit export and evidence | Event timelines, report generation, investigation support |
| **Governance** | AI inventory and posture | Models, vendors, datasets, assessments, advisor guidance |
| **Compliance** | Framework readiness | EU AI Act / SOC 2 / GDPR posture and evidence summaries |
| **Settings** | Tenant administration | SSO readiness, invites, sessions, runtime controls |

### Live Demo Center

Located in the unified dashboard under `/live-demo/*` and also available through the dedicated demo UI on `:3003`, the Live Demo Center provides isolated, seeded demonstrations of core platform capabilities:

| Demo Tab | What It Does |
|----------|--------------|
| **Prompt Inspector** | Detection pipeline visualization, span highlighting, risk gauge |
| **Policy Enforcement** | Live policy list + 6-step request flow demonstration |
| **Chat Gateway** | Full chat UI routed through proxy with real-time detection |
| **Audit & Incidents** | Test events that populate audit DB and auto-create incidents |
| **Shadow AI Sim** | Inject tool usage events that appear on Shadow AI page |

---

## 🔧 API Usage

### OpenAI-Compatible Proxy Endpoint

Point your LLM API calls through the proxy:

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:8000/v1",  # ← ShieldAI Proxy
    api_key="your-openai-key",
    default_headers={
        "Authorization": "Bearer dev-secret-change-in-production",  # Dev JWT
        "X-LLM-Provider": "openai",
    },
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}],
)
```

### Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | OpenAI-compatible proxy endpoint |
| `/health` | GET | Health check |
| `/docs` | GET | Swagger API documentation |
| `/api/v1/shadow-ai/events` | POST | Shadow AI detection ingestion |
| `/api/v1/shadow-ai/detections` | GET | List shadow AI alerts |
| `/api/v1/audit-events` | GET | Audit event query |
| `/api/v1/inspect` | POST | Ad-hoc detection (demo only) |

---

## 🔍 Detection Pipeline

### 8 Parallel Detectors

1. **Regex Detector** → PII, API keys, credentials, patterns
2. **NER Detector (DeBERTa)** → Customer names, custom entities
3. **ML Classifier (sklearn)** → PII, bias, hallucination, regulatory
4. **ML Classifier (spaCy)** → PII, bias, hallucination, regulatory
5. **Prompt Injection Detector** → System prompt overrides, jailbreaks
6. **Code Markers Detector** → Code language detection
7. **Secret Context Detector** → Secret-related patterns
8. **Vuln Signal Detector** → Security vulnerability patterns

### Risk Scoring

- **Base score**: Max(span confidence)
- **Category multipliers**: Injection ×1.5, PII ×1.2, etc.
- **User role modifiers**: Admin ×0.85, Security ×0.7
- **Input context**: Code vs natural language
- **EU AI Act tier classification**

### Performance

- **Detection latency**: 2.79ms median, 3.51ms p95
- **Throughput**: 1000+ concurrent requests
- **Cache hit rate**: > 80% (semantic cache)

---

## 🎯 Policy Enforcement

### Policy Actions

| Score Range | Action | Behavior |
|-------------|--------|----------|
| 0-29 | **ALLOW** | Pass through silently |
| 30-59 | **LOG** | Allow but log the event |
| 60-79 | **WARN** | Return warning header but allow |
| 80-89 | **REDACT** | Replace sensitive spans with `[REDACTED:CATEGORY]` |
| 90-100 | **BLOCK** | Return 403 Forbidden |

### Policy Evaluation Flow

1. Detection gives base risk_score
2. Governance policies fetched (cached 30s)
3. PolicyEngine evaluates against user context
4. Final decision: BLOCK / REDACT / ALLOW
5. Policy can ONLY make stricter decisions (never loosen)

---

## 📁 Project Structure

```
AI-Governance/
├── proxy/                  # FastAPI proxy service
│   ├── app/
│   │   ├── main.py         # App + middleware + routes
│   │   ├── config.py       # Pydantic settings
│   │   ├── models.py       # Shared data models
│   │   ├── routes.py       # /v1/chat/completions endpoint
│   │   ├── auth.py         # JWT auth + rate limiter
│   │   ├── audit.py        # Audit event emitter
│   │   ├── db_models.py    # SQLAlchemy ORM models
│   │   └── database.py     # Async DB sessions
│   └── Dockerfile
├── detection/              # ML detection engine
│   ├── app/
│   │   ├── main.py         # Detection service + pipeline
│   │   ├── detectors/      # 8 detector implementations
│   │   ├── risk_scorer.py  # Score aggregation
│   │   └── stateful_redactor.py  # Stateful redaction
│   └── Dockerfile
├── governance/             # Node.js governance service
│   ├── src/
│   │   ├── index.ts        # App + middleware
│   │   ├── routes/        # API routes (users, policies, incidents, etc.)
│   │   └── prisma/         # Database schema
│   └── Dockerfile
├── dashboard/              # Unified React command center
│   ├── src/
│   │   ├── pages/          # Monitoring, governance, risk, admin, live demo
│   │   ├── pages/demo/     # Isolated demo lab flows
│   │   ├── layouts/        # Shared app shell and tenant-aware navigation
│   │   └── components/     # Reusable components
│   └── Dockerfile
├── services/demo-api/      # Seeded demo backend for lab flows
├── workers/                # Async audit / incident / telemetry workers
├── docker-compose.yml
├── docs/ARCHITECTURE.md
├── docs/ASYNC_AUDIT_PIPELINE.md
├── .env.example
└── README.md
```

---

## 🔒 Security Features

- **JWT + rotating refresh sessions** with governance-backed tenancy context
- **Rate Limiting** per-user and per-department (RPM + TPM)
- **Permission-scoped RBAC** across organization, workspace, and environment boundaries
- **Org / workspace / environment isolation** throughout governance workflows
- **Asynchronous audit logging** with Redis Streams, retries, and DLQ replay
- **SSRF Prevention** via URL allowlisting for upstream providers
- **No Data Leakage** — Ollama runs 100% on-premise
- **Audit-grade access tracking** for auth, invites, role changes, and runtime actions

---

## 📊 Compliance Features

### EU AI Act
- Tier classification (Minimal / Limited / High / Unacceptable)
- Model risk assessments
- Regulatory flags

### SOC 2
- Full audit trail
- Access controls (RBAC)
- Change logging

### GDPR
- PII detection + redaction
- Right-to-be-forgotten (user deletion)
- Data processing records

---

## 🧱 Recent Architecture Changes

### Async Audit And Event Foundation
- Request-path audit persistence has been replaced by Redis Streams publishing.
- Background workers now handle retries, DLQs, replay, and batched persistence.
- Queue health and worker lag are exposed through Prometheus metrics.

### Enterprise IAM And Tenancy
- Governance now models organizations, workspaces, environments, memberships, sessions, invitations, SSO settings, and scoped permissions.
- The dashboard switches workspace and environment context directly from the app shell.

### Unified Product Surface
- The `dashboard` app is the primary operational UI across monitoring, governance, risk, and settings.
- Demo flows use seeded data and an isolated demo backend while keeping a consistent visual system.

### Setup And Local Reliability
- `make setup` is the supported local bootstrap path.
- Docker mounts, health checks, seed flows, and demo compatibility routes were fixed so the full stack starts cleanly.

---

## 📝 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, TypeScript, TailwindCSS, Recharts, Lucide Icons |
| **Proxy Backend** | Python 3.11, FastAPI, httpx, asyncpg |
| **Detection Backend** | Python 3.11, FastAPI, sklearn, spaCy, ONNX, regex |
| **Governance Backend** | Node.js 20, Express, Prisma ORM |
| **Database** | PostgreSQL 15 |
| **Cache / Event Bus** | Redis 7 + Redis Streams |
| **Infrastructure** | Docker, Docker Compose (dev), Nginx (reverse proxy) |
| **LLM Providers** | OpenAI, Anthropic, Azure OpenAI, Ollama (local) |
| **Error Format** | RFC7807 + ShieldAI structured diagnostics |
| **SDK** | Python SDK (`shieldai-sdk`) with OpenAI-compatible API |

---

## 🔍 ShieldAI Rich Error Feedback

When ShieldAI blocks a request, it returns a structured RFC7807 error with full diagnostics:

```json
{
  "type": "https://shieldai.dev/errors/SECRET_DETECTED",
  "title": "API Key or Secret Detected",
  "status": 403,
  "detail": "An API key or secret was detected.",
  "trace_id": "req_abc123",
  "risk_score": 97,
  "shieldai": {
    "code": "SECRET_DETECTED",
    "category": "API_KEY",
    "tier": "tier_1_regex",
    "confidence": 0.97,
    "span": {"start": 45, "end": 65, "type": "API_KEY",
             "matched_text": "AKIA****EXAMPLE", "context": "...", "checksum_valid": true},
    "policy": {"rule_id": "rule_001", "rule_name": "Block AWS Keys",
               "action": "BLOCK", "priority": 1, "matched_condition": "..."},
    "remediation": {"suggestion": "Remove the key. Use env vars instead.",
                    "docs_url": "https://shieldai.dev/docs/remediation/secrets",
                    "similar_safe_examples": ["How do I configure AWS SDK?"]},
    "detection_breakdown": {
      "tier_1_regex": {"score": 0.97, "action": "BLOCK", "matched": true, "latency_ms": 0.5},
      "tier_2_ner": {"score": 0.0, "action": "ALLOW", "matched": false, "latency_ms": 15.2},
      "tier_3_ml": {"score": 0.12, "action": "ALLOW", "matched": false, "latency_ms": 25.1}
    }
  }
}
```

**Features:**
- **13 error codes** — machine-readable codes per detection category
- **4-tier breakdown** — per-detector confidence, action, latency
- **Span diagnostics** — redacted matched text with position, context
- **Policy attribution** — which rule matched, matched condition
- **Remediation guidance** — category-specific fix suggestions + docs links
- **Safe mode** — production-safe with redacted spans, no breakdown
- **Verbose mode** — full diagnostics for development debugging

See [docs/error-system.md](docs/error-system.md) for full documentation. The Python SDK `shieldai-sdk` is in [`sdk/`](sdk/).

## 📄 License

MIT
