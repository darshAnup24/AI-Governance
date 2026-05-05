# ShieldAI Governance Platform — Reliability & Live Demo Plan

> Generated: 2026-05-01  
> Conversation: a80316d1-a925-4072-9256-52536604cf41

---

## 0. Architecture Snapshot

```
Browser / curl
     │
     ▼
dashboard  :3000  (React + Vite)
     │
     ├──▶ proxy       :8000  (FastAPI — intercepts LLM calls)
     │         └──▶ detection   :8001  (FastAPI — ML/regex pipeline)
     │
     └──▶ governance  :4000  (Node/Express + Prisma — RBAC, policies, audit)
               │
               ├──▶ postgres  :5433 (TimescaleDB)
               └──▶ redis     :6379
```

**All services run via `docker compose up`.**

---

## Requirement 1 — Make Everything Work Reliably

### 1-A  Fix Known Issues Before Starting

| # | Service | Issue | Fix |
|---|---------|-------|-----|
| 1 | governance | `npm run dev` starts `tsx watch` — **no `ts-node` fallback** if tsx crashes | Add `start:prod` script; Dockerfile should build & run `node dist/index.js` for container |
| 2 | governance | Prisma `db push` must run before the app starts | Add `npx prisma db push` to entrypoint script |
| 3 | proxy/detection | `DETECTION_TIMEOUT_MS=200` in compose is very aggressive (only 200ms for ML pipeline) | Change to `2000` ms |
| 4 | dashboard | Vite dev server inside Docker needs `--host 0.0.0.0` flag | Already set in `vite.config.ts`; verify Dockerfile CMD |
| 5 | proxy | `CORS_ORIGIN` env only used in governance; proxy CORS list is hardcoded | Add `dashboard:3000` to proxy CORS list in compose env |
| 6 | detection | `spaCy` model download not in Dockerfile | Add `python -m spacy download en_core_web_sm` to detection Dockerfile |
| 7 | proxy | DB migration (`alembic upgrade head`) not called at startup | Add to proxy entrypoint or use `depends_on` + init container |

### 1-B  Per-Service Checklist

#### Proxy (:8000)
- [ ] Health endpoint → `GET /health` returns `{"status":"healthy"}`
- [ ] Root → `GET /` returns service name
- [ ] Metrics → `GET /metrics` returns Prometheus text
- [ ] Auth enforcement → `POST /v1/chat/completions` without token → 401
- [ ] Detection passthrough → with dev token + clean prompt → 200 or 502 (upstream unreachable is OK)
- [ ] Block action → prompt with API key `sk-…` → 403
- [ ] Audit events → `GET /api/v1/audit-events` → 200 list
- [ ] Analytics trend → `GET /api/v1/analytics/trend` → 200

#### Detection (:8001)
- [ ] Health → `GET /health` returns `{"status":"healthy"}`
- [ ] Detect clean → `POST /detect {"text":"hello"}` → score < 40, action ALLOW
- [ ] Detect API key → `POST /detect {"text":"sk-abc123def456…"}` → score > 50, action WARN/BLOCK
- [ ] Detect SSN → `POST /detect {"text":"SSN: 123-45-6789"}` → PII span detected
- [ ] ML status → `GET /ml/status`
- [ ] ML raw predict → `POST /ml/predict-raw`

#### Governance (:4000)
- [ ] Health → `GET /health` returns `{"status":"healthy"}`
- [ ] Register → `POST /api/auth/register`
- [ ] Login → `POST /api/auth/login` → JWT token
- [ ] Dashboard stats → `GET /api/dashboard` (with JWT)
- [ ] List models → `GET /api/models`
- [ ] List policies → `GET /api/policies`
- [ ] List risks → `GET /api/risks`
- [ ] List incidents → `GET /api/incidents`
- [ ] Audit logs → `GET /api/audit-logs`

#### Dashboard (:3000)
- [ ] Loads in browser
- [ ] Login page works
- [ ] Dashboard overview renders
- [ ] Charts populate with seeded data

