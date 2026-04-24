# 🛡️ AI Governance Firewall

An enterprise-grade API proxy that sits between corporate employees and LLM APIs (OpenAI, Anthropic, etc.), providing real-time content detection, policy enforcement, audit logging, and shadow AI monitoring.

## Architecture

```
┌──────────────┐     ┌─────────────────────────────┐     ┌──────────────┐
│   Employee   │────▶│   AI Governance Firewall    │────▶│  LLM APIs    │
│  (Browser /  │     │                             │     │  (OpenAI,    │
│   IDE / App) │◀────│  Proxy ←→ Detection Engine  │◀────│  Anthropic,  │
└──────────────┘     │  ↕         ↕                │     │  Azure, etc) │
                     │  Policy    Audit Log         │     └──────────────┘
                     │  Engine    (TimescaleDB)     │
                     └─────────────────────────────┘
                                  ↕
                     ┌─────────────────────────────┐
                     │   Admin Dashboard (React)   │
                     │  • Executive Overview       │
                     │  • Incident Explorer        │
                     │  • Policy Manager           │
                     │  • Shadow AI Monitor        │
                     └─────────────────────────────┘
```


## Tech Stack
| Layer | Technology |
|-------|-----------|
| **API Proxy** | FastAPI + Python 3.11 + HTTPX |
| **Detection** | spaCy NER + Regex + Ollama/Llama 3.1 |
| **Dashboard** | React 18 + TypeScript + Vite + TailwindCSS + Recharts |
| **Database** | PostgreSQL 15 + TimescaleDB |
| **Cache/Queue** | Redis 7 (rate limiting + audit streams) |
| **LLM Inference** | Ollama (local, no data leakage) |
| **Deployment** | Docker Compose (dev) + Kubernetes Helm (prod) |
| **CI/CD** | GitHub Actions |

---

## 🚀 HOW TO RUN

### Prerequisites

- **Docker** and **Docker Compose** v2+
- **Git**
- (Optional) NVIDIA GPU + drivers for Ollama Llama inference


### Quick Start (Development)
```bash
# 1. Clone the repository
git clone https://github.com/your-org/AI-Governance.git
cd AI-Governance

# 2. Copy environment config
cp .env.example .env

# 3. Start all services
docker compose up --build

# This starts:
#   - Proxy:      http://localhost:8000  (FastAPI + Swagger at /docs)
#   - Detection:  http://localhost:8001  (Detection engine)
#   - Dashboard:  http://localhost:3000  (React admin UI)
#   - PostgreSQL: localhost:5432
#   - Redis:      localhost:6379
#   - Ollama:     localhost:11434
```

### Running Dashboard Locally (without Docker)

```bash
cd dashboard
npm install
npm run dev
# Open http://localhost:3000
```

### Running Backend Locally (without Docker)

```bash
# Install Poetry
pip install poetry

# Install dependencies
poetry install

# Start proxy
poetry run uvicorn proxy.app.main:app --reload --port 8000

# Start detection (in another terminal)
poetry run uvicorn detection.app.main:app --reload --port 8001
```

### Running Tests

```bash
# Unit + integration tests
poetry run pytest tests/ -v

# With coverage
poetry run pytest tests/ -v --cov=proxy --cov=detection --cov-report=term-missing

# Load test (requires running proxy)
poetry run locust -f tests/load_test.py --host http://localhost:8000
```

### Kubernetes Deployment

```bash
# Build and push Docker images
docker build -t your-registry/ai-gw-proxy:latest -f proxy/Dockerfile .
docker build -t your-registry/ai-gw-detection:latest -f detection/Dockerfile .
docker build -t your-registry/ai-gw-dashboard:latest -f dashboard/Dockerfile .

# Deploy with Helm
cd infra/helm
helm install ai-gw ./ai-gateway -f ai-gateway/values.yaml -n ai-governance --create-namespace
```

---

## 📖 HOW TO USE

### 1. Access the Dashboard

1. Open `http://localhost:3000` in your browser
2. Log in with any email/ford (dev mode accepts all credentials)
3. You'll see the **Executive Dashboard** with real-time metrics

### 2. Dashboard Pages

| Page | Purpose |
|------|---------|
| **Dashboard** | KPI cards, risk trend chart, recent incidents, department rankings |
| **Incidents** | Search/filter flagged events, view detection details with radar chart |
| **Policies** | Create/edit/toggle policy rules, test sandbox with risk score slider |
| **Shadow AI** | Unauthorized AI tool usage charts by tool and department |
| **Reports** | Generate compliance reports in PDF, CSV, or JSON |
| **Settings** | Organization config, detection sensitivity, system status |

