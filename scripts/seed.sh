#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE="${COMPOSE:-docker compose}"

$COMPOSE exec -T postgres psql -U aigw -d ai_governance < scripts/seed.sql >/dev/null
$COMPOSE exec -T governance npm run db:seed >/dev/null
$COMPOSE exec -T governance npm run db:seed:demo >/dev/null

printf "Seeded demo organizations, workspaces, policies, and runtime fixtures.\n"
