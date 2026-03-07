FROM python:3.11-slim as base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl && \
    rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir poetry==1.8.4

COPY pyproject.toml poetry.lock* ./

RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi --only main 2>/dev/null || \
    poetry install --no-interaction --no-ansi

COPY proxy/ ./proxy/
COPY detection/ ./detection/

EXPOSE 8001

CMD ["uvicorn", "detection.app.main:app", "--host", "0.0.0.0", "--port", "8001"]
