#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_command pnpm
require_command docker
require_command cmake

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable." >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  pnpm install
fi

bash "$ROOT_DIR/scripts/sync-local-env.sh"

set -a
source "$ROOT_DIR/.env"
set +a

docker compose -f "$ROOT_DIR/infra/docker-compose.yml" --env-file "$ROOT_DIR/.env" up -d postgres

for attempt in {1..30}; do
  if docker compose -f "$ROOT_DIR/infra/docker-compose.yml" --env-file "$ROOT_DIR/.env" exec -T postgres \
    pg_isready -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-risk_atlas}" >/dev/null 2>&1; then
    break
  fi

  if [[ "$attempt" == "30" ]]; then
    echo "Postgres did not become ready in time." >&2
    exit 1
  fi
done

pnpm deps:bsm
pnpm cpp:configure
pnpm cpp:build

pnpm --dir apps/api prisma:generate
pnpm --dir apps/api db:migrate:deploy
pnpm --dir apps/api db:seed

if [[ "${RISK_ATLAS_BOOTSTRAP_REAL_HK:-0}" == "1" ]]; then
  pnpm --dir apps/api db:benchmark-real-hk
fi

echo "Bootstrap completed. Start the stack with: pnpm dev:stack"