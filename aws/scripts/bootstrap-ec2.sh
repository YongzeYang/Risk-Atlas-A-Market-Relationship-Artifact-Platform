#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo or as root." >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-ubuntu}}"
PNPM_VERSION="${PNPM_VERSION:-10.17.1}"

docker_compose_available() {
  docker compose version >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1
}

ensure_docker_apt_repo() {
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
}

install_base_packages() {
  apt-get update
  apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    certbot \
    cmake \
    curl \
    gettext-base \
    git \
    gnupg \
    jq \
    nginx \
    python3-certbot-nginx \
    rsync \
    unzip
}

resolve_awscli_arch() {
  case "$(dpkg --print-architecture)" in
    amd64)
      echo "x86_64"
      ;;
    arm64)
      echo "aarch64"
      ;;
    *)
      echo "Unsupported architecture for AWS CLI installer: $(dpkg --print-architecture)" >&2
      exit 1
      ;;
  esac
}

install_awscli() {
  local installer_arch
  local install_args=()
  local temp_dir

  if command -v aws >/dev/null 2>&1; then
    return
  fi

  if apt-get install -y --no-install-recommends awscli; then
    return
  fi

  installer_arch="$(resolve_awscli_arch)"
  temp_dir="$(mktemp -d)"

  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${installer_arch}.zip" -o "${temp_dir}/awscliv2.zip"
  unzip -q "${temp_dir}/awscliv2.zip" -d "${temp_dir}"

  if [[ -d "/usr/local/aws-cli" ]]; then
    install_args+=(--update)
  fi

  "${temp_dir}/aws/install" "${install_args[@]}"
  rm -rf "${temp_dir}"
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker_compose_available; then
    return
  fi

  ensure_docker_apt_repo
  apt-get update
  apt-get install -y --no-install-recommends \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin
}

verify_runtime_dependencies() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not available after bootstrap." >&2
    exit 1
  fi

  if ! docker_compose_available; then
    echo "Docker Compose is not available after bootstrap." >&2
    exit 1
  fi

  if ! command -v certbot >/dev/null 2>&1; then
    echo "Certbot is not available after bootstrap." >&2
    exit 1
  fi

  if ! command -v aws >/dev/null 2>&1; then
    echo "AWS CLI is not available after bootstrap." >&2
    exit 1
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is not available after bootstrap." >&2
    exit 1
  fi
}

install_node() {
  if command -v node >/dev/null 2>&1 && node --version | grep -q '^v20\.'; then
    return
  fi

  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y --no-install-recommends nodejs
}

prepare_host_directories() {
  mkdir -p /opt/risk-atlas/app
  mkdir -p /var/lib/risk-atlas/postgres
  mkdir -p /var/lib/risk-atlas/artifacts
  mkdir -p /var/www/risk-atlas
  mkdir -p /var/www/certbot

  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /opt/risk-atlas
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /var/lib/risk-atlas
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /var/www/risk-atlas
  chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /var/www/certbot
}

main() {
  install_base_packages
  install_awscli
  install_docker
  install_node

  corepack enable
  corepack prepare "pnpm@${PNPM_VERSION}" --activate

  systemctl enable --now docker
  systemctl enable --now nginx

  usermod -aG docker "${DEPLOY_USER}"
  prepare_host_directories
  verify_runtime_dependencies

  echo "Bootstrap finished. Log out and back in once so ${DEPLOY_USER} picks up docker group membership." 
}

main "$@"
