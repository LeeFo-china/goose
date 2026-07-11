#!/usr/bin/env bash

site_content_services=" ${1:-} "
unused_preview="unused-not-deployed-preview-000000000000000000000"
unused_session="unused-not-deployed-session-000000000000000000000"
unused_revalidation="unused-not-deployed-revalidation-000000000000000000000"

require_site_content_secret() {
  local name="$1"
  local value="${!name:-}"
  if [ "${#value}" -lt 32 ]; then
    echo "${name} must be at least 32 bytes for selected services" >&2
    return 1
  fi
}

if [[ "${site_content_services}" == *" web "* ]]; then
  require_site_content_secret GOOES_PREVIEW_SHARED_SECRET || return 1
  require_site_content_secret GOOES_PREVIEW_SESSION_SECRET || return 1
  require_site_content_secret GOOES_WEB_REVALIDATE_SHARED_SECRET || return 1
elif [[ "${site_content_services}" == *" api "* ]]; then
  require_site_content_secret GOOES_PREVIEW_SHARED_SECRET || return 1
  require_site_content_secret GOOES_WEB_REVALIDATE_SHARED_SECRET || return 1
  GOOES_PREVIEW_SESSION_SECRET="${unused_session}"
else
  GOOES_PREVIEW_SHARED_SECRET="${unused_preview}"
  GOOES_PREVIEW_SESSION_SECRET="${unused_session}"
  GOOES_WEB_REVALIDATE_SHARED_SECRET="${unused_revalidation}"
fi

export GOOES_PREVIEW_SHARED_SECRET
export GOOES_PREVIEW_SESSION_SECRET
export GOOES_WEB_REVALIDATE_SHARED_SECRET
