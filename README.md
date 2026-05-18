# 🛡️ ShieldAI Governance Platform

An enterprise-grade AI security and compliance platform that sits between corporate employees and LLM APIs (OpenAI, Anthropic, etc.), providing real-time content detection, policy enforcement, audit logging, shadow AI monitoring, and governance dashboards.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                              BROWSER / CLIENT                                           │
│                                            (React Dashboard)                                            │
│                                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    │ HTTPS / JWT
                                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                                    NGINX / REVERSE PROXY                                          │  │
│  │                                            :443 → :3000                                           │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                             DASHBOARD SERVICE                                             │  │  │
│  │  │                           (React + Vite + PWA)                                             │  │  │
│  │  │                              Port 3000                                                     │  │  │
│  │  │                                                                                             │  │  │
│  │  │  Pages: Dashboard, Shadow AI, Incidents, Policies, Vendors, User Heatmap, Live Demo     │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                         │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                           GOVERNANCE SERVICE                                                │  │  │
│  │  │                        (Node.js + Express + Prisma)                                         │  │  │
│  │  │                              Port 4000                                                     │  │  │
│  │  │                                                                                             │  │  │
│  │  │  API Endpoints: Users, Policies, Incidents, Vendors, Audit Logs, Dashboard, Heatmap      │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                         │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                               PROXY SERVICE                                                 │  │  │
│  │  │                          (Python + FastAPI)                                                 │  │  │
│  │  │                              Port 8000                                                     │  │  │
│  │  │                                                                                             │  │  │
│  │  │  /v1/chat/completions → Auth → Rate Limit → Detection → Policy → Block/Redact/Allow     │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                                         │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                            DETECTION SERVICE                                               │  │  │
│  │  │                          (Python + FastAPI)                                                 │  │  │
│  │  │                              Port 8001                                                     │  │  │
│  │  │                                                                                             │  │  │
│  │  │  8 Detectors: Regex, NER (DeBERTa), ML (sklearn), ML (spaCy), Prompt Injection,         │  │  │
│  │  │              Code Markers, Secret Context, Vuln Signals                                   │  │  │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                    │
                                ┌───────────────┼───────────────┐
                                ▼               ▼               ▼
                    ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
                    │  PostgreSQL     │ │  Redis      │ │  External LLMs  │
                    │  (Primary DB)   │ │  (Cache)    │ │  OpenAI         │
                    │  Users, Policies│ │  Queue      │ │  Anthropic      │
                    │  Incidents,     │ │  Rate Limit │ │  Azure          │
                    │  Audit Events   │ │             │ │  Ollama (local) │
                    └─────────────────┘ └─────────────┘ └─────────────────┘
```

---

## 📋 High-Level Design (HLD)

### Core Components

| Component | Responsibility | Tech Stack |
|-----------|----------------|-----------|
| **Dashboard** | UI for monitoring, policy management, incidents, vendors, heatmap | React + Vite + PWA |
| **Proxy** | Request interception, auth, detection orchestration, policy enforcement, redaction, audit | Python + FastAPI |
| **Detection Service** | Multi-detector pipeline, risk scoring, span annotation | Python + FastAPI + ML models |
| **Governance Service** | Policy CRUD, incident management, user/org management, vendor registry, audit logs | Node.js + Express + Prisma |
| **PostgreSQL** | Persistent storage for all governance, audit, and configuration data | PostgreSQL 15 |
| **Redis** | Caching (detection results, policies), rate limiting, audit queue | Redis 7 |
| **Upstream LLMs** | Actual LLM inference (OpenAI, Anthropic, Azure, Ollama) | External APIs |

### Data Flow

1. **User Request**: User sends prompt from Dashboard (Live Demo → Chat Gateway)
2. **Proxy Auth**: POST /v1/chat/completions (Proxy:8000) → JWT auth → UserContext extracted
3. **Rate Limit**: Check Redis for user/department RPM/TPM limits
4. **Detection**: POST /detect (Detection:8001) → risk_score, detected_spans, action
5. **Policy Fetch**: GET /api/internal/policies (Governance:4000) → policy rules (cached 30s)
6. **Policy Evaluate**: PolicyEngine.evaluate() → overrides detection action if policy matches
7. **Final Decision**: BLOCK / REDACT / ALLOW
8. **Audit**: AuditEvent emitted to Redis → Postgres (audit_events table)
9. **Forward**: POST to Upstream LLM (OpenAI / Anthropic / Ollama)
10. **Response Inspection**: Detect/redact LLM output
11. **Dashboard Poll**: Proxy Monitor, Shadow AI, User Heatmap, Incidents, Policies, Vendors

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
docker compose up --build

# This starts:
#   - Dashboard:  http://localhost:3000  (React admin UI)
#   - Proxy:      http://localhost:8000  (FastAPI + Swagger at /docs)
#   - Detection:  http://localhost:8001  (Detection engine)
#   - Governance: http://localhost:4000  (Governance API)
#   - PostgreSQL: localhost:5433
#   - Redis:      localhost:6379
#   - Ollama:     localhost:11434
```

