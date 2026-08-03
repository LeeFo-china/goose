#!/usr/bin/env bash
set -euo pipefail

umask 077

readonly SSH_ALIAS="gooes-dev"
readonly LOGICAL_SERVER="gooes-dev-vm-0-11"
readonly TARGET_DIR="/opt/gooes-dev/docker"
readonly TARGET_FILE="${TARGET_DIR}/.env.dev.api"
readonly CONFIRMATION_PHRASE="APPLY DOUYIN DEV ENV A01"

DOUYIN_ENV_KEYS=(
  "DOUYIN_COMPONENT_APP_ID"
  "DOUYIN_COMPONENT_APP_SECRET"
  "DOUYIN_COMPONENT_MESSAGE_TOKEN"
  "DOUYIN_COMPONENT_MESSAGE_AES_KEY"
  "DOUYIN_TEMPLATE_APP_ID"
  "DOUYIN_TEMPLATE_APP_SECRET"
  "DOUYIN_CREDENTIAL_KEYS_JSON"
  "DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION"
  "DOUYIN_SUBJECT_HASH_KEY"
)
readonly DOUYIN_ENV_KEYS

REMOTE_UPLOAD_PATH=""
LOCAL_PAYLOAD_PATH=""
LOCAL_WORK_DIR=""
REMOTE_APPLY_STARTED=false

entry_die() {
  local code="$1"

  printf '%s\n' "$code" >&2
  return 1
}

file_mode() {
  local path="$1"
  local mode

  if mode="$(stat -f '%Lp' "$path" 2>/dev/null)"; then
    printf '%s\n' "$mode"
    return 0
  fi
  if mode="$(stat -c '%a' "$path" 2>/dev/null)"; then
    printf '%s\n' "$mode"
    return 0
  fi
  return 1
}

is_current_user_owned() {
  local path="$1"

  [[ -O "$path" ]]
}

read_hidden_value() {
  local field="$1"
  local value

  printf '%s: ' "$field" >/dev/tty || return 1
  if ! IFS= read -r -s value </dev/tty; then
    printf '\n' >/dev/tty 2>/dev/null || true
    return 1
  fi
  printf '\n' >/dev/tty || return 1
  printf '%s' "$value"
}

read_confirmation() {
  local value

  if ! IFS= read -r value </dev/tty; then
    return 1
  fi
  printf '%s' "$value"
}

show_confirmation_prompt() {
  printf 'Type exactly: %s\n' "$CONFIRMATION_PHRASE" >/dev/tty
}

generate_message_token() {
  openssl rand -hex 16
}

generate_message_aes_key() {
  local attempt
  local value

  for attempt in {1..128}; do
    value="$(openssl rand -base64 32)" || return 1
    value="${value%=}"
    if [[ "$value" =~ ^[A-Za-z0-9]{43}$ ]]; then
      printf '%s' "$value"
      return 0
    fi
  done
  return 1
}

generate_credential_key() {
  openssl rand -base64 32
}

generate_subject_hash_key() {
  openssl rand -hex 32
}

payload_sha256() {
  local payload_path="$1"

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$payload_path" | LC_ALL=C awk '{print $1}'
    return
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$payload_path" | LC_ALL=C awk '{print $1}'
    return
  fi
  return 1
}

validate_local_payload() {
  local repo_root="$1"
  local payload_path="$2"

  (
    cd "${repo_root}/apps/api"
    bun ../../scripts/ops/douyin-dev-env.ts validate --payload "$payload_path"
  )
}

is_valid_remote_upload_path() {
  local remote_path="$1"

  [[ "$remote_path" =~ ^/opt/gooes-dev/docker/\.douyin-env-upload\.[A-Za-z0-9]+$ ]]
}

create_remote_upload_path() {
  ssh "$SSH_ALIAS" \
    "umask 077; mktemp '${TARGET_DIR}/.douyin-env-upload.XXXXXX'"
}

copy_remote_payload() {
  local payload_path="$1"
  local remote_path="$2"

  scp -q -p "$payload_path" "${SSH_ALIAS}:${remote_path}"
}

run_remote_apply() {
  local remote_path="$1"
  local payload_sha="$2"
  local remote_script="$3"

  ssh "$SSH_ALIAS" \
    "env -u DOUYIN_DEV_ENV_SOURCE_ONLY bash -s -- '${remote_path}' '${payload_sha}'" \
    <"$remote_script"
}

