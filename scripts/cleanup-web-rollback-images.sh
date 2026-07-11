#!/usr/bin/env bash
set -uo pipefail

readonly RETENTION_SECONDS=604800
readonly NOW="${ROLLBACK_NOW:-$(date +%s)}"
readonly CONTAINER_NAME="${WEB_CONTAINER_NAME:-gooes-web}"

if [[ ! "${NOW}" =~ ^[0-9]+$ ]]; then
  echo "invalid rollback cleanup epoch: ${NOW}" >&2
  exit 1
fi

if ! current_image_id="$(docker inspect -f '{{.Image}}' "${CONTAINER_NAME}" 2>/dev/null)"; then
  echo "cannot verify current image for ${CONTAINER_NAME}; skipping rollback cleanup" >&2
  exit 1
fi
if ! rollback_images="$(docker images --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}')"; then
  echo "cannot list rollback images; skipping rollback cleanup" >&2
  exit 1
fi
cleanup_failed=false

while read -r tag image_id; do
  [ -n "${tag:-}" ] || continue
  [[ "${tag}" == gooes-web:rollback-* ]] || continue
  if [[ ! "${tag}" =~ ^gooes-web:rollback-[0-9]+-([0-9]{10})$ ]]; then
    echo "skip unparseable rollback tag: ${tag}" >&2
    continue
  fi

  created_at="${BASH_REMATCH[1]}"
  if (( created_at > NOW )); then
    echo "skip rollback tag with future epoch: ${tag}" >&2
    continue
  fi
  if (( NOW - created_at <= RETENTION_SECONDS )); then
    continue
  fi
  if [ -n "${current_image_id}" ] && [ "${image_id:-}" = "${current_image_id}" ]; then
    echo "skip rollback tag used by ${CONTAINER_NAME}: ${tag}" >&2
    continue
  fi
  if ! docker rmi "${tag}"; then
    echo "failed to remove expired rollback tag: ${tag}" >&2
    cleanup_failed=true
  fi
done <<< "${rollback_images}"

[ "${cleanup_failed}" = false ]
