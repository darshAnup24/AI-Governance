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
