#!/usr/bin/env bash
set -euo pipefail

umask 077

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

UPLOAD_PATH=""
CANDIDATE_PATH=""
BEFORE_VIEW_PATH=""
AFTER_VIEW_PATH=""
TARGET_BLOCK_PATH=""
RESTORE_PATH=""
BACKUP_PATH=""
BACKUP_CREATED=false
BACKUP_VALID=false
TARGET_REPLACED=false
TARGET_WARNING_EMITTED=false

emit_target_update_warning() {
  if [[ "$TARGET_WARNING_EMITTED" != true ]]; then
    printf '%s\n' "target_may_be_updated=true" >&2
    TARGET_WARNING_EMITTED=true
  fi
}

die() {
  local code="$1"

  printf '%s\n' "$code" >&2
  if [[ "$TARGET_REPLACED" == true ]]; then
    emit_target_update_warning
  fi
  return 1
}

file_mode() {
  local path="$1"
  local mode

  if mode="$(stat -c '%a' "$path" 2>/dev/null)"; then
    printf '%s\n' "$mode"
    return 0
  fi
  if mode="$(stat -f '%Lp' "$path" 2>/dev/null)"; then
    printf '%s\n' "$mode"
    return 0
  fi
  return 1
}

file_owner() {
  local path="$1"
  local owner

  if owner="$(stat -c '%U:%G' "$path" 2>/dev/null)"; then
    printf '%s\n' "$owner"
    return 0
  fi
  if owner="$(stat -f '%Su:%Sg' "$path" 2>/dev/null)"; then
    printf '%s\n' "$owner"
    return 0
  fi
  return 1
}

sha256_file() {
  local path="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" 2>/dev/null | LC_ALL=C awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" 2>/dev/null | LC_ALL=C awk '{print $1}'
    return
  fi
  return 1
}

contains_nul() {
  local path="$1"

  od -An -v -t x1 "$path" 2>/dev/null \
    | LC_ALL=C grep -Eq '(^|[[:space:]])00([[:space:]]|$)'
}

contains_cr() {
  local path="$1"

  od -An -v -t x1 "$path" 2>/dev/null \
    | LC_ALL=C grep -Eq '(^|[[:space:]])0d([[:space:]]|$)'
}

validate_target_directory_chain() {
  local target_dir="$1"
  local directory

  if [[ "$target_dir" == "/opt/gooes-dev/docker" ]]; then
    for directory in "/opt" "/opt/gooes-dev" "/opt/gooes-dev/docker"; do
      [[ -d "$directory" && ! -L "$directory" ]] || return 1
    done
    return 0
  fi

  [[ -d "$target_dir" && ! -L "$target_dir" ]]
}

validate_secure_regular_file() {
  local path="$1"
  local expected_owner="$2"
  local mode
  local owner

  [[ -f "$path" && ! -L "$path" ]] || return 1
  mode="$(file_mode "$path")" || return 1
  [[ "$mode" == "600" ]] || return 1
  owner="$(file_owner "$path")" || return 1
  [[ "$owner" == "$expected_owner" ]]
}

validate_payload_shape() {
  local path="$1"
  local last_byte

  contains_nul "$path" && return 1
  contains_cr "$path" && return 1
  last_byte="$(tail -c 1 "$path" 2>/dev/null | od -An -v -t x1)" || return 1
  [[ "$last_byte" == *"0a"* ]] || return 1

  LC_ALL=C awk '
    BEGIN {
      expected[1] = "DOUYIN_COMPONENT_APP_ID"
      expected[2] = "DOUYIN_COMPONENT_APP_SECRET"
      expected[3] = "DOUYIN_COMPONENT_MESSAGE_TOKEN"
      expected[4] = "DOUYIN_COMPONENT_MESSAGE_AES_KEY"
      expected[5] = "DOUYIN_TEMPLATE_APP_ID"
      expected[6] = "DOUYIN_TEMPLATE_APP_SECRET"
      expected[7] = "DOUYIN_CREDENTIAL_KEYS_JSON"
      expected[8] = "DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION"
      expected[9] = "DOUYIN_SUBJECT_HASH_KEY"
      invalid = 0
    }
    {
      separator = index($0, "=")
      key = substr($0, 1, separator - 1)
      value = substr($0, separator + 1)
      if (NR > 9 || separator <= 1 || key != expected[NR] || length(value) == 0) {
        invalid = 1
      }
    }
    END {
      if (NR != 9) {
        invalid = 1
      }
      exit invalid
    }
  ' "$path"
}