### Access the Dashboard

Open `http://localhost:3000` in your browser. Dev mode accepts any email/password.

---

## 📖 Dashboard Features

### Main Pages

| Page | Purpose | Key Features |
|------|---------|--------------|
| **Dashboard** | Executive overview | KPI cards, risk trend chart, recent incidents, department rankings |
| **Shadow AI** | Unauthorized AI monitoring | Bar charts by tool, pie charts by category, geo detections, weekly trends |
| **Incidents** | Security incident board | Kanban board (OPEN → IN REVIEW → RESOLVED → CLOSED), severity levels |
| **Policies** | Policy management | CRUD rules, test sandbox, risk score slider |
| **Vendors** | AI vendor registry | Risk assessment, radar charts, certifications tracking |
| **User Heatmap** | Risk per employee × day | GitHub-style heatmap, risk color coding, user ranking |
| **Compliance** | EU AI Act / SOC 2 / GDPR | Compliance dashboard, risk assessments, audit log exports |

### Live Demo Center

Located at `/live-demo/`, the Live Demo Center provides interactive demonstrations of all features:

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
├── dashboard/              # React admin dashboard
│   ├── src/
│   │   ├── pages/          # Dashboard, Shadow AI, Incidents, Policies, etc.
│   │   ├── pages/demo/     # Live Demo Center
│   │   ├── layouts/        # AppLayout with sidebar
│   │   └── components/     # Reusable components
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 🔒 Security Features

- **JWT Authentication** with JWKS validation (dev mode: any Bearer token accepted)
- **Rate Limiting** per-user and per-department (RPM + TPM)
- **Role-Based Access Control** (ADMIN, MANAGER, VIEWER)
- **Org-Level Isolation** (all queries scoped to org_id)
- **Audit Logging** for all governance actions
- **SSRF Prevention** via URL allowlisting for upstream providers
- **No Data Leakage** — Ollama runs 100% on-premise
- **Row-Level Security** for multi-tenant data isolation

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

## 🐛 Known Issues & Recent Fixes

### User Heatmap Not Updating with Live Demo Events
**Problem**: Proxy emitted audit events to Redis streams, but no consumer was running to write them to Postgres. User Heatmap reads from Postgres `audit_events` table, so it never updated with new demo events.

**Fix**: Modified proxy to write audit events directly to Postgres instead of Redis (bypasses consumer for demo environment). Added proper UUID conversion for dev token user_ids.

**Status**: ✅ Fixed - audit events now written directly to Postgres, User Heatmap updates in real-time.

---

## 📝 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, TypeScript, TailwindCSS, Recharts, Lucide Icons |
| **Proxy Backend** | Python 3.11, FastAPI, httpx, asyncpg |
| **Detection Backend** | Python 3.11, FastAPI, sklearn, spaCy, ONNX, regex |
| **Governance Backend** | Node.js 20, Express, Prisma ORM |
| **Database** | PostgreSQL 15 |
| **Cache** | Redis 7 |
| **Infrastructure** | Docker, Docker Compose (dev), Nginx (reverse proxy) |
| **LLM Providers** | OpenAI, Anthropic, Azure OpenAI, Ollama (local) |

---

## 📄 License

MIT
