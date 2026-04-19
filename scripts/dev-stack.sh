#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

bash "$ROOT_DIR/scripts/sync-local-env.sh"
docker compose -f "$ROOT_DIR/infra/docker-compose.yml" --env-file "$ROOT_DIR/.env" up -d postgres

(cd "$ROOT_DIR/apps/api" && pnpm dev) &
API_PID=$!

(cd "$ROOT_DIR/apps/web" && pnpm dev) &
WEB_PID=$!

cleanup() {
  kill "$API_PID" "$WEB_PID" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

wait -n "$API_PID" "$WEB_PID"