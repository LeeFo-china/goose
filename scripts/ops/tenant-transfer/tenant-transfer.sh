#!/usr/bin/env bash
set -euo pipefail
umask 077

TENANT_ID="3eebca47-961f-4899-b976-a3d3208d326b"
EXPECTED_SOURCE_MIGRATION_VERSION="20260826113000"
EXPECTED_CONFIRMATION="确认迁移租户 3eebca47-961f-4899-b976-a3d3208d326b 到生产"
readonly SOURCE_SSH="gooes-dev"
readonly TARGET_SSH="gooes-prod-supabase"
readonly DATABASE_CONTAINER="supabase-db"
readonly EXPECTED_ARTIFACT_FILES=(copy.sql lock.sql manifest.json preflight.sql remap.sql verification.sql)
MODE="${1:-audit}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
ARTIFACT_DIR="${TENANT_TRANSFER_ARTIFACT_DIR:-}"
DRY_RUN_MAX_AGE_SECONDS=1800
BACKUP_MAX_AGE_SECONDS=3600
STAGING_FILE=""
REMOTE_STAGE=""

cleanup() {
  local exit_code=$?
  trap - EXIT
  if [[ -n "$STAGING_FILE" && -f "$STAGING_FILE" ]]; then
    rm -f "$STAGING_FILE"
  fi
  if [[ -n "$REMOTE_STAGE" ]]; then
    if ! ssh -- "$TARGET_SSH" "if sudo docker exec '$DATABASE_CONTAINER' test -d '$REMOTE_STAGE'; then sudo docker exec '$DATABASE_CONTAINER' rm -rf '$REMOTE_STAGE'; fi; rm -rf '$REMOTE_STAGE'"; then
      echo "远端迁移暂存目录清理失败: $REMOTE_STAGE" >&2
      [[ "$exit_code" -ne 0 ]] || exit_code=1
    fi
  fi
  exit "$exit_code"
}
trap cleanup EXIT

usage() {
  cat <<'USAGE'
用法:
  tenant-transfer.sh audit
  tenant-transfer.sh export
  TENANT_TRANSFER_ARTIFACT_DIR=/path tenant-transfer.sh dry-run
  TENANT_TRANSFER_ARTIFACT_DIR=/path \
  TENANT_TRANSFER_BACKUP_FILE=/path/on/production \
  TENANT_TRANSFER_CONFIRMATION='确认迁移租户 3eebca47-961f-4899-b976-a3d3208d326b 到生产' \
    tenant-transfer.sh apply
USAGE
}

case "$MODE" in
  audit|export|dry-run|apply) ;;
  *) usage; exit 2 ;;
esac

checksum_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi
}

verify_checksums() {
  local manifest="$1/manifest.sha256"
  local actual_files
  local expected_files
  [[ -s "$manifest" ]] || { echo "缺少 manifest.sha256" >&2; exit 1; }
  actual_files="$(awk 'NF == 2 { print $2 }' "$manifest" | LC_ALL=C sort)"
  expected_files="$(printf '%s\n' "${EXPECTED_ARTIFACT_FILES[@]}" | LC_ALL=C sort)"
  [[ "$actual_files" == "$expected_files" ]] || {
    echo "制品校验清单文件集合不完整" >&2
    exit 1
  }
  for file in "${EXPECTED_ARTIFACT_FILES[@]}"; do
    local expected
    local actual
    [[ -f "$1/$file" ]] || { echo "缺少制品文件: $file" >&2; exit 1; }
    expected="$(awk -v target="$file" '$2 == target { print $1 }' "$manifest")"
    [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || { echo "制品校验值无效: $file" >&2; exit 1; }
    actual="$(checksum_file "$1/$file" | awk '{print $1}')"
    [[ "$actual" == "$expected" ]] || { echo "校验和不匹配: $file" >&2; exit 1; }
  done
}

assert_artifact_outside_repo() {
  local artifact_real
  local repo_real
  artifact_real="$(cd "$ARTIFACT_DIR" && pwd -P)"
  repo_real="$(cd "$REPO_ROOT" && pwd -P)"
  case "$artifact_real/" in
    "$repo_real/"*)
      echo "生产迁移制品目录不能位于仓库内" >&2
      exit 2
      ;;
  esac
}

