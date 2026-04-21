#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS_DIR="${ROOT_DIR}/aws"
ENV_FILE="${1:-${AWS_DIR}/.env.production}"
COMPOSE_FILE="${AWS_DIR}/docker-compose.ec2.yml"

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
}

require_env() {
  local variable_name="$1"
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Missing required environment variable: ${variable_name}" >&2
    exit 1
  fi
}

wait_for_postgres() {
  local attempt
  for attempt in {1..30}; do
    if docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T postgres \
      pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done

  echo "PostgreSQL did not become ready in time." >&2
  exit 1
}

render_nginx_config() {
  local template_path="${AWS_DIR}/nginx/risk-atlas-http.conf"
  local letsencrypt_dir="/etc/letsencrypt/live/${DOMAIN_NAME}"

  if [[ -f "${letsencrypt_dir}/fullchain.pem" && -f "${letsencrypt_dir}/privkey.pem" ]]; then
    template_path="${AWS_DIR}/nginx/risk-atlas-https.conf"
  fi

  DOMAIN_SERVER_NAMES="${DOMAIN_SERVER_NAMES:-${DOMAIN_NAME}}"

  export DOMAIN_NAME DOMAIN_SERVER_NAMES WEB_ROOT_DIR API_PORT
  envsubst '${DOMAIN_NAME} ${DOMAIN_SERVER_NAMES} ${WEB_ROOT_DIR} ${API_PORT}' < "${template_path}" | \
    sudo tee /etc/nginx/sites-available/risk-atlas.conf >/dev/null

  sudo ln -sfn /etc/nginx/sites-available/risk-atlas.conf /etc/nginx/sites-enabled/risk-atlas.conf
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl reload nginx
}

main() {
  require_command docker
  require_command git
  require_command pnpm
  require_command rsync
  require_command sudo
  require_command envsubst

  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Missing environment file: ${ENV_FILE}" >&2
    exit 1
  fi

  set -a
  source "${ENV_FILE}"
  set +a

  require_env DOMAIN_NAME
  require_env WEB_ROOT_DIR
  require_env POSTGRES_DATA_DIR
  require_env ARTIFACT_ROOT_DIR
  require_env POSTGRES_DB
  require_env POSTGRES_USER
  require_env POSTGRES_PASSWORD
  require_env DATABASE_URL
  require_env RISK_ATLAS_INVITE_CODES
  require_env RISK_ATLAS_INVITE_SALT

  mkdir -p \
    "${WEB_ROOT_DIR}" \
    "${POSTGRES_DATA_DIR}" \
    "${ARTIFACT_ROOT_DIR}" \
    "${ARTIFACT_CACHE_DIR:-${ARTIFACT_ROOT_DIR}/cache}" \
    /var/www/certbot

  cd "${ROOT_DIR}"

  git submodule update --init --recursive
  pnpm install --frozen-lockfile

  VITE_API_BASE_URL="${VITE_API_BASE_URL:-}" \
  VITE_SITE_URL="${VITE_SITE_URL:-https://${DOMAIN_NAME}}" \
  VITE_REPOSITORY_URL="${VITE_REPOSITORY_URL:-}" \
    pnpm --dir apps/web build

  rsync -a --delete apps/web/dist/ "${WEB_ROOT_DIR}/"

  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" build api
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d postgres

  wait_for_postgres

  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" run --rm --no-deps api \
    npx prisma migrate deploy

  if [[ "${RUN_SEED_ON_DEPLOY:-0}" == "1" ]]; then
    docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" run --rm --no-deps api \
      node --import tsx prisma/seed.ts
  fi

  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d api

  render_nginx_config

  if [[ "${SYNC_ARTIFACTS_ON_DEPLOY:-0}" == "1" ]]; then
    "${AWS_DIR}/scripts/sync-artifacts-to-s3.sh" "${ENV_FILE}"
  fi

  echo "Deployment finished successfully."
}

main "$@"