cleanup_remote_upload() {
  local remote_path="$1"

  [[ -n "$remote_path" ]] || return 0
  is_valid_remote_upload_path "$remote_path" || return 1
  ssh "$SSH_ALIAS" \
    "if [ -e '${remote_path}' ] || [ -L '${remote_path}' ]; then rm -- '${remote_path}'; fi"
}

cleanup_local_paths() {
  local cleanup_failed=0

  if [[ -n "$LOCAL_PAYLOAD_PATH" ]]; then
    if [[ -e "$LOCAL_PAYLOAD_PATH" || -L "$LOCAL_PAYLOAD_PATH" ]]; then
      rm -- "$LOCAL_PAYLOAD_PATH" || cleanup_failed=1
    fi
    if [[ -e "$LOCAL_PAYLOAD_PATH" || -L "$LOCAL_PAYLOAD_PATH" ]]; then
      cleanup_failed=1
    fi
  fi

  if [[ -n "$LOCAL_WORK_DIR" ]]; then
    if [[ -L "$LOCAL_WORK_DIR" ]]; then
      cleanup_failed=1
    elif [[ -d "$LOCAL_WORK_DIR" ]]; then
      rmdir "$LOCAL_WORK_DIR" || cleanup_failed=1
    elif [[ -e "$LOCAL_WORK_DIR" ]]; then
      cleanup_failed=1
    fi
  fi

  return "$cleanup_failed"
}

entry_cleanup_and_exit() {
  local original_status="$1"
  local cleanup_failed=0

  trap - EXIT HUP INT TERM
  set +e

  if [[ -n "$REMOTE_UPLOAD_PATH" ]]; then
    cleanup_remote_upload "$REMOTE_UPLOAD_PATH" || cleanup_failed=1
  fi
  cleanup_local_paths || cleanup_failed=1

  if [[ "$cleanup_failed" -ne 0 ]]; then
    printf '%s\n' "CLEANUP_FAILED" >&2
    if [[ "$REMOTE_APPLY_STARTED" == true ]]; then
      printf '%s\n' "target_may_be_updated=true" >&2
    fi
    exit 74
  fi

  if [[ "$REMOTE_APPLY_STARTED" == true && "$original_status" -ne 0 ]]; then
    printf '%s\n' "target_may_be_updated=true" >&2
  fi

  printf '%s\n' "local_cleanup=true"
  exit "$original_status"
}