run_source_sql() {
  local sql_file="$1"
  ssh -- "$SOURCE_SSH" \
    "sudo docker exec -i '$DATABASE_CONTAINER' psql -U postgres -d postgres --no-psqlrc -X -qAt -v ON_ERROR_STOP=1 -v tenant_id='$TENANT_ID'" \
    < "$sql_file"
}

require_artifact() {
  [[ -n "$ARTIFACT_DIR" && -d "$ARTIFACT_DIR" ]] || {
    echo "请通过 TENANT_TRANSFER_ARTIFACT_DIR 指定导出目录" >&2
    exit 2
  }
  assert_artifact_outside_repo
  verify_checksums "$ARTIFACT_DIR"
  bun -e '
    const [manifestPath, tenantId, expectedMigrationVersion] = process.argv.slice(1);
    const manifest = await Bun.file(manifestPath).json();
    if (manifest.tenant_id !== tenantId) {
      throw new Error("迁移制品租户与固定租户不匹配");
    }
    const sourceMigrationVersion = manifest.source_migration_version;
    if (typeof sourceMigrationVersion !== "string" || !/^\d{14}$/.test(sourceMigrationVersion)) {
      throw new Error("迁移制品缺少有效源 migration 版本");
    }
    if (sourceMigrationVersion !== expectedMigrationVersion) {
      throw new Error("源 migration 版本超出已审查范围");
    }
  ' "$ARTIFACT_DIR/manifest.json" "$TENANT_ID" "$EXPECTED_SOURCE_MIGRATION_VERSION"
}

get_target_fingerprint() {
  ssh -- "$TARGET_SSH" \
    "sudo docker exec -i '$DATABASE_CONTAINER' psql -U postgres -d postgres --no-psqlrc -X -qAt -v ON_ERROR_STOP=1" <<'SQL'
SELECT json_build_object(
  'system_identifier', (pg_control_system()).system_identifier::text,
  'migration_version', coalesce((SELECT max(version) FROM supabase_migrations.schema_migrations), ''),
  'checked_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
)::text;
SQL
}

verify_artifact_target_compatibility() {
  local target_fingerprint="$1"
  bun -e '
    const [manifestPath, fingerprintJson] = process.argv.slice(1);
    const manifest = await Bun.file(manifestPath).json();
    const target = JSON.parse(fingerprintJson);
    const sourceMigrationVersion = manifest.source_migration_version;
    if (sourceMigrationVersion !== target.migration_version) {
      throw new Error("源端与生产 migration 版本不一致");
    }
  ' "$ARTIFACT_DIR/manifest.json" "$target_fingerprint"
}

