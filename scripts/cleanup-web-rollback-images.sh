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
expired_image_ids=""

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
  expired_image_ids+="${image_id}"$'\n'
done <<< "${rollback_images}"

while read -r image_id; do
  [ -n "${image_id:-}" ] || continue
  if [ "${image_id}" = "${current_image_id}" ]; then
    echo "skip rollback image used by ${CONTAINER_NAME}: ${image_id}" >&2
    continue
  fi
  if ! container_ids="$(docker ps -aq --filter "ancestor=${image_id}")"; then
    echo "cannot check container references for rollback image: ${image_id}" >&2
    cleanup_failed=true
    continue
  fi
  if [ -n "${container_ids}" ]; then
    echo "skip rollback image referenced by a container: ${image_id}" >&2
    continue
  fi
  if ! repo_tags="$(docker image inspect -f '{{range .RepoTags}}{{println .}}{{end}}' "${image_id}")"; then
    echo "cannot inspect tags for rollback image: ${image_id}" >&2
    cleanup_failed=true
    continue
  fi

  removable_tags=()
  while read -r repo_tag; do
    [ -n "${repo_tag:-}" ] || continue
    if [[ "${repo_tag}" =~ ^gooes-web:rollback-[0-9]+-([0-9]{10})$ ]]; then
      created_at="${BASH_REMATCH[1]}"
      if (( created_at <= NOW && NOW - created_at > RETENTION_SECONDS )); then
        removable_tags+=("${repo_tag}")
      fi
      continue
    fi
    if [[ "${repo_tag}" =~ ^(.*/)?goose-web:[a-f0-9]{40}$ ]]; then
      removable_tags+=("${repo_tag}")
    fi
  done <<< "${repo_tags}"

  if (( ${#removable_tags[@]} > 0 )) && ! docker rmi "${removable_tags[@]}"; then
    echo "failed to remove expired rollback image tags: ${image_id}" >&2
    cleanup_failed=true
  fi
done < <(printf '%s' "${expired_image_ids}" | sort -u)

[ "${cleanup_failed}" = false ]