validate_target_key_state() {
  local path="$1"

  LC_ALL=C awk '
    BEGIN {
      known["DOUYIN_COMPONENT_APP_ID"] = 1
      known["DOUYIN_COMPONENT_APP_SECRET"] = 1
      known["DOUYIN_COMPONENT_MESSAGE_TOKEN"] = 1
      known["DOUYIN_COMPONENT_MESSAGE_AES_KEY"] = 1
      known["DOUYIN_TEMPLATE_APP_ID"] = 1
      known["DOUYIN_TEMPLATE_APP_SECRET"] = 1
      known["DOUYIN_CREDENTIAL_KEYS_JSON"] = 1
      known["DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION"] = 1
      known["DOUYIN_SUBJECT_HASH_KEY"] = 1
      invalid = 0
    }
    {
      separator = index($0, "=")
      key = separator > 0 ? substr($0, 1, separator - 1) : $0
      if (substr(key, 1, 7) == "DOUYIN_") {
        if (separator <= 1 || !(key in known)) {
          invalid = 1
          next
        }
        count[key] += 1
        if (count[key] > 1) {
          invalid = 1
        }
      }
    }
    END {
      exit invalid
    }
  ' "$path"
}

filter_non_target() {
  local path="$1"

  LC_ALL=C awk '
    BEGIN {
      known["DOUYIN_COMPONENT_APP_ID"] = 1
      known["DOUYIN_COMPONENT_APP_SECRET"] = 1
      known["DOUYIN_COMPONENT_MESSAGE_TOKEN"] = 1
      known["DOUYIN_COMPONENT_MESSAGE_AES_KEY"] = 1
      known["DOUYIN_TEMPLATE_APP_ID"] = 1
      known["DOUYIN_TEMPLATE_APP_SECRET"] = 1
      known["DOUYIN_CREDENTIAL_KEYS_JSON"] = 1
      known["DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION"] = 1
      known["DOUYIN_SUBJECT_HASH_KEY"] = 1
    }
    {
      separator = index($0, "=")
      key = separator > 0 ? substr($0, 1, separator - 1) : $0
      if (!(key in known)) {
        print $0
      }
    }
  ' "$path"
}

extract_target_block() {
  local path="$1"

  LC_ALL=C awk '
    BEGIN {
      known["DOUYIN_COMPONENT_APP_ID"] = 1
      known["DOUYIN_COMPONENT_APP_SECRET"] = 1
      known["DOUYIN_COMPONENT_MESSAGE_TOKEN"] = 1
      known["DOUYIN_COMPONENT_MESSAGE_AES_KEY"] = 1
      known["DOUYIN_TEMPLATE_APP_ID"] = 1
      known["DOUYIN_TEMPLATE_APP_SECRET"] = 1
      known["DOUYIN_CREDENTIAL_KEYS_JSON"] = 1
      known["DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION"] = 1
      known["DOUYIN_SUBJECT_HASH_KEY"] = 1
    }
    {
      separator = index($0, "=")
      key = separator > 0 ? substr($0, 1, separator - 1) : $0
      if (key in known) {
        print $0
      }
    }
  ' "$path"
}

is_recorded_temp_path() {
  local path="$1"
  local recorded_path

  for recorded_path in \
    "$UPLOAD_PATH" \
    "$CANDIDATE_PATH" \
    "$BEFORE_VIEW_PATH" \
    "$AFTER_VIEW_PATH" \
    "$TARGET_BLOCK_PATH" \
    "$RESTORE_PATH" \
    "$BACKUP_PATH"; do
    if [[ -n "$recorded_path" && "$path" == "$recorded_path" ]]; then
      return 0
    fi
  done
  return 1
}

remove_temp_path() {
  local path="$1"

  is_recorded_temp_path "$path" || return 1
  if [[ -e "$path" || -L "$path" ]]; then
    rm -f "$path" >/dev/null 2>&1 || return 1
  fi
}