write_dry_run_receipt() {
  local target_fingerprint="$1"
  local manifest_digest="$2"
  local import_script_digest="$3"
  bun -e '
    const [receiptPath, fingerprintJson, manifestDigest, importScriptDigest] = process.argv.slice(1);
    const fingerprint = JSON.parse(fingerprintJson);
    const receipt = {
      ...fingerprint,
      manifest_digest: manifestDigest,
      import_script_digest: importScriptDigest,
    };
    await Bun.write(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
  ' "$ARTIFACT_DIR/dry-run.receipt" "$target_fingerprint" "$manifest_digest" "$import_script_digest"
  chmod 600 "$ARTIFACT_DIR/dry-run.receipt"
}

verify_dry_run_receipt() {
  local target_fingerprint="$1"
  local manifest_digest="$2"
  local import_script_digest="$3"
  bun -e '
    const [receiptPath, fingerprintJson, manifestDigest, importScriptDigest, maxAgeText] = process.argv.slice(1);
    const receipt = await Bun.file(receiptPath).json();
    const current = JSON.parse(fingerprintJson);
    const maxAgeSeconds = Number(maxAgeText);
    for (const key of ["system_identifier", "migration_version", "checked_at"]) {
      if (typeof receipt[key] !== "string" || typeof current[key] !== "string") {
        throw new Error(`dry-run receipt 字段无效: ${key}`);
      }
    }
    if (receipt.system_identifier !== current.system_identifier) {
      throw new Error("dry-run 目标数据库身份已变化");
    }
    if (receipt.migration_version !== current.migration_version) {
      throw new Error("dry-run 后生产 migration 版本已变化");
    }
    if (receipt.manifest_digest !== manifestDigest) {
      throw new Error("dry-run receipt 与当前产物不匹配");
    }
    if (receipt.import_script_digest !== importScriptDigest) {
      throw new Error("dry-run receipt 与当前 import 脚本不匹配");
    }
    const ageSeconds = (Date.parse(current.checked_at) - Date.parse(receipt.checked_at)) / 1000;
    if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > maxAgeSeconds) {
      throw new Error("dry-run receipt 已过期或时间无效");
    }
  ' "$ARTIFACT_DIR/dry-run.receipt" "$target_fingerprint" "$manifest_digest" "$import_script_digest" "$DRY_RUN_MAX_AGE_SECONDS"
}

stage_target_scripts() {
  REMOTE_STAGE="$(ssh -- "$TARGET_SSH" 'umask 077; mktemp -d /tmp/gooes-tenant-transfer-XXXXXXXX')"
  [[ "$REMOTE_STAGE" =~ ^/tmp/gooes-tenant-transfer-[A-Za-z0-9]+$ ]] || {
    echo "远端迁移暂存目录格式无效" >&2
    exit 1
  }
  scp -q \
    "$ARTIFACT_DIR/lock.sql" \
    "$ARTIFACT_DIR/copy.sql" \
    "$ARTIFACT_DIR/preflight.sql" \
    "$ARTIFACT_DIR/remap.sql" \
    "$ARTIFACT_DIR/verification.sql" \
    "$TARGET_SSH:$REMOTE_STAGE/"
  ssh -- "$TARGET_SSH" "chmod 600 '$REMOTE_STAGE'/*.sql && sudo docker exec '$DATABASE_CONTAINER' mkdir '$REMOTE_STAGE' && sudo docker cp '$REMOTE_STAGE/.' '$DATABASE_CONTAINER:$REMOTE_STAGE/'"
}

run_target_import() {
  local commit_transfer="$1"
  stage_target_scripts
  ssh -- "$TARGET_SSH" \
    "sudo docker exec -i '$DATABASE_CONTAINER' psql -U postgres -d postgres --no-psqlrc -X -qAt -v ON_ERROR_STOP=1 -v tenant_id='$TENANT_ID' -v lock_script='$REMOTE_STAGE/lock.sql' -v preflight_script='$REMOTE_STAGE/preflight.sql' -v copy_script='$REMOTE_STAGE/copy.sql' -v remap_script='$REMOTE_STAGE/remap.sql' -v verification_script='$REMOTE_STAGE/verification.sql' -v commit_transfer='$commit_transfer'" \
    < "$SCRIPT_DIR/import.sql"
}

verify_workers_paused() {
  local running_containers
  local worker
  running_containers="$(ssh -- "$TARGET_SSH" "sudo docker ps --format '{{.Names}}'")"
  for worker in \
    gooes-social-video-worker \
    gooes-cos-reconcile-worker \
    gooes-billing-reconcile-worker
  do
    if grep -Fxq "$worker" <<< "$running_containers"; then
      echo "生产写入 worker 实际仍在运行: $worker" >&2
      exit 1
    fi
  done
}

