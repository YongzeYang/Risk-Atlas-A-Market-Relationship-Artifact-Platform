#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo or as root." >&2
  exit 1
fi

DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-ubuntu}}"
PNPM_VERSION="${PNPM_VERSION:-10.17.1}"

install_base_packages() {
  apt-get update
  apt-get install -y --no-install-recommends \
    awscli \
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

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi

  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
  fi

  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y --no-install-recommends \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin
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
  install_docker
  install_node

  corepack enable
  corepack prepare "pnpm@${PNPM_VERSION}" --activate

  systemctl enable --now docker
  systemctl enable --now nginx

  usermod -aG docker "${DEPLOY_USER}"
  prepare_host_directories

  echo "Bootstrap finished. Log out and back in once so ${DEPLOY_USER} picks up docker group membership." 
}

main "$@"