cleanup_remote_temps() {
  local cleanup_failed=0
  local path

  for path in \
    "$UPLOAD_PATH" \
    "$CANDIDATE_PATH" \
    "$BEFORE_VIEW_PATH" \
    "$AFTER_VIEW_PATH" \
    "$TARGET_BLOCK_PATH" \
    "$RESTORE_PATH"; do
    if [[ -n "$path" ]] && ! remove_temp_path "$path"; then
      cleanup_failed=1
    fi
  done

  if [[ "$BACKUP_CREATED" == true && "$BACKUP_VALID" != true ]]; then
    if ! remove_temp_path "$BACKUP_PATH"; then
      cleanup_failed=1
    fi
  fi

  return "$cleanup_failed"
}

remote_cleanup_handler() {
  local original_status="$1"
  local cleanup_status=0

  trap - EXIT HUP INT TERM
  set +e
  cleanup_remote_temps
  cleanup_status=$?

  if [[ "$cleanup_status" -eq 0 ]]; then
    if [[ "$original_status" -ne 0 && "$TARGET_REPLACED" == true ]]; then
      emit_target_update_warning
    fi
    printf '%s\n' "remote_cleanup=true"
    exit "$original_status"
  fi

  printf '%s\n' "CLEANUP_FAILED" >&2
  emit_target_update_warning
  exit 74
}

remote_signal_handler() {
  local signal_status="$1"

  trap - HUP INT TERM
  exit "$signal_status"
}

backup_timestamp() {
  date '+%Y%m%d%H%M%S'
}

container_snapshot() {
  local container_name="$1"

  docker inspect \
    --format '{{.Id}}|{{.State.StartedAt}}|{{.Config.Image}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$container_name" 2>/dev/null
}

create_transaction_temp() {
  local variable_name="$1"
  local template="$2"
  local temp_path

  temp_path="$(mktemp "$template" 2>/dev/null)" || return 1
  printf -v "$variable_name" '%s' "$temp_path"
  install -m 600 /dev/null "$temp_path" >/dev/null 2>&1 || return 1
}

append_payload_records() {
  local payload_path="$1"
  local candidate_path="$2"
  local record

  while IFS= read -r record; do
    printf '%s\n' "$record" >> "$candidate_path" || return 1
  done < "$payload_path"
}

