FROM python:3.11-slim as base

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# Install poetry
RUN pip install --no-cache-dir poetry==1.8.4

# Copy dependency files first (Docker layer caching)
COPY pyproject.toml poetry.lock* ./

# Install deps (no dev deps in production)
RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi --only main 2>/dev/null || \
    poetry install --no-interaction --no-ansi

# Copy source
COPY proxy/ ./proxy/

EXPOSE 8000

CMD ["uvicorn", "proxy.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
