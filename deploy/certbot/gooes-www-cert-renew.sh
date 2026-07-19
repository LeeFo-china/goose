#!/usr/bin/env bash
set -Eeuo pipefail

CONTAINER="supabase-nginx"
HOST_HOOK="/opt/gooes/cert-renewal/dnspod_acme_hook.py"
HOST_CREDENTIALS="/etc/gooes/dnspod-www-cert.env"
RUNTIME_DIR="/run/gooes-dnspod-acme"
CONTAINER_HOOK="${RUNTIME_DIR}/dnspod_acme_hook.py"
CONTAINER_CREDENTIALS="${RUNTIME_DIR}/dnspod-www-cert.env"
STATE_DIR="${RUNTIME_DIR}/state"
WWW_CERT_NAME="www.goodcms.cn"
WWW_CERT_DOMAINS=(
  "www.goodcms.cn"
  "goodcms.cn"
)
DEFAULT_CERT_NAMES=(
  "www.goodcms.cn"
  "admin.goodcms.cn"
  "api.goodcms.cn"
  "h5.goodcms.cn"
  "sock.goodcms.cn"
  "supabase.goodcms.cn"
)
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "gooes-www-cert-renew: $*" >&2; exit 1; }
require_root() { [[ "$(id -u)" == 0 ]] || die "must run as root"; }

cleanup() {
  if docker inspect "${CONTAINER}" >/dev/null 2>&1; then
    docker exec supabase-nginx rm -rf /run/gooes-dnspod-acme >/dev/null 2>&1 || true
  fi
}

with_cleanup() {
  trap cleanup EXIT
  "$@"
}

check_credentials() {
  [[ -f "${HOST_CREDENTIALS}" ]] || die "credentials file is missing"
  [[ "$(stat -c '%a' "${HOST_CREDENTIALS}")" == 600 ]] || die "credentials must be mode 0600"
  [[ "$(stat -c '%U' "${HOST_CREDENTIALS}")" == root ]] || die "credentials must be owned by root"
}

check_container() {
  docker inspect --format '{{.State.Running}}' "${CONTAINER}" 2>/dev/null | grep -qx true \
    || die "container ${CONTAINER} is not running"
}

load_cert_names() {
  if [[ -n "${CERT_NAMES:-}" ]]; then
    read -r -a cert_names <<< "${CERT_NAMES}"
  else
    cert_names=("${DEFAULT_CERT_NAMES[@]}")
  fi

  ((${#cert_names[@]} > 0)) || die "at least one certificate name is required"
  local cert_name
  for cert_name in "${cert_names[@]}"; do
    [[ "${cert_name}" =~ ^[a-z0-9.-]+$ ]] || die "invalid certificate name"
  done
}

certbot_manual_hook_args=(
  --manual --preferred-challenges dns-01
  --manual-auth-hook "python3 ${CONTAINER_HOOK} auth --credentials ${CONTAINER_CREDENTIALS} --state-dir ${STATE_DIR}"
  --manual-cleanup-hook "python3 ${CONTAINER_HOOK} cleanup --credentials ${CONTAINER_CREDENTIALS} --state-dir ${STATE_DIR}"
)

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

expand_www() {
  check_container
  local domain_args=()
  local domain
  for domain in "${WWW_CERT_DOMAINS[@]}"; do
    domain_args+=(-d "${domain}")
  done
  docker exec "${CONTAINER}" env \
    DNSPOD_CREDENTIALS_FILE="${CONTAINER_CREDENTIALS}" \
    DNSPOD_STATE_DIR="${STATE_DIR}" \
    certbot certonly --cert-name "${WWW_CERT_NAME}" --expand --non-interactive \
      --no-directory-hooks \
      "${certbot_manual_hook_args[@]}" \
      --deploy-hook 'nginx -t && nginx -s reload' \
      "${domain_args[@]}"
}

renew() {
  check_container
  load_cert_names
  local cert_name
  for cert_name in "${cert_names[@]}"; do
    docker exec "${CONTAINER}" env \
      DNSPOD_CREDENTIALS_FILE="${CONTAINER_CREDENTIALS}" \
      DNSPOD_STATE_DIR="${STATE_DIR}" \
      certbot renew --cert-name "${cert_name}" --non-interactive --quiet \
        --no-directory-hooks --no-random-sleep-on-renew \
        "${certbot_manual_hook_args[@]}" \
        --deploy-hook 'nginx -t && nginx -s reload'
  done
}

reconfigure() {
  check_container
  load_cert_names
  local cert_name
  for cert_name in "${cert_names[@]}"; do
    docker exec "${CONTAINER}" certbot reconfigure --cert-name "${cert_name}" --non-interactive \
      "${certbot_manual_hook_args[@]}"
  done
}

dry_run() {
  check_container
  load_cert_names
  local cert_name
  for cert_name in "${cert_names[@]}"; do
    docker exec "${CONTAINER}" certbot renew --cert-name "${cert_name}" --non-interactive --quiet \
      --no-directory-hooks --no-random-sleep-on-renew --dry-run --run-deploy-hooks \
      "${certbot_manual_hook_args[@]}" \
      --deploy-hook 'nginx -t && nginx -s reload'
  done
}

main() {
  require_root
  case "${1:-}" in
    prepare) prepare ;;
    expand-www) with_cleanup expand_www ;;
    renew) with_cleanup renew ;;
    reconfigure) with_cleanup reconfigure ;;
    dry-run) with_cleanup dry_run ;;
    cleanup) cleanup ;;
    *) die "usage: $0 {prepare|expand-www|renew|reconfigure|dry-run|cleanup}" ;;
  esac
}
main "$@"
