#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

bash "$ROOT_DIR/scripts/sync-local-env.sh"
docker compose -f "$ROOT_DIR/infra/docker-compose.yml" --env-file "$ROOT_DIR/.env" up -d postgres
pnpm --dir apps/api db:benchmark-real-hk