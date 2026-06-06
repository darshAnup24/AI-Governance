#!/bin/bash
# Proxy service entrypoint — runs DB migrations then starts uvicorn
set -e

echo "⏳ Running Alembic DB migrations..."
if [ -f alembic.ini ] || [ -f proxy/alembic.ini ]; then
  alembic upgrade head || echo "⚠️  Migration step failed or already up to date — continuing."
else
  echo "ℹ️  No Alembic configuration found — skipping migrations."
fi

echo "🚀 Starting proxy service..."
exec uvicorn proxy.app.main:app --host 0.0.0.0 --port 8000 --reload