### 3. Use as API Proxy

Point your LLM API calls through the proxy instead of directly to OpenAI/Anthropic:

```python
import openai

# Instead of: openai.base_url = "https://api.openai.com/v1"
client = openai.OpenAI(
    base_url="http://localhost:8000/v1",  # ← AI Governance Proxy
    api_key="your-openai-key",
    default_headers={
        "Authorization": "Bearer your-jwt-token",  # Corporate auth
        "X-LLM-Provider": "openai",                # Provider selection
    },
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}],
)
```

### 4. API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | OpenAI-compatible proxy endpoint |
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus metrics |
| `/docs` | GET | Swagger API documentation |
| `/api/v1/policies` | GET/POST | List/create policy rules |
| `/api/v1/policies/test` | POST | Test policy against sample data |
| `/api/v1/policies/{id}` | PUT/DELETE | Update/delete policy |
| `/api/v1/analytics/trend` | GET | Risk trend data (30 days) |
| `/api/v1/audit-events` | GET | List audit events |

### 5. Detection Tiers

| Tier | Engine | Speed | What it Detects |
|------|--------|-------|-----------------|
| **Tier 1** | Regex + Rules | <5ms | API keys, SSNs, credit cards, credentials, JWTs, connection strings |
| **Tier 2** | spaCy NER | <80ms | Person names, organizations, employee IDs, project codes |
| **Tier 3** | Llama 3.1 (local) | <3s | Ambiguous content, trade secrets, confidential business context |

### 6. Policy Actions

| Score Range | Action | Behavior |
|-------------|--------|----------|
| 0-29 | **ALLOW** | Pass through silently |
| 30-59 | **LOG** | Allow but log the event |
| 60-79 | **WARN** | Return warning header but allow |
| 80-89 | **REDACT** | Replace sensitive spans with `[REDACTED:CATEGORY]` |
| 90-100 | **BLOCK** | Return 403 Forbidden |

### 7. Response Headers

Every proxied response includes governance metadata:

```
X-Request-ID: uuid
X-Risk-Score: 42
X-Action: ALLOW
X-Response-Time: 0.0823s
```

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
│   │   ├── adapters.py     # Multi-provider normalization
│   │   ├── auth.py         # JWT auth + rate limiter
│   │   ├── audit.py        # Redis Streams emitter
│   │   ├── audit_consumer.py  # Background audit writer
│   │   ├── policy_engine.py   # Rule evaluator + API
│   │   ├── db_models.py    # SQLAlchemy ORM models
│   │   └── database.py     # Async DB sessions
│   └── Dockerfile
├── detection/              # ML detection engine
│   ├── app/
│   │   ├── main.py         # Detection service + pipeline
│   │   ├── regex_detector.py  # Tier 1: regex patterns
│   │   ├── ner_detector.py    # Tier 2: spaCy NER
│   │   ├── llama_classifier.py # Tier 3: Llama (Ollama)
│   │   ├── risk_scorer.py  # Score aggregation
│   │   ├── shadow_ai.py    # Shadow AI detection
│   │   └── ai_domains.yaml # 60+ AI tool domains
│   └── Dockerfile
├── dashboard/              # React admin dashboard
│   ├── src/
│   │   ├── pages/          # Dashboard, Incidents, Policies, etc.
│   │   ├── layouts/        # AppLayout with sidebar
│   │   ├── contexts/       # AuthContext
│   │   ├── components/     # ProtectedRoute
│   │   └── lib/            # Axios API client
│   └── Dockerfile
├── infra/
│   └── helm/ai-gateway/    # Kubernetes Helm chart
├── tests/                  # Integration + load tests
├── scripts/                # DB init scripts
├── docker-compose.yml
├── pyproject.toml
├── Makefile
└── .github/workflows/ci.yml
```

---

## 🔒 Security Features

- **JWT Authentication** with JWKS validation and key rotation
- **Rate Limiting** per-user and per-department (RPM + TPM)
- **SSRF Prevention** via URL allowlisting for upstream providers
- **No Data Leakage** — Llama runs 100% on-premise via Ollama
- **Audit Trail** — every request logged to TimescaleDB via Redis Streams
- **Network Policies** — K8s restricts service-to-service communication
- **Read-Only Filesystem** in container security contexts
- **Row-Level Security** for multi-tenant data isolation

## License

MIT
