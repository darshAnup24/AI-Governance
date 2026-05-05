#!/bin/bash
# Proxy service entrypoint — runs DB migrations then starts uvicorn
set -e

echo "⏳ Running Alembic DB migrations..."
alembic upgrade head || echo "⚠️  Migration step failed or already up to date — continuing."

echo "🚀 Starting proxy service..."
exec uvicorn proxy.app.main:app --host 0.0.0.0 --port 8000 --reload