run_configure_workflow() {
  export -n \
    component_app_id \
    component_secret \
    component_secret_confirm \
    template_app_id \
    template_secret \
    template_secret_confirm \
    message_token \
    message_aes_key \
    credential_key \
    subject_hash_key \
    value

  local work_dir="$1"
  local repo_root
  local component_app_id
  local component_secret
  local component_secret_confirm
  local template_app_id
  local template_secret
  local template_secret_confirm
  local message_token
  local message_aes_key
  local credential_key
  local subject_hash_key
  local metadata
  local payload_sha
  local confirmation
  local key
  local remote_upload_candidate
  local remote_create_status
  local value

  export -n \
    component_app_id \
    component_secret \
    component_secret_confirm \
    template_app_id \
    template_secret \
    template_secret_confirm \
    message_token \
    message_aes_key \
    credential_key \
    subject_hash_key \
    value

  repo_root="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

  LOCAL_WORK_DIR="$work_dir"
  LOCAL_PAYLOAD_PATH="${work_dir}/douyin.env.payload"
  REMOTE_UPLOAD_PATH=""
  REMOTE_APPLY_STARTED=false

  trap 'entry_cleanup_and_exit "$?"' EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  [[ -d "$work_dir" && ! -L "$work_dir" ]] \
    || entry_die "LOCAL_FILE_INVALID"
  [[ "$(file_mode "$work_dir")" == "700" ]] \
    || entry_die "LOCAL_FILE_INVALID"
  is_current_user_owned "$work_dir" || entry_die "LOCAL_FILE_INVALID"
  [[ ! -e "$LOCAL_PAYLOAD_PATH" && ! -L "$LOCAL_PAYLOAD_PATH" ]] \
    || entry_die "LOCAL_FILE_INVALID"

  component_app_id="$(read_hidden_value component_app_id)" \
    || entry_die "LOCAL_INPUT_INVALID"
  [[ -n "$component_app_id" ]] || entry_die "LOCAL_INPUT_INVALID"
  component_secret="$(read_hidden_value component_app_secret)" \
    || entry_die "LOCAL_INPUT_INVALID"
  [[ -n "$component_secret" ]] || entry_die "LOCAL_INPUT_INVALID"
  component_secret_confirm="$(read_hidden_value component_app_secret_confirm)" \
    || entry_die "LOCAL_INPUT_INVALID"
  [[ -n "$component_secret_confirm" ]] || entry_die "LOCAL_INPUT_INVALID"
  [[ "$component_secret" == "$component_secret_confirm" ]] \
    || entry_die "LOCAL_INPUT_INVALID"

  template_app_id="$(read_hidden_value template_app_id)" \
    || entry_die "LOCAL_INPUT_INVALID"
  [[ -n "$template_app_id" ]] || entry_die "LOCAL_INPUT_INVALID"
  template_secret="$(read_hidden_value template_app_secret)" \
    || entry_die "LOCAL_INPUT_INVALID"
  [[ -n "$template_secret" ]] || entry_die "LOCAL_INPUT_INVALID"
  template_secret_confirm="$(read_hidden_value template_app_secret_confirm)" \
    || entry_die "LOCAL_INPUT_INVALID"
  [[ -n "$template_secret_confirm" ]] || entry_die "LOCAL_INPUT_INVALID"
  [[ "$template_secret" == "$template_secret_confirm" ]] \
    || entry_die "LOCAL_INPUT_INVALID"

  message_token="$(generate_message_token)" \
    || entry_die "LOCAL_RANDOM_FAILED"
  message_aes_key="$(generate_message_aes_key)" \
    || entry_die "LOCAL_RANDOM_FAILED"
  credential_key="$(generate_credential_key)" \
    || entry_die "LOCAL_RANDOM_FAILED"
  subject_hash_key="$(generate_subject_hash_key)" \
    || entry_die "LOCAL_RANDOM_FAILED"

  if ! (
    umask 077
    printf '%s=%s\n' "DOUYIN_COMPONENT_APP_ID" "$component_app_id"
    printf '%s=%s\n' "DOUYIN_COMPONENT_APP_SECRET" "$component_secret"
    printf '%s=%s\n' "DOUYIN_COMPONENT_MESSAGE_TOKEN" "$message_token"
    printf '%s=%s\n' "DOUYIN_COMPONENT_MESSAGE_AES_KEY" "$message_aes_key"
    printf '%s=%s\n' "DOUYIN_TEMPLATE_APP_ID" "$template_app_id"
    printf '%s=%s\n' "DOUYIN_TEMPLATE_APP_SECRET" "$template_secret"
    printf '%s={"v1":"%s"}\n' "DOUYIN_CREDENTIAL_KEYS_JSON" "$credential_key"
    printf '%s=%s\n' "DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION" "v1"
    printf '%s=%s\n' "DOUYIN_SUBJECT_HASH_KEY" "$subject_hash_key"
  ) >"$LOCAL_PAYLOAD_PATH"; then
    entry_die "LOCAL_FILE_INVALID"
  fi
  chmod 600 "$LOCAL_PAYLOAD_PATH" || entry_die "LOCAL_FILE_INVALID"

  unset component_app_id component_secret component_secret_confirm
  unset template_app_id template_secret template_secret_confirm
  unset message_token message_aes_key credential_key subject_hash_key

  [[ -f "$LOCAL_PAYLOAD_PATH" && ! -L "$LOCAL_PAYLOAD_PATH" ]] \
    || entry_die "LOCAL_FILE_INVALID"
  [[ "$(file_mode "$LOCAL_PAYLOAD_PATH")" == "600" ]] \
    || entry_die "LOCAL_FILE_INVALID"
  is_current_user_owned "$LOCAL_PAYLOAD_PATH" \
    || entry_die "LOCAL_FILE_INVALID"

  metadata="$(validate_local_payload "$repo_root" "$LOCAL_PAYLOAD_PATH")" \
    || entry_die "LOCAL_CONFIG_INVALID"
  payload_sha="$(payload_sha256 "$LOCAL_PAYLOAD_PATH")" \
    || entry_die "LOCAL_CONFIG_INVALID"
  [[ "$payload_sha" =~ ^[a-f0-9]{64}$ ]] \
    || entry_die "LOCAL_CONFIG_INVALID"

  printf '%s\n' "environment=development"
  printf 'logical_server=%s\n' "$LOGICAL_SERVER"
  printf 'ssh_alias=%s\n' "$SSH_ALIAS"
  printf 'target=%s\n' "$TARGET_FILE"
  printf 'keys=%s\n' "${#DOUYIN_ENV_KEYS[@]}"
  for key in "${DOUYIN_ENV_KEYS[@]}"; do
    printf 'key=%s\n' "$key"
  done
  printf '%s\n' "effects=no-restart,no-deploy,no-callback"
  printf '%s\n' "$metadata"

  show_confirmation_prompt || entry_die "LOCAL_CONFIRMATION_REJECTED"
  confirmation="$(read_confirmation)" \
    || entry_die "LOCAL_CONFIRMATION_REJECTED"
  [[ "$confirmation" == "$CONFIRMATION_PHRASE" ]] \
    || entry_die "LOCAL_CONFIRMATION_REJECTED"

  if remote_upload_candidate="$(create_remote_upload_path)"; then
    remote_create_status=0
  else
    remote_create_status=$?
  fi
  if is_valid_remote_upload_path "$remote_upload_candidate"; then
    REMOTE_UPLOAD_PATH="$remote_upload_candidate"
  fi
  [[ "$remote_create_status" -eq 0 ]] \
    || entry_die "REMOTE_PREFLIGHT_FAILED"
  [[ -n "$REMOTE_UPLOAD_PATH" ]] \
    || entry_die "REMOTE_PREFLIGHT_FAILED"
  unset remote_upload_candidate

  copy_remote_payload "$LOCAL_PAYLOAD_PATH" "$REMOTE_UPLOAD_PATH" \
    || entry_die "REMOTE_UPLOAD_FAILED"
  REMOTE_APPLY_STARTED=true
  run_remote_apply \
    "$REMOTE_UPLOAD_PATH" \
    "$payload_sha" \
    "${repo_root}/scripts/ops/apply-douyin-dev-env-remote.sh" \
    || entry_die "REMOTE_APPLY_FAILED"
}