apply_douyin_env_transaction() {
  local target_dir="$1"
  local target_file="$2"
  local payload_path="$3"
  local expected_owner="$4"
  local container_name="$5"
  local expected_payload_sha="$6"
  local actual_payload_sha
  local target_before_sha
  local current_target_sha
  local candidate_sha
  local installed_target_sha
  local target_block_sha
  local backup_sha
  local timestamp
  local before_container_snapshot
  local after_container_snapshot

  UPLOAD_PATH="$payload_path"
  CANDIDATE_PATH=""
  BEFORE_VIEW_PATH=""
  AFTER_VIEW_PATH=""
  TARGET_BLOCK_PATH=""
  RESTORE_PATH=""
  BACKUP_PATH=""
  BACKUP_CREATED=false
  BACKUP_VALID=false
  TARGET_REPLACED=false
  TARGET_WARNING_EMITTED=false

  trap 'remote_cleanup_handler "$?"' EXIT
  trap 'remote_signal_handler 129' HUP
  trap 'remote_signal_handler 130' INT
  trap 'remote_signal_handler 143' TERM

  if ! validate_target_directory_chain "$target_dir"; then
    die "REMOTE_TARGET_STATE_INVALID"
    return 1
  fi
  if ! validate_secure_regular_file "$target_file" "$expected_owner"; then
    die "REMOTE_TARGET_STATE_INVALID"
    return 1
  fi
  if ! validate_secure_regular_file "$payload_path" "$expected_owner"; then
    die "REMOTE_TARGET_STATE_INVALID"
    return 1
  fi
  if [[ ${#expected_payload_sha} -ne 64 || "$expected_payload_sha" == *[!a-f0-9]* ]]; then
    die "REMOTE_PAYLOAD_INVALID"
    return 1
  fi
  actual_payload_sha="$(sha256_file "$payload_path")" || {
    die "REMOTE_PAYLOAD_INVALID"
    return 1
  }
  if [[ "$actual_payload_sha" != "$expected_payload_sha" ]]; then
    die "REMOTE_PAYLOAD_INVALID"
    return 1
  fi

  if ! { exec 9<"$target_dir"; } 2>/dev/null; then
    die "REMOTE_LOCK_FAILED"
    return 1
  fi
  if ! flock -x 9 >/dev/null 2>&1; then
    die "REMOTE_LOCK_FAILED"
    return 1
  fi

  if ! validate_target_directory_chain "$target_dir"; then
    die "REMOTE_TARGET_STATE_INVALID"
    return 1
  fi
  if ! validate_secure_regular_file "$target_file" "$expected_owner"; then
    die "REMOTE_TARGET_STATE_INVALID"
    return 1
  fi
  if ! validate_secure_regular_file "$payload_path" "$expected_owner"; then
    die "REMOTE_TARGET_STATE_INVALID"
    return 1
  fi
  if ! validate_payload_shape "$payload_path"; then
    die "REMOTE_PAYLOAD_INVALID"
    return 1
  fi
  if ! validate_target_key_state "$target_file"; then
    die "REMOTE_TARGET_STATE_INVALID"
    return 1
  fi

  target_before_sha="$(sha256_file "$target_file")" || {
    die "REMOTE_TARGET_STATE_INVALID"
    return 1
  }
  before_container_snapshot="$(container_snapshot "$container_name")" || {
    die "REMOTE_CONTAINER_INVALID"
    return 1
  }
  if [[ "$before_container_snapshot" != *"|healthy" ]]; then
    die "REMOTE_CONTAINER_INVALID"
    return 1
  fi

  timestamp="$(backup_timestamp)" || {
    die "REMOTE_BACKUP_FAILED"
    return 1
  }
  if [[ ${#timestamp} -ne 14 || "$timestamp" == *[!0-9]* ]]; then
    die "REMOTE_BACKUP_FAILED"
    return 1
  fi
  BACKUP_PATH="${target_file}.backup-${timestamp}"
  if [[ -e "$BACKUP_PATH" || -L "$BACKUP_PATH" ]]; then
    die "REMOTE_BACKUP_FAILED"
    return 1
  fi
  if ! (set -o noclobber; : > "$BACKUP_PATH") 2>/dev/null; then
    die "REMOTE_BACKUP_FAILED"
    return 1
  fi
  BACKUP_CREATED=true
  if ! cp -p "$target_file" "$BACKUP_PATH" >/dev/null 2>&1; then
    die "REMOTE_BACKUP_FAILED"
    return 1
  fi
  if ! validate_secure_regular_file "$BACKUP_PATH" "$expected_owner"; then
    die "REMOTE_BACKUP_FAILED"
    return 1
  fi
  backup_sha="$(sha256_file "$BACKUP_PATH")" || {
    die "REMOTE_BACKUP_FAILED"
    return 1
  }
  if [[ "$backup_sha" != "$target_before_sha" ]]; then
    die "REMOTE_BACKUP_FAILED"
    return 1
  fi
  BACKUP_VALID=true

  if ! create_transaction_temp CANDIDATE_PATH "$target_dir/.douyin-env-candidate.XXXXXX"; then
    die "REMOTE_TEMP_FAILED"
    return 1
  fi
  if ! create_transaction_temp BEFORE_VIEW_PATH "$target_dir/.douyin-env-before.XXXXXX"; then
    die "REMOTE_TEMP_FAILED"
    return 1
  fi
  if ! create_transaction_temp AFTER_VIEW_PATH "$target_dir/.douyin-env-after.XXXXXX"; then
    die "REMOTE_TEMP_FAILED"
    return 1
  fi
  if ! create_transaction_temp TARGET_BLOCK_PATH "$target_dir/.douyin-env-target-block.XXXXXX"; then
    die "REMOTE_TEMP_FAILED"
    return 1
  fi

  if ! filter_non_target "$BACKUP_PATH" > "$CANDIDATE_PATH"; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi
  if ! append_payload_records "$payload_path" "$CANDIDATE_PATH"; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi
  if ! validate_secure_regular_file "$CANDIDATE_PATH" "$expected_owner"; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi
  if ! validate_target_key_state "$CANDIDATE_PATH"; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi
  if ! validate_payload_shape "$payload_path"; then
    die "REMOTE_PAYLOAD_INVALID"
    return 1
  fi

  if ! filter_non_target "$BACKUP_PATH" > "$BEFORE_VIEW_PATH"; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi
  if ! filter_non_target "$CANDIDATE_PATH" > "$AFTER_VIEW_PATH"; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi
  if ! cmp -s "$BEFORE_VIEW_PATH" "$AFTER_VIEW_PATH"; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi
  if ! extract_target_block "$CANDIDATE_PATH" > "$TARGET_BLOCK_PATH"; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi
  if ! cmp -s "$TARGET_BLOCK_PATH" "$payload_path"; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi
  target_block_sha="$(sha256_file "$TARGET_BLOCK_PATH")" || {
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  }
  if [[ "$target_block_sha" != "$expected_payload_sha" ]]; then
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  fi

  current_target_sha="$(sha256_file "$target_file")" || {
    die "REMOTE_CONCURRENT_CHANGE"
    return 1
  }
  if [[ "$current_target_sha" != "$target_before_sha" ]]; then
    die "REMOTE_CONCURRENT_CHANGE"
    return 1
  fi
  candidate_sha="$(sha256_file "$CANDIDATE_PATH")" || {
    die "REMOTE_CANDIDATE_INVALID"
    return 1
  }

  TARGET_REPLACED=true
  if ! mv "$CANDIDATE_PATH" "$target_file" >/dev/null 2>&1; then
    die "REMOTE_REPLACE_FAILED"
    return 1
  fi
  CANDIDATE_PATH=""
  if ! validate_secure_regular_file "$target_file" "$expected_owner"; then
    die "REMOTE_REPLACE_FAILED"
    return 1
  fi
  installed_target_sha="$(sha256_file "$target_file")" || {
    die "REMOTE_REPLACE_FAILED"
    return 1
  }
  if [[ "$installed_target_sha" != "$candidate_sha" ]]; then
    die "REMOTE_REPLACE_FAILED"
    return 1
  fi

  after_container_snapshot="$(container_snapshot "$container_name")" || {
    die "REMOTE_CONTAINER_CHANGED"
    return 1
  }
  if [[ "$after_container_snapshot" != "$before_container_snapshot" ]]; then
    die "REMOTE_CONTAINER_CHANGED"
    return 1
  fi

  printf '%s\n' \
    "environment=development" \
    "logical_server=gooes-dev-vm-0-11" \
    "target=/opt/gooes-dev/docker/.env.dev.api" \
    "backup=$BACKUP_PATH" \
    "backup_sha256=$backup_sha" \
    "nine_keys_valid=true" \
    "target_mode_600=true" \
    "target_owner_ubuntu=true" \
    "container_identity_unchanged=true"
}

main() {
  local upload_path
  local expected_payload_sha
  local required_tool

  if [[ $# -ne 2 ]]; then
    die "REMOTE_USAGE_INVALID"
    return 1
  fi
  upload_path="$1"
  expected_payload_sha="$2"

  for required_tool in \
    bash env hostname id flock mktemp install stat awk grep mv cp rm rmdir \
    sha256sum cmp date od tail wc docker; do
    if ! command -v "$required_tool" >/dev/null 2>&1; then
      die "REMOTE_TOOL_MISSING"
      return 1
    fi
  done

  if [[ "$(hostname)" != "VM-0-11-ubuntu" ]]; then
    die "REMOTE_HOST_INVALID"
    return 1
  fi
  if [[ "$(id -un)" != "ubuntu" ]]; then
    die "REMOTE_USER_INVALID"
    return 1
  fi
  if ! validate_target_directory_chain "/opt/gooes-dev/docker"; then
    die "REMOTE_TARGET_STATE_INVALID"
    return 1
  fi
  if [[ ! "$upload_path" =~ ^/opt/gooes-dev/docker/\.douyin-env-upload\.[A-Za-z0-9]+$ ]]; then
    die "REMOTE_UPLOAD_PATH_INVALID"
    return 1
  fi

  apply_douyin_env_transaction \
    "/opt/gooes-dev/docker" \
    "/opt/gooes-dev/docker/.env.dev.api" \
    "$upload_path" \
    "ubuntu:ubuntu" \
    "gooes-api-dev" \
    "$expected_payload_sha"
}

if [[
  "${DOUYIN_DEV_ENV_SOURCE_ONLY:-0}" != "1"
  || -z "${BASH_SOURCE[0]:-}"
  || "${BASH_SOURCE[0]}" == "$0"
]]; then
  main "$@"
fi
