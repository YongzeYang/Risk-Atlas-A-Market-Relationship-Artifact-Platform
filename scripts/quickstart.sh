#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required before running quickstart." >&2
  exit 1
fi

pnpm install
bash "$ROOT_DIR/scripts/bootstrap-local.sh"
bash "$ROOT_DIR/scripts/dev-stack.sh"