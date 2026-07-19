#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER="supabase-nginx"
HOST_HOOK="/opt/gooes/cert-renewal/dnspod_acme_hook.py"
HOST_CREDENTIALS="/etc/gooes/dnspod-www-cert.env"
RUNTIME_DIR="/run/gooes-dnspod-acme"
CONTAINER_HOOK="${RUNTIME_DIR}/dnspod_acme_hook.py"
CONTAINER_CREDENTIALS="${RUNTIME_DIR}/dnspod-www-cert.env"
STATE_DIR="${RUNTIME_DIR}/state"
CERT_NAME="www.goodcms.cn"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "gooes-www-cert-renew: $*" >&2; exit 1; }
require_root() { [[ "$(id -u)" == 0 ]] || die "must run as root"; }

cleanup() {
  if docker inspect "${CONTAINER}" >/dev/null 2>&1; then
    docker exec supabase-nginx rm -rf /run/gooes-dnspod-acme >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

check_credentials() {
  [[ -f "${HOST_CREDENTIALS}" ]] || die "credentials file is missing"
  [[ "$(stat -c '%a' "${HOST_CREDENTIALS}")" == 600 ]] || die "credentials must be mode 0600"
  [[ "$(stat -c '%U' "${HOST_CREDENTIALS}")" == root ]] || die "credentials must be owned by root"
}

check_container() {
  docker inspect --format '{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -qx true \
    || die "container ${CONTAINER} is not running"
}

prepare() {
  require_root
  [[ -f "${HOST_HOOK}" ]] || die "hook is missing"
  [[ "$(stat -c '%a' "${HOST_HOOK}")" == 755 ]] || die "hook must be mode 0755"
  [[ "$(stat -c '%U' "${HOST_HOOK}")" == root ]] || die "hook must be owned by root"
  check_credentials
  check_container
  docker exec "${CONTAINER}" install -d -m 0700 "${RUNTIME_DIR}" "${STATE_DIR}"
  docker cp "${HOST_HOOK}" "${CONTAINER}:${CONTAINER_HOOK}"
  docker cp "${HOST_CREDENTIALS}" "${CONTAINER}:${CONTAINER_CREDENTIALS}"
  docker exec "${CONTAINER}" chmod 755 "${CONTAINER_HOOK}"
  docker exec "${CONTAINER}" chmod 600 "${CONTAINER_CREDENTIALS}"
}

renew() {
  check_container
  docker exec "${CONTAINER}" env \
    DNSPOD_CREDENTIALS_FILE="${CONTAINER_CREDENTIALS}" \
    DNSPOD_STATE_DIR="${STATE_DIR}" \
    certbot renew --cert-name "${CERT_NAME}" --non-interactive --quiet --no-directory-hooks \
      --manual-auth-hook "python3 ${CONTAINER_HOOK} auth" \
      --manual-cleanup-hook "python3 ${CONTAINER_HOOK} cleanup" \
      --deploy-hook 'nginx -t && nginx -s reload'
}

reconfigure() {
  check_container
  docker exec "${CONTAINER}" certbot reconfigure --cert-name "${CERT_NAME}" --non-interactive \
    --manual --preferred-challenges dns-01 \
    --manual-auth-hook "python3 ${CONTAINER_HOOK} auth" \
    --manual-cleanup-hook "python3 ${CONTAINER_HOOK} cleanup" \
    --server "https://acme-staging-v02.api.letsencrypt.org/directory"
}

dry_run() {
  check_container
  docker exec "${CONTAINER}" certbot renew --cert-name "${CERT_NAME}" --non-interactive --quiet \
    --no-directory-hooks --dry-run --run-deploy-hooks \
    --manual-auth-hook "python3 ${CONTAINER_HOOK} auth" \
    --manual-cleanup-hook "python3 ${CONTAINER_HOOK} cleanup" \
    --deploy-hook 'nginx -t && nginx -s reload'
}

main() {
  require_root
  case "${1:-}" in
    prepare) prepare ;;
    renew) renew ;;
    reconfigure) reconfigure ;;
    dry-run) dry_run ;;
    cleanup) cleanup ;;
    *) die "usage: $0 {prepare|renew|reconfigure|dry-run|cleanup}" ;;
  esac
}
main "$@"