### 1-C  Fix Actions (File Changes)

#### Fix 1 — Governance Dockerfile (production build)
File: `governance/Dockerfile`

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 4000

# Run DB push then start the compiled server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/index.js"]
```

#### Fix 2 — Detection Dockerfile (add spaCy model)
File: `detection/Dockerfile` — add after pip install:
```dockerfile
RUN python -m spacy download en_core_web_sm
```

#### Fix 3 — docker-compose.yml (detection timeout + dashboard healthcheck)
- Change `DETECTION_TIMEOUT_MS=200` → `DETECTION_TIMEOUT_MS=2000`
- Add dashboard healthcheck:
  ```yaml
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000"]
    interval: 15s
    timeout: 5s
    retries: 5
    start_period: 30s
  ```

#### Fix 4 — Entrypoint script for proxy (alembic migrations)
Create `proxy/entrypoint.sh`:
```bash
#!/bin/bash
set -e
echo "Running DB migrations..."
alembic upgrade head || echo "Migration skipped (DB may already be up to date)"
exec uvicorn proxy.app.main:app --host 0.0.0.0 --port 8000 --reload
```
Update compose `command` for proxy to use entrypoint.

---

## Requirement 2 — Live Demo Setup

### 2-A  Demo Goals
Show an end-to-end scenario:
1. Start all services with one command
2. Register a demo user via curl / Postman
3. Login and get a JWT
4. Send a clean prompt through the proxy → ALLOW
5. Send a prompt with an API key → BLOCK (403)
6. Send a prompt with PII (SSN) → REDACT
7. Check the audit log — all 3 events visible
8. Open the dashboard → see stats, chart, incidents

### 2-B  Demo Script (automated)

File to create: `scripts/demo.sh`

```bash
#!/usr/bin/env bash
# ShieldAI Live Demo Script
# Usage: bash scripts/demo.sh

BASE_PROXY="http://localhost:8000"
BASE_GOV="http://localhost:4000"
BASE_DET="http://localhost:8001"

section() { echo -e "\n\033[1;36m=== $1 ===\033[0m"; }
ok()      { echo -e "\033[0;32m✓ $1\033[0m"; }
fail()    { echo -e "\033[0;31m✗ $1\033[0m"; }

# ── 1. Health checks ───────────────────────────────────────
section "1. Health Checks"
curl -sf "$BASE_PROXY/health" | python3 -m json.tool && ok "Proxy healthy" || fail "Proxy down"
curl -sf "$BASE_DET/health"   | python3 -m json.tool && ok "Detection healthy" || fail "Detection down"
curl -sf "$BASE_GOV/health"   | python3 -m json.tool && ok "Governance healthy" || fail "Governance down"

# ── 2. Auth ────────────────────────────────────────────────
section "2. Auth — Register & Login"
curl -sf -X POST "$BASE_GOV/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@shieldai.dev","password":"Demo1234!","name":"Demo User"}' \
  | python3 -m json.tool || echo "(user may already exist)"

