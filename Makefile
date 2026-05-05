.PHONY: dev test lint build clean docker-up docker-down migrate

# ─── Development ───────────────────────────────────────────
dev:
	docker compose up --build

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down -v

# ─── Testing ───────────────────────────────────────────────
test:
	poetry run pytest tests/ -v --cov=proxy --cov=detection --cov-report=term-missing

test-fast:
	poetry run pytest tests/ -x -q

# ─── Linting ──────────────────────────────────────────────
lint:
	poetry run ruff check proxy/ detection/ tests/
	poetry run mypy proxy/ detection/

lint-fix:
	poetry run ruff check --fix proxy/ detection/ tests/

# ─── Build ────────────────────────────────────────────────
build:
	docker compose build

build-proxy:
	docker build -t ai-gw-proxy:latest -f proxy/Dockerfile .

build-detection:
	docker build -t ai-gw-detection:latest -f detection/Dockerfile .

build-dashboard:
	docker build -t ai-gw-dashboard:latest -f dashboard/Dockerfile .

build-governance:
	docker build -t ai-gw-governance:latest -f governance/Dockerfile .

# ─── Ollama Model Management ────────────────────────────
pull-models:
	docker exec ai-governance-ollama-1 ollama pull llama3.1:8b
	docker exec ai-governance-ollama-1 ollama pull mistral:7b

pull-llama:
	docker exec ai-governance-ollama-1 ollama pull llama3.1:8b

# ─── Governance DB ────────────────────────────────────────
gov-setup:
	docker exec ai-governance-governance-1 npx prisma db push

gov-seed:
	docker exec ai-governance-governance-1 npm run db:seed

gov-studio:
	docker exec -it ai-governance-governance-1 npx prisma studio

# ─── Database ─────────────────────────────────────────────
migrate:
	poetry run alembic upgrade head

migrate-new:
	poetry run alembic revision --autogenerate -m "$(msg)"

# ─── Clean ────────────────────────────────────────────────
clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name node_modules -exec rm -rf {} +
	rm -rf dist/ build/ *.egg-info/ htmlcov/ .coverage dashboard/dist/

# ─── Live Demo ────────────────────────────────────────────────
demo:
	bash scripts/demo.sh

# ─── Hackathon Network Sharing ────────────────────────────────
share:
	bash scripts/share_network.sh

# Rebuild dashboard with specific IP (usage: make rebuild-dashboard IP=192.168.1.105)
rebuild-dashboard:
	VITE_API_URL=http://$(IP):8000 VITE_GOVERNANCE_URL=http://$(IP):4000 \
	docker compose build dashboard \
	  --build-arg VITE_API_URL=http://$(IP):8000 \
	  --build-arg VITE_GOVERNANCE_URL=http://$(IP):4000
	docker compose up -d dashboard

# ─── Wait until all healthchecks pass ────────────────────────
wait-healthy:
	@echo "⏳ Waiting for all services to be healthy..."
	@until docker compose ps | grep -v "healthy\|running" | grep -v "NAME\|postgres\|redis\|ollama" | grep -q "starting\|unhealthy" ; do \
		echo "  still waiting..."; sleep 5; \
	done || true
	@sleep 5
	@echo "✅ Services appear healthy"

# ─── One-shot: build + start + seed + test + demo ────────────
full-start:
	docker compose up -d --build
	@echo "⏳ Giving services 60s to initialize..."
	sleep 60
	-docker exec $$(docker compose ps -q governance) npx prisma db push --accept-data-loss
	-docker exec $$(docker compose ps -q governance) npm run db:seed
	bash scripts/run_feature_tests.sh
	bash scripts/demo.sh