main() {
  local repo_root
  local work_dir
  local required_tool

  [[ "$#" -eq 0 ]] || entry_die "LOCAL_USAGE_INVALID"
  if ((
    BASH_VERSINFO[0] < 3
    || (BASH_VERSINFO[0] == 3 && BASH_VERSINFO[1] < 2)
  )); then
    entry_die "LOCAL_PREFLIGHT_FAILED"
  fi

  for required_tool in \
    bash bun openssl ssh scp mktemp chmod stat awk dirname rm rmdir; do
    command -v "$required_tool" >/dev/null 2>&1 \
      || entry_die "LOCAL_PREFLIGHT_FAILED"
  done
  if ! command -v shasum >/dev/null 2>&1 \
    && ! command -v sha256sum >/dev/null 2>&1; then
    entry_die "LOCAL_PREFLIGHT_FAILED"
  fi
  [[ -r /dev/tty && -w /dev/tty ]] || entry_die "LOCAL_TTY_REQUIRED"

  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" \
    || entry_die "LOCAL_PREFLIGHT_FAILED"
  [[ -f "${repo_root}/scripts/ops/douyin-dev-env.ts" \
    && ! -L "${repo_root}/scripts/ops/douyin-dev-env.ts" \
    && -r "${repo_root}/scripts/ops/douyin-dev-env.ts" ]] \
    || entry_die "LOCAL_PREFLIGHT_FAILED"
  [[ -f "${repo_root}/scripts/ops/apply-douyin-dev-env-remote.sh" \
    && ! -L "${repo_root}/scripts/ops/apply-douyin-dev-env-remote.sh" \
    && -r "${repo_root}/scripts/ops/apply-douyin-dev-env-remote.sh" ]] \
    || entry_die "LOCAL_PREFLIGHT_FAILED"

  work_dir="$(umask 077; mktemp -d "${TMPDIR:-/tmp}/gooes-douyin-env.XXXXXX")" \
    || entry_die "LOCAL_FILE_INVALID"
  run_configure_workflow "$work_dir" "$repo_root"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