verify_remote_backup() {
  local backup_file="$1"
  local target_fingerprint="$2"
  local verification_output
  local metadata
  local actual_backup_sha256
  verification_output="$(ssh -- "$TARGET_SSH" bash -s -- "$backup_file" <<'REMOTE_BACKUP_CHECK'
set -euo pipefail
backup_file="$1"
[[ -f "$backup_file" && -s "$backup_file" ]]
[[ -f "$backup_file.sha256" && -s "$backup_file.sha256" ]]
[[ -f "$backup_file.list" && -s "$backup_file.list" ]]
[[ -f "$backup_file.metadata.json" && -s "$backup_file.metadata.json" ]]
actual_backup_sha256="$(sha256sum "$backup_file" | cut -d ' ' -f 1)"
[[ "$(wc -l < "$backup_file.sha256")" -eq 1 ]]
read -r sidecar_sha256 sidecar_path sidecar_extra < "$backup_file.sha256"
[[ -z "${sidecar_extra:-}" ]]
[[ "$sidecar_sha256" == "$actual_backup_sha256" ]]
[[ "$sidecar_path" == "$backup_file" ]]
actual_list="$(mktemp /tmp/gooes-backup-list-XXXXXXXX)"
trap 'rm -f "$actual_list"' EXIT
sudo docker exec -i supabase-db pg_restore -l < "$backup_file" > "$actual_list"
cmp -s "$actual_list" "$backup_file.list"
for schema in auth storage supabase_migrations; do
  grep -Eq "^[0-9]+; [0-9]+ [0-9]+ SCHEMA - ${schema} [^[:space:]]+$" "$actual_list"
done
grep -Eq "^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public tenants [^[:space:]]+$" "$actual_list"
grep -Eq "^[0-9]+; [0-9]+ [0-9]+ TABLE DATA auth users [^[:space:]]+$" "$actual_list"
grep -Eq "^[0-9]+; [0-9]+ [0-9]+ TABLE DATA storage objects [^[:space:]]+$" "$actual_list"
grep -Eq "^[0-9]+; [0-9]+ [0-9]+ TABLE DATA supabase_migrations schema_migrations [^[:space:]]+$" "$actual_list"
cat "$backup_file.metadata.json"
printf '%s\n' "$actual_backup_sha256"
REMOTE_BACKUP_CHECK
)"
  metadata="${verification_output%$'\n'*}"
  actual_backup_sha256="${verification_output##*$'\n'}"
  bun -e '
    const [metadataJson, actualBackupSha256, fingerprintJson, maxAgeText] = process.argv.slice(1);
    const metadata = JSON.parse(metadataJson);
    const current = JSON.parse(fingerprintJson);
    const maxAgeSeconds = Number(maxAgeText);
    if (metadata.system_identifier !== current.system_identifier || metadata.migration_version !== current.migration_version) {
      throw new Error("生产备份与当前目标数据库不匹配");
    }
    if (typeof metadata.backup_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(metadata.backup_sha256)) {
      throw new Error("生产备份 metadata 校验值无效");
    }
    if (metadata.backup_sha256 !== actualBackupSha256) {
      throw new Error("生产备份 metadata 与实际 dump 校验值不一致");
    }
    const ageSeconds = (Date.parse(current.checked_at) - Date.parse(metadata.created_at)) / 1000;
    if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > maxAgeSeconds) {
      throw new Error("生产备份已过期或时间无效");
    }
  ' "$metadata" "$actual_backup_sha256" "$target_fingerprint" "$BACKUP_MAX_AGE_SECONDS"
}

