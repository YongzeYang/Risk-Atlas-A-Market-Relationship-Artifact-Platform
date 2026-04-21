#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS_DIR="${ROOT_DIR}/aws"
ENV_FILE="${1:-${AWS_DIR}/.env.production}"

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

sync_directory() {
  local source_dir="$1"
  local destination_uri="$2"
  local extra_args=()

  if [[ "${S3_SYNC_DELETE:-0}" == "1" ]]; then
    extra_args+=(--delete)
  fi

  if [[ ! -d "${source_dir}" ]]; then
    echo "Skipping missing directory: ${source_dir}"
    return
  fi

  aws s3 sync "${source_dir}" "${destination_uri}" \
    --region "${AWS_REGION}" \
    "${extra_args[@]}"
}

main() {
  require_command aws

  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Missing environment file: ${ENV_FILE}" >&2
    exit 1
  fi

  set -a
  source "${ENV_FILE}"
  set +a

  require_env AWS_REGION
  require_env ARTIFACT_ROOT_DIR
  require_env S3_ARTIFACT_BUCKET

  local base_uri="s3://${S3_ARTIFACT_BUCKET}/${S3_ARTIFACT_PREFIX:-prod}"

  if [[ "${ARTIFACT_STORAGE_BACKEND:-local_fs}" == "s3" ]]; then
    echo "Skipping build-runs sync because ARTIFACT_STORAGE_BACKEND=s3 already writes build artifacts to S3."
  else
    sync_directory "${ARTIFACT_ROOT_DIR}/build-runs" "${base_uri}/build-runs"
  fi

  if [[ "${SYNC_ANALYSIS_RUNS_TO_S3:-0}" == "1" ]]; then
    sync_directory "${ARTIFACT_ROOT_DIR}/analysis-runs" "${base_uri}/analysis-runs"
  fi

  echo "S3 artifact sync completed."
}

main "$@"