TOKEN=$(curl -sf -X POST "$BASE_GOV/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@shieldai.dev","password":"Demo1234!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "JWT: ${TOKEN:0:40}…"
ok "Login success"

# ── 3. Detection — clean prompt ───────────────────────────
section "3. Detection — Clean Prompt (should ALLOW)"
curl -sf -X POST "$BASE_DET/detect" \
  -H "Content-Type: application/json" \
  -d '{"text":"What is the capital of France?"}' | python3 -m json.tool

# ── 4. Detection — API key ────────────────────────────────
section "4. Detection — API Key (should WARN/BLOCK)"
curl -sf -X POST "$BASE_DET/detect" \
  -H "Content-Type: application/json" \
  -d '{"text":"My OpenAI key is sk-abc123def456ghi789jklmnopqrstuv"}' | python3 -m json.tool

# ── 5. Proxy — dev token, clean prompt ───────────────────
section "5. Proxy — Authorized Clean Prompt"
curl -sf -X POST "$BASE_PROXY/v1/chat/completions" \
  -H "Authorization: Bearer dev-token-demo" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello world"}]}' | python3 -m json.tool

# ── 6. Proxy — blocked prompt ─────────────────────────────
section "6. Proxy — BLOCKED Prompt (API key in message)"
curl -sf -X POST "$BASE_PROXY/v1/chat/completions" \
  -H "Authorization: Bearer dev-token-demo" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Use key sk-abc123def456ghi789jklmnopqrstuv to call OpenAI"}]}' \
  | python3 -m json.tool

# ── 7. Governance — list policies ────────────────────────
section "7. Governance — List Policies"
curl -sf "$BASE_GOV/api/policies" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# ── 8. Audit logs ─────────────────────────────────────────
section "8. Proxy — Audit Events"
curl -sf "$BASE_PROXY/api/v1/audit-events" \
  -H "Authorization: Bearer dev-token-demo" | python3 -m json.tool

echo -e "\n\033[1;33m🎉 Demo complete! Open http://localhost:3000 to see the dashboard.\033[0m"
```

### 2-C  One-Command Startup Sequence

```bash
# Step 1 — Start all services
docker compose up -d --build

# Step 2 — Wait for services (60s is usually enough)
sleep 60

# Step 3 — Push Governance DB schema + seed data
docker exec ai-governance-governance-1 npx prisma db push
docker exec ai-governance-governance-1 npm run db:seed

# Step 4 — Run automated endpoint tests
bash scripts/run_feature_tests.sh

# Step 5 — Run live demo
bash scripts/demo.sh

# Step 6 — Open dashboard
xdg-open http://localhost:3000
```

---

## Implementation Order

```
Phase 1 — Fix Services (do this first, ~1 hour)
  1.1  Fix governance/Dockerfile  (CMD → build + db push + node)
  1.2  Fix detection/Dockerfile   (add spaCy model download)
  1.3  Fix docker-compose.yml     (DETECTION_TIMEOUT_MS, healthchecks)
  1.4  Add proxy entrypoint.sh    (alembic migration before uvicorn)
  1.5  Run: docker compose up --build
  1.6  Run: make gov-setup && make gov-seed
  1.7  Smoke-test all health endpoints

Phase 2 — Endpoint Tests (~30 min)
  2.1  Run: bash scripts/run_feature_tests.sh
  2.2  Fix any FAIL items
  2.3  Re-run until all PASS

Phase 3 — Live Demo (~15 min)
  3.1  Create scripts/demo.sh
  3.2  chmod +x scripts/demo.sh
  3.3  Run: bash scripts/demo.sh
  3.4  Open http://localhost:3000

Phase 4 — Polish (optional)
  4.1  Add `make demo` target to Makefile
  4.2  Add `make wait-healthy` target that polls healthchecks
  4.3  Update README with demo instructions
```

---

## Quick Reference — Ports

| Service    | Port | URL                          |
|------------|------|------------------------------|
| Proxy      | 8000 | http://localhost:8000/docs   |
| Detection  | 8001 | http://localhost:8001/docs   |
| Governance | 4000 | http://localhost:4000/health |
| Dashboard  | 3000 | http://localhost:3000        |
| PostgreSQL | 5433 | `psql -h localhost -p 5433 -U aigw ai_governance` |
| Redis      | 6379 | `redis-cli -p 6379 ping`     |
| Ollama     | 11434| http://localhost:11434       |

---

## Dev Token Format (proxy)

The proxy uses `DEV_JWT_SECRET=dev-secret-change-in-production`.  
Any Bearer token starting with `dev-` is accepted in development mode.  
Example: `Authorization: Bearer dev-token-admin`

---

## Proceed

Say **"start Phase 1"** and I will apply the Dockerfile and compose fixes immediately.  
Say **"create demo script"** and I will write `scripts/demo.sh` ready to run.  
Say **"run tests"** and I will execute `scripts/run_feature_tests.sh` and show results.