case "$MODE" in
  audit)
    run_source_sql "$SCRIPT_DIR/audit.sql"
    ;;
  export)
    ARTIFACT_DIR="${ARTIFACT_DIR:-$(mktemp -d "/tmp/gooes-tenant-transfer-${TENANT_ID}-XXXXXXXX")}"
    mkdir -p "$ARTIFACT_DIR"
    assert_artifact_outside_repo
    chmod 700 "$ARTIFACT_DIR"
    STAGING_FILE="$ARTIFACT_DIR/.bundle.json"
    run_source_sql "$SCRIPT_DIR/export.sql" > "$STAGING_FILE"
    chmod 600 "$STAGING_FILE"
    bun -e '
      const bundlePath = process.argv[1];
      const outputDir = process.argv[2];
      const bundle = await Bun.file(bundlePath).json();
      await Bun.write(`${outputDir}/manifest.json`, JSON.stringify(bundle.manifest, null, 2) + "\n");
      await Bun.write(`${outputDir}/lock.sql`, bundle.lock_sql + "\n");
      await Bun.write(`${outputDir}/copy.sql`, bundle.copy_sql + "\n");
      await Bun.write(`${outputDir}/preflight.sql`, bundle.preflight_sql + "\n");
      await Bun.write(`${outputDir}/remap.sql`, bundle.remap_sql + "\n");
      await Bun.write(`${outputDir}/verification.sql`, bundle.verification_sql + "\n");
    ' "$STAGING_FILE" "$ARTIFACT_DIR"
    rm -f "$STAGING_FILE"
    STAGING_FILE=""
    chmod 600 "$ARTIFACT_DIR"/*.json "$ARTIFACT_DIR"/*.sql
    (
      cd "$ARTIFACT_DIR"
      : > manifest.sha256
      for file in copy.sql lock.sql manifest.json preflight.sql remap.sql verification.sql; do
        checksum_file "$file" | awk '{print $1 "  " $2}' >> manifest.sha256
      done
      chmod 600 manifest.sha256
    )
    verify_checksums "$ARTIFACT_DIR"
    printf '%s\n' "$ARTIFACT_DIR"
    ;;
  dry-run)
    require_artifact
    target_fingerprint="$(get_target_fingerprint)"
    verify_artifact_target_compatibility "$target_fingerprint"
    run_target_import false
    manifest_digest="$(checksum_file "$ARTIFACT_DIR/manifest.sha256" | awk '{print $1}')"
    import_script_digest="$(checksum_file "$SCRIPT_DIR/import.sql" | awk '{print $1}')"
    target_fingerprint="$(get_target_fingerprint)"
    write_dry_run_receipt "$target_fingerprint" "$manifest_digest" "$import_script_digest"
    ;;
  apply)
    require_artifact
    [[ "${TENANT_TRANSFER_CONFIRMATION:-}" == "$EXPECTED_CONFIRMATION" ]] || {
      echo "生产确认文本不匹配" >&2
      exit 2
    }
    [[ "${TENANT_TRANSFER_WORKERS_PAUSED:-}" == "confirmed" ]] || {
      echo "生产写入 worker 尚未确认暂停" >&2
      exit 2
    }
    [[ -n "${TENANT_TRANSFER_BACKUP_FILE:-}" ]] || {
      echo "缺少 TENANT_TRANSFER_BACKUP_FILE" >&2
      exit 2
    }
    [[ "$TENANT_TRANSFER_BACKUP_FILE" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
      echo "生产备份路径格式无效" >&2
      exit 2
    }
    [[ -s "$ARTIFACT_DIR/dry-run.receipt" ]] || {
      echo "缺少成功 dry-run receipt" >&2
      exit 1
    }
    manifest_digest="$(checksum_file "$ARTIFACT_DIR/manifest.sha256" | awk '{print $1}')"
    import_script_digest="$(checksum_file "$SCRIPT_DIR/import.sql" | awk '{print $1}')"
    target_fingerprint="$(get_target_fingerprint)"
    verify_artifact_target_compatibility "$target_fingerprint"
    verify_remote_backup "$TENANT_TRANSFER_BACKUP_FILE" "$target_fingerprint"
    verify_dry_run_receipt "$target_fingerprint" "$manifest_digest" "$import_script_digest"
    verify_workers_paused
    run_target_import true
    ;;
esac
