# ╔══════════════════════════════════════════════════════════════════╗
# ║           Airlock — AI Governance Gateway                      ║
# ║           Master Makefile                                       ║
# ╚══════════════════════════════════════════════════════════════════╝
#
# USAGE:
#   make help          — print this menu
#   make up            — start all services (auto-fixes port conflicts)
#   make down          — stop & remove containers
#   make restart       — full down + up cycle
#   make logs          — tail all service logs
#   make status        — show container health
#   make test          — run the full test suite
#   make setup         — first-time: build + wait + seed DB

.DEFAULT_GOAL := help
SHELL         := /bin/bash

# ─── Colours ───────────────────────────────────────────────────────
RESET  := \033[0m
BOLD   := \033[1m
GREEN  := \033[32m
YELLOW := \033[33m
CYAN   := \033[36m
RED    := \033[31m
GREY   := \033[90m

define INFO
	@printf "$(CYAN)$(BOLD)➤  $(1)$(RESET)\n"
endef
define OK
	@printf "$(GREEN)$(BOLD)✓  $(1)$(RESET)\n"
endef
define WARN
	@printf "$(YELLOW)$(BOLD)⚠  $(1)$(RESET)\n"
endef
define ERR
	@printf "$(RED)$(BOLD)✗  $(1)$(RESET)\n"
endef

# ─── Project constants ─────────────────────────────────────────────
PROJECT      := ai-governance
COMPOSE      := docker compose
COMPOSE_FILE := docker-compose.yml

# Postgres port in docker-compose is 5433 (host) → 5432 (container).
# If another container already owns 5433, we automatically move to 5434.
PG_PORT      ?= 5433

# ─── Port conflict detection ───────────────────────────────────────
# Checks each required host port and prints a warning if occupied by
# something other than this project.
CHECK_PORTS := 8000 8001 4000 3000 6379

define check_port
	@if ss -tlnp 2>/dev/null | grep -q ":$(1) " && \
	   ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "$(PROJECT)"; then \
		printf "$(YELLOW)⚠  Port $(1) is in use by another process$(RESET)\n"; \
	fi
endef

# ─── .PHONY targets ───────────────────────────────────────────────
.PHONY: help up up-core up-all down restart status logs logs-proxy \
        logs-detection logs-governance logs-dashboard build build-proxy \
        build-detection build-governance build-dashboard \
        test test-fast test-watch lint lint-fix \
        migrate seed gov-setup gov-seed gov-studio \
        pull-models install-sdk clean clean-volumes \
        setup health-wait fix-pg-port demo share \
        proxy-shell detection-shell pg-shell redis-cli \
        monitor-up monitor-down monitor-logs monitor-alertmanager \
        monitor-status monitor-test-alert

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HELP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
help:
	@printf "\n$(BOLD)$(CYAN)Airlock — AI Governance Gateway$(RESET)\n\n"
	@printf "$(BOLD)Core$(RESET)\n"
	@printf "  $(GREEN)make setup$(RESET)          First-time setup: build + start + seed\n"
	@printf "  $(GREEN)make demo$(RESET)           Clean start + seed + open screens + continuous loop\n"
	@printf "  $(GREEN)make up$(RESET)             Start all services (detached)\n"
	@printf "  $(GREEN)make up-core$(RESET)        Start infra only: postgres + redis\n"
	@printf "  $(GREEN)make down$(RESET)           Stop & remove containers (keep volumes)\n"
	@printf "  $(GREEN)make restart$(RESET)        Full down + up cycle\n"
	@printf "  $(GREEN)make status$(RESET)         Show container health table\n"
	@printf "\n$(BOLD)Logs$(RESET)\n"
	@printf "  $(GREEN)make logs$(RESET)           Tail all service logs\n"
	@printf "  $(GREEN)make logs-proxy$(RESET)     Tail proxy only\n"
	@printf "  $(GREEN)make logs-detection$(RESET) Tail detection only\n"
	@printf "  $(GREEN)make logs-governance$(RESET) Tail governance only\n"
	@printf "\n$(BOLD)Build$(RESET)\n"
	@printf "  $(GREEN)make build$(RESET)          Rebuild all images\n"
	@printf "  $(GREEN)make build-proxy$(RESET)    Rebuild proxy only\n"
	@printf "  $(GREEN)make build-detection$(RESET) Rebuild detection only\n"
	@printf "\n$(BOLD)Testing$(RESET)\n"
	@printf "  $(GREEN)make test$(RESET)           Full pytest suite with coverage\n"
	@printf "  $(GREEN)make test-fast$(RESET)      Fast mode: stop on first failure\n"
	@printf "  $(GREEN)make lint$(RESET)           ruff + mypy\n"
	@printf "  $(GREEN)make lint-fix$(RESET)       Auto-fix ruff issues\n"
	@printf "\n$(BOLD)Database$(RESET)\n"
	@printf "  $(GREEN)make migrate$(RESET)        Run Alembic migrations\n"
	@printf "  $(GREEN)make seed$(RESET)           Seed governance + audit data\n"
	@printf "  $(GREEN)make gov-studio$(RESET)     Open Prisma Studio\n"
	@printf "\n$(BOLD)Utilities$(RESET)\n"
	@printf "  $(GREEN)make fix-pg-port$(RESET)    Patch docker-compose to use port 5434 (conflict fix)\n"
	@printf "  $(GREEN)make install-sdk$(RESET)    Install airlock-sdk in editable mode\n"
	@printf "  $(GREEN)make pull-models$(RESET)    Pull Ollama LLM models\n"
	@printf "  $(GREEN)make clean$(RESET)          Remove build artifacts\n"
	@printf "  $(GREEN)make clean-volumes$(RESET)  Remove containers + volumes (DESTRUCTIVE)\n"
	@printf "  $(GREEN)make proxy-shell$(RESET)    Shell into proxy container\n"
	@printf "  $(GREEN)make pg-shell$(RESET)       psql into postgres\n"
	@printf "  $(GREEN)make redis-cli$(RESET)      redis-cli into redis\n"
	@printf "\n"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STARTUP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## First-time setup: build all images, start everything, wait for health, seed DB
setup:
	$(call INFO,First-time setup — building all images…)
	@$(MAKE) --no-print-directory fix-pg-port
	$(COMPOSE) up -d --build
	$(call INFO,Waiting for services to be healthy…)
	@$(MAKE) --no-print-directory health-wait
	$(call INFO,Running database migrations…)
	@$(MAKE) --no-print-directory migrate || true
	$(call INFO,Seeding governance database…)
	@$(MAKE) --no-print-directory gov-setup || true
	@$(MAKE) --no-print-directory gov-seed  || true
	$(call OK,Setup complete! Visit http://localhost:3000)
	@$(MAKE) --no-print-directory status

## Start all services (detached). Automatically fixes port 5433 conflict.
up: fix-pg-port
	$(call INFO,Starting Airlock services…)
	$(COMPOSE) up -d
	@$(MAKE) --no-print-directory status

## Start core infra only (postgres + redis + ollama) — useful for local dev
up-core: fix-pg-port
	$(call INFO,Starting core infrastructure…)
	$(COMPOSE) up -d postgres redis ollama
	$(call OK,Core infra running — postgres redis ollama)

## Start all services with live build (rebuild changed images)
up-build: fix-pg-port
	$(call INFO,Building + starting all services…)
	$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory status

## Stop containers, keep volumes
down:
	$(call INFO,Stopping all containers…)
	$(COMPOSE) down
	$(call OK,All containers stopped)

demo:
	$(call INFO,Resetting demo environment…)
	$(COMPOSE) down -v
	$(call INFO,Starting all services…)
	$(COMPOSE) up -d
	@for url in http://localhost:8000/health http://localhost:8001/health http://localhost:4000/health http://localhost:3000; do \
		printf "  waiting for $$url"; \
		for i in $$(seq 1 30); do \
			if curl -fsS $$url >/dev/null 2>&1; then printf " $(GREEN)ok$(RESET)\n"; break; fi; \
			if [ $$i -eq 30 ]; then printf " $(RED)failed$(RESET)\n"; exit 1; fi; \
			printf "."; sleep 2; \
		done; \
	done
	$(call INFO,Seeding demo data…)
	@bash scripts/seed.sh
	@printf "$(GREEN)$(BOLD)✅ Airlock is live. Dashboard: http://localhost:3000 | Advisor Screen: http://localhost:3000/advisor-live$(RESET)\n"
	@if command -v xdg-open >/dev/null 2>&1; then \
		xdg-open http://localhost:3000 >/dev/null 2>&1 || true; \
		xdg-open http://localhost:3000/advisor-live >/dev/null 2>&1 || true; \
	elif command -v open >/dev/null 2>&1; then \
		open http://localhost:3000 >/dev/null 2>&1 || true; \
		open http://localhost:3000/advisor-live >/dev/null 2>&1 || true; \
	fi
	@bash scripts/demo_loop.sh

## Full restart
restart: down up

## Rebuild + restart a single service — usage: make restart-svc SVC=proxy
restart-svc:
	$(call INFO,Restarting $(SVC)…)
	$(COMPOSE) up -d --build $(SVC)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PORT CONFLICT HANDLING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Detect port 5433 conflict and patch docker-compose.yml to use 5434
fix-pg-port:
	@if ss -tlnp 2>/dev/null | grep -q ':5433 ' && \
	   ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '$(PROJECT)-postgres'; then \
		printf "$(YELLOW)$(BOLD)⚠  Port 5433 is occupied by: $(RESET)"; \
		docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | grep '5433' | awk '{print $$1}'; \
		if grep -q '"5433:5432"' $(COMPOSE_FILE); then \
			sed -i 's|"5433:5432"|"5434:5432"|g' $(COMPOSE_FILE); \
			printf "$(GREEN)✓  Patched docker-compose.yml: postgres port → 5434$(RESET)\n"; \
		elif grep -q '5433:5432' $(COMPOSE_FILE); then \
			sed -i 's|5433:5432|5434:5432|g' $(COMPOSE_FILE); \
			printf "$(GREEN)✓  Patched docker-compose.yml: postgres port → 5434$(RESET)\n"; \
		fi; \
	fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# STATUS + HEALTH
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Show container status table
status:
	@printf "\n$(BOLD)$(CYAN)Airlock Container Status$(RESET)\n"
	@$(COMPOSE) ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
	 docker ps --filter "name=$(PROJECT)" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
	@printf "\n$(GREY)Endpoints:$(RESET)\n"
	@printf "  Proxy:        $(CYAN)http://localhost:8000$(RESET)\n"
	@printf "  Detection:    $(CYAN)http://localhost:8001$(RESET)\n"
	@printf "  Governance:   $(CYAN)http://localhost:4000$(RESET)\n"
	@printf "  Dashboard:    $(CYAN)http://localhost:3000$(RESET)\n"
	@printf "  AlertManager: $(CYAN)http://localhost:9093$(RESET)\n"
	@printf "  Prometheus:   $(CYAN)http://localhost:9090$(RESET)\n"
	@printf "  Grafana:      $(CYAN)http://localhost:3001$(RESET) (admin/airlock)\n\n"

## Block until all core services report healthy (max 120 s)
health-wait:
	$(call INFO,Waiting for healthy containers (max 120s)…)
	@for svc in redis postgres detection proxy; do \
		printf "  waiting for $$svc…"; \
		for i in $$(seq 1 24); do \
			state=$$(docker inspect --format='{{.State.Health.Status}}' \
			         $$($(COMPOSE) ps -q $$svc 2>/dev/null) 2>/dev/null); \
			if [ "$$state" = "healthy" ]; then \
				printf " $(GREEN)healthy$(RESET)\n"; break; \
			fi; \
			if [ $$i -eq 24 ]; then printf " $(YELLOW)timed-out$(RESET)\n"; fi; \
			sleep 5; \
		done; \
	done

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LOGS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
logs:
	$(COMPOSE) logs -f --tail=100

logs-proxy:
	$(COMPOSE) logs -f --tail=100 proxy

logs-detection:
	$(COMPOSE) logs -f --tail=100 detection

logs-governance:
	$(COMPOSE) logs -f --tail=100 governance

logs-dashboard:
	$(COMPOSE) logs -f --tail=100 dashboard

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BUILD
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
build:
	$(call INFO,Rebuilding all Docker images…)
	$(COMPOSE) build

build-proxy:
	$(call INFO,Building proxy image…)
	$(COMPOSE) build proxy

build-detection:
	$(call INFO,Building detection image…)
	$(COMPOSE) build detection

build-governance:
	$(call INFO,Building governance image…)
	$(COMPOSE) build governance

build-dashboard:
	$(call INFO,Building dashboard image…)
	$(COMPOSE) build dashboard

## Rebuild dashboard with a specific host IP (for network sharing)
## Usage: make rebuild-dashboard IP=192.168.1.105
rebuild-dashboard:
	@test -n "$(IP)" || (printf "$(RED)✗  Set IP=<your-ip>  e.g. make rebuild-dashboard IP=192.168.1.105$(RESET)\n" && exit 1)
	VITE_API_URL=http://$(IP):8000 VITE_GOVERNANCE_URL=http://$(IP):4000 \
	$(COMPOSE) build dashboard \
	  --build-arg VITE_API_URL=http://$(IP):8000 \
	  --build-arg VITE_GOVERNANCE_URL=http://$(IP):4000
	$(COMPOSE) up -d dashboard

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TESTING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
test:
	$(call INFO,Running full test suite…)
	poetry run pytest tests/ -v \
	  --cov=proxy --cov=detection --cov=governance/src/engine \
	  --cov-report=term-missing \
	  --cov-report=html:htmlcov \
	  -q

test-fast:
	$(call INFO,Running fast tests (stop-on-first-failure)…)
	poetry run pytest tests/ -x -q --tb=short

test-detection:
	$(call INFO,Running detection tests only…)
	poetry run pytest tests/test_detection_comprehensive.py -v -q --tb=short

test-engines:
	$(call INFO,Running governance engine tests…)
	poetry run pytest tests/test_governance_engine_e2e.py -v -q --tb=short

test-benchmarks:
	$(call INFO,Running performance benchmarks…)
	poetry run pytest tests/test_performance_benchmarks.py -v --tb=short

test-chaos:
	$(call INFO,Running chaos/resilience tests…)
	poetry run pytest tests/test_engines_chaos.py -v -x --tb=short

test-governance:
	$(call INFO,Running governance API tests…)
	poetry run pytest tests/test_governance_comprehensive.py -v -q --tb=short

test-all-engines: test-engines test-benchmarks test-chaos
	$(call OK,All engine tests passed)

test-watch:
	$(call INFO,Watching tests…)
	poetry run ptw tests/ -- -q --tb=short

lint:
	$(call INFO,Linting — ruff + mypy…)
	poetry run ruff check proxy/ detection/ tests/
	poetry run mypy proxy/ detection/

lint-fix:
	$(call INFO,Auto-fixing lint issues…)
	poetry run ruff check --fix proxy/ detection/ tests/
	poetry run ruff format proxy/ detection/ tests/

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DATABASE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
migrate:
	$(call INFO,Running Alembic migrations…)
	@docker exec $$($(COMPOSE) ps -q proxy) sh -lc 'if [ -f alembic.ini ] || [ -f proxy/alembic.ini ]; then poetry run alembic upgrade head; else echo "No Alembic configuration found, skipping."; fi'

migrate-new:
	@test -n "$(msg)" || (printf "$(RED)✗  Set msg= e.g. make migrate-new msg=add_sessions_table$(RESET)\n" && exit 1)
	docker exec $$($(COMPOSE) ps -q proxy) poetry run alembic revision --autogenerate -m "$(msg)"

migrate-history:
	docker exec $$($(COMPOSE) ps -q proxy) poetry run alembic history --verbose

gov-setup:
	$(call INFO,Pushing Prisma schema to database…)
	docker exec $$($(COMPOSE) ps -q governance) npx prisma db push --accept-data-loss

gov-seed:
	$(call INFO,Seeding governance database…)
	docker exec $$($(COMPOSE) ps -q governance) npm run db:seed

gov-studio:
	$(call INFO,Opening Prisma Studio on http://localhost:5555…)
	docker exec -it $$($(COMPOSE) ps -q governance) npx prisma studio

## Seed audit history data for demo/dashboard
seed:
	$(call INFO,Seeding audit history…)
	@if $(COMPOSE) ps -q proxy > /dev/null 2>&1; then \
		docker exec $$($(COMPOSE) ps -q proxy) poetry run python scripts/seed_audit_history.py; \
	else \
		printf "$(YELLOW)⚠  Proxy not running — start services first with: make up$(RESET)\n"; \
	fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MODELS + SDK
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pull-models:
	$(call INFO,Pulling Ollama models (llama3.1:8b + mistral:7b)…)
	docker exec $$($(COMPOSE) ps -q ollama) ollama pull llama3.1:8b
	docker exec $$($(COMPOSE) ps -q ollama) ollama pull mistral:7b

pull-llama:
	docker exec $$($(COMPOSE) ps -q ollama) ollama pull llama3.1:8b

install-sdk:
	$(call INFO,Installing airlock-sdk in editable mode…)
	pip install -e sdk/
	$(call OK,SDK installed — import airlock)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# INTERACTIVE SHELLS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
proxy-shell:
	docker exec -it $$($(COMPOSE) ps -q proxy) /bin/bash

detection-shell:
	docker exec -it $$($(COMPOSE) ps -q detection) /bin/bash

pg-shell:
	docker exec -it $$($(COMPOSE) ps -q postgres) \
	  psql -U aigw -d ai_governance

redis-cli:
	docker exec -it $$($(COMPOSE) ps -q redis) redis-cli

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DEMO + NETWORK SHARING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
share:
	$(call INFO,Setting up network sharing…)
	bash scripts/share_network.sh

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MONITORING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

monitor-up:
	$(call INFO,Starting monitoring stack (alertmanager + prometheus + grafana)…)
	$(COMPOSE) up -d alertmanager prometheus grafana
	$(call OK,Monitoring stack started)
	@printf "  AlertManager: $(CYAN)http://localhost:9093$(RESET)\n"
	@printf "  Prometheus:   $(CYAN)http://localhost:9090$(RESET)\n"
	@printf "  Grafana:      $(CYAN)http://localhost:3001$(RESET) (admin/airlock)\n"

monitor-down:
	$(call INFO,Stopping monitoring stack…)
	$(COMPOSE) stop alertmanager prometheus grafana
	$(call OK,Monitoring stack stopped)

monitor-logs:
	$(COMPOSE) logs -f --tail=50 alertmanager prometheus grafana

monitor-alertmanager:
	$(COMPOSE) logs -f --tail=50 alertmanager

monitor-status:
	@printf "\n$(BOLD)$(CYAN)Monitoring Stack Status$(RESET)\n"
	@$(COMPOSE) ps --filter "status=running" --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" alertmanager prometheus grafana 2>/dev/null
	@printf "\n$(GREY)Endpoints:$(RESET)\n"
	@printf "  AlertManager: $(CYAN)http://localhost:9093$(RESET)\n"
	@printf "  Prometheus:   $(CYAN)http://localhost:9090$(RESET)\n"
	@printf "  Grafana:      $(CYAN)http://localhost:3001$(RESET) (admin/airlock)\n\n"

monitor-test-alert:
	$(call INFO,Firing test alert via AlertManager…)
	@curl -s -XPOST http://localhost:9093/api/v1/alerts \
	  -H "Content-Type: application/json" \
	  -d '[{ "labels": { "alertname": "TestAlert", "severity": "warning", "job": "airlock-test", "instance": "localhost" }, "annotations": { "summary": "This is a test alert", "description": "Monitoring stack is operational" }, "startsAt": "'$$(date -u +%Y-%m-%dT%H:%M:%SZ)'" }]' && \
	  printf "$(GREEN)✓  Test alert sent to AlertManager$(RESET)\n" || \
	  printf "$(RED)✗  Failed to send test alert (AlertManager running?)$(RESET)\n"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CLEAN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
clean:
	$(call INFO,Removing build artifacts and caches…)
	find . -type d -name __pycache__  -not -path "./.git/*" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -not -path "./.git/*" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache  -not -path "./.git/*" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .ruff_cache  -not -path "./.git/*" -exec rm -rf {} + 2>/dev/null || true
	rm -rf dist/ build/ *.egg-info/ htmlcov/ .coverage dashboard/dist/
	$(call OK,Clean done)

## Destructive: removes containers AND named volumes (postgres data, redis data)
clean-volumes:
	$(call WARN,This will DELETE all database data. Continue? [y/N])
	@read -r ans; [ "$$ans" = "y" ] || (echo "Aborted." && exit 1)
	$(COMPOSE) down -v
	$(call OK,Volumes removed)
