#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS_DIR="${ROOT_DIR}/aws"
ENV_FILE="${1:-${AWS_DIR}/.env.production}"
REFRESH_MODE="${2:-all}"
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

resolve_refresh_mode() {
  case "${REFRESH_MODE}" in
    all)
      REFRESH_RUN_HK=1
      REFRESH_RUN_CRYPTO=1
      ;;
    hk)
      REFRESH_RUN_HK=1
      REFRESH_RUN_CRYPTO=0
      ;;
    crypto)
      REFRESH_RUN_HK=0
      REFRESH_RUN_CRYPTO=1
      ;;
    *)
      echo "Unsupported daily refresh mode: ${REFRESH_MODE}. Expected one of: all, hk, crypto." >&2
      exit 1
      ;;
  esac
}

append_exec_env_arg() {
  local var_name="$1"
  if [[ -n "${!var_name:-}" ]]; then
    EXEC_ENV_ARGS+=(-e "${var_name}=${!var_name}")
  fi
}

build_exec_env_args() {
  EXEC_ENV_ARGS=(
    -e "RISK_ATLAS_DAILY_REFRESH_MODE=${REFRESH_MODE}"
    -e "RISK_ATLAS_DAILY_REFRESH_RUN_HK=${REFRESH_RUN_HK}"
    -e "RISK_ATLAS_DAILY_REFRESH_RUN_CRYPTO=${REFRESH_RUN_CRYPTO}"
  )

  append_exec_env_arg RISK_ATLAS_DAILY_REFRESH_BUILD_SNAPSHOTS
  append_exec_env_arg RISK_ATLAS_DAILY_REFRESH_CONTINUE_ON_MARKET_FAILURE
  append_exec_env_arg RISK_ATLAS_DAILY_REFRESH_CRYPTO_TARGET_COUNT
  append_exec_env_arg RISK_ATLAS_DAILY_REFRESH_CRYPTO_MIN_COUNT
  append_exec_env_arg RISK_ATLAS_DAILY_REFRESH_CRYPTO_CANDIDATE_PAGE_COUNT
  append_exec_env_arg RISK_ATLAS_DAILY_REFRESH_CRYPTO_HISTORY_BATCH_SIZE
  append_exec_env_arg RISK_ATLAS_DAILY_REFRESH_CRYPTO_HISTORY_CONCURRENCY
  append_exec_env_arg RISK_ATLAS_DAILY_REFRESH_CRYPTO_REQUEST_DELAY_MS
  append_exec_env_arg RISK_ATLAS_HK_SOURCE_REFRESH_OVERLAP_DAYS
  append_exec_env_arg RISK_ATLAS_CRYPTO_SOURCE_REFRESH_OVERLAP_DAYS
}

find_api_container_id() {
  docker_compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" ps -q api | tail -n 1
}

apply_api_refresh_limits() {
  local api_container_id
  local update_args=()

  api_container_id="$(find_api_container_id)"
  if [[ -z "${api_container_id}" ]]; then
    echo "Could not resolve the API container id for daily refresh guardrails." >&2
    exit 1
  fi

  if [[ -n "${DAILY_REFRESH_API_CPUS:-}" ]]; then
    update_args+=(--cpus "${DAILY_REFRESH_API_CPUS}")
  fi

  if [[ -n "${DAILY_REFRESH_API_MEMORY:-}" ]]; then
    update_args+=(--memory "${DAILY_REFRESH_API_MEMORY}")
    update_args+=(--memory-swap "${DAILY_REFRESH_API_MEMORY_SWAP:-${DAILY_REFRESH_API_MEMORY}}")
  elif [[ -n "${DAILY_REFRESH_API_MEMORY_SWAP:-}" ]]; then
    update_args+=(--memory-swap "${DAILY_REFRESH_API_MEMORY_SWAP}")
  fi

  if [[ -n "${DAILY_REFRESH_API_PIDS_LIMIT:-}" ]]; then
    update_args+=(--pids-limit "${DAILY_REFRESH_API_PIDS_LIMIT}")
  fi

  if [[ "${#update_args[@]}" -eq 0 ]]; then
    return
  fi

  echo \
    "Applying daily refresh API guardrails to ${api_container_id}: " \
    "cpus=${DAILY_REFRESH_API_CPUS:-unchanged}, " \
    "memory=${DAILY_REFRESH_API_MEMORY:-unchanged}, " \
    "memorySwap=${DAILY_REFRESH_API_MEMORY_SWAP:-${DAILY_REFRESH_API_MEMORY:-unchanged}}, " \
    "pidsLimit=${DAILY_REFRESH_API_PIDS_LIMIT:-unchanged}."

  docker update "${update_args[@]}" "${api_container_id}" >/dev/null
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
  resolve_refresh_mode

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

  docker_compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d postgres api
  wait_for_postgres
  apply_api_refresh_limits
  build_exec_env_args

  echo "Starting daily refresh mode=${REFRESH_MODE} (hk=${REFRESH_RUN_HK}, crypto=${REFRESH_RUN_CRYPTO})."

  docker_compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T "${EXEC_ENV_ARGS[@]}" api \
    sh -lc 'exec nice -n 10 node --import tsx prisma/refresh-daily-market-state.ts'
}

main "$@"