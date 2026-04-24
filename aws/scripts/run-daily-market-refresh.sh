#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS_DIR="${ROOT_DIR}/aws"
ENV_FILE="${1:-${AWS_DIR}/.env.production}"
COMPOSE_FILE="${AWS_DIR}/docker-compose.ec2.yml"
DOCKER_COMPOSE_CMD=()

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
}

resolve_docker_compose_command() {
  if docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD=(docker compose)
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD=(docker-compose)
    return
  fi

  echo "Missing Docker Compose. Install the Docker Compose plugin or docker-compose standalone first." >&2
  exit 1
}

docker_compose() {
  "${DOCKER_COMPOSE_CMD[@]}" "$@"
}

wait_for_postgres() {
  local attempt
  for attempt in {1..30}; do
    if docker_compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T postgres \
      pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      return
    fi
  done

  echo "PostgreSQL did not become ready in time for daily market refresh." >&2
  exit 1
}

main() {
  require_command docker
  require_command bash
  resolve_docker_compose_command

  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Missing environment file: ${ENV_FILE}" >&2
    exit 1
  fi

  set -a
  source "${ENV_FILE}"
  set +a

  : "${POSTGRES_DB:?Missing POSTGRES_DB in ${ENV_FILE}}"
  : "${POSTGRES_USER:?Missing POSTGRES_USER in ${ENV_FILE}}"

  cd "${ROOT_DIR}"

  docker_compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d postgres
  wait_for_postgres

  docker_compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" run --rm --no-deps api \
    sh -lc 'exec nice -n 10 node --import tsx prisma/refresh-daily-market-state.ts'
}

main "$@"