import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

function readContractFile(name: string): string {
  const url = new URL(name, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

const auditSql = readContractFile("./audit.sql");
const exportSql = readContractFile("./export.sql");
const importSql = readContractFile("./import.sql");
const transferScript = readContractFile("./tenant-transfer.sh");

describe("tenant production transfer safety contract", () => {
  test("pins the approved tenant and requires an exact production confirmation", () => {
    expect(transferScript).toContain(
      'TENANT_ID="3eebca47-961f-4899-b976-a3d3208d326b"',
    );
    expect(transferScript).toContain(
      '确认迁移租户 3eebca47-961f-4899-b976-a3d3208d326b 到生产',
    );
    expect(transferScript).toContain('case "$MODE" in');
    expect(transferScript).toContain("audit|export|dry-run|apply)");
    expect(transferScript).toContain("manifest.tenant_id !== tenantId");
    expect(transferScript).toContain('EXPECTED_SOURCE_MIGRATION_VERSION="20260826113000"');
    expect(importSql).toContain("迁移租户状态更新行数异常");
  });

  test("keeps source inspection read-only and exports only active login identities", () => {
    expect(auditSql).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;");
    expect(exportSql).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;");
    expect(exportSql).toContain("membership.status = 'active'");
    expect(exportSql).toContain("oauth.status = 'active'");
    expect(exportSql).toContain("auth.identities");
    expect(exportSql).not.toContain("auth.sessions");
    expect(exportSql).not.toContain("auth.mfa_factors");
    expect(exportSql).toContain(
      "WHEN target.schema_name = 'auth' AND target.table_name = 'users' THEN",
    );
    expect(exportSql).toContain("''is_super_admin'', false");
    expect(exportSql).toContain("''role'', ''authenticated''");
    expect(exportSql).toContain("''recovery_token'', ''''");
    expect(exportSql).toContain("''email_change_token_new'', ''''");
    expect(exportSql).toContain("''phone_change_token'', ''''");
    expect(exportSql).toContain("''reauthentication_token'', ''''");
  });

  test("excludes environment credentials, ephemeral state and development fixtures", () => {
    for (const table of [
      "customer_wechat_pay_smoke_orders",
      "douyin_miniapp_authorization_intents",
      "douyin_miniapp_installations",
      "phone_identity_login_candidates",
      "notifications",
      "tenant_payment_configs",
      "tenant_wechat_pay_applyments",
      "user_location_contexts",
      "wechat_mini_session_credentials",
      "wechat_rebind_requests",
    ]) {
      expect(exportSql).toContain(`('${table}',`);
    }
    expect(exportSql).toContain("dev-fixture-placeholder");
    expect(exportSql).toContain("f1700000-0000-4000-8000-000000000001");
    expect(exportSql).toContain("f1700000-0000-4000-8000-000000000021");
    expect(exportSql).toContain("WHEN edge.child_table = 'customer_log_share_campaigns' THEN");
    expect(exportSql).toContain("WHEN edge.child_table = 'customer_appointment_reward_campaigns' THEN");
    expect(exportSql).toContain("tenant_transfer_excluded_rows");
    expect(exportSql).toContain("00000000-0000-4000-8000-202606160006");
  });

  test("transfers tenant-owned public profile and service areas", () => {
    expect(exportSql).not.toContain("('tenant_service_provider_profiles',");
    expect(exportSql).not.toContain("('tenant_service_areas',");
  });

  test("checks target collisions before loading any row", () => {
    const conflictCheck = importSql.indexOf("tenant_target_conflicts");
    const firstCopy = importSql.indexOf("\\i :copy_script");

    expect(conflictCheck).toBeGreaterThanOrEqual(0);
    expect(firstCopy).toBeGreaterThan(conflictCheck);
    expect(importSql).toContain("目标租户 ID、名称或 slug 已存在");
    expect(importSql).toContain("ON_ERROR_STOP");
  });

  test("imports transactionally and verifies counts and foreign keys before commit", () => {
    expect(importSql).toContain("BEGIN;");
    expect(importSql).toContain("pg_advisory_xact_lock");
    expect(importSql).toContain(":lock_script");
    expect(importSql).toContain("SET LOCAL session_replication_role = replica;");
    expect(importSql).toContain("tenant_transfer_expected_counts");
    expect(importSql).toContain("tenant_transfer_fk_violations");
    expect(importSql).toContain("status = 'suspended'");
    expect(importSql).toContain("ROLLBACK;");
    expect(importSql).toContain("COMMIT;");

    const lock = importSql.indexOf("\\i :lock_script");
    const preflight = importSql.indexOf("\\i :preflight_script");
    const copy = importSql.indexOf("\\i :copy_script");
    const remap = importSql.indexOf("\\i :remap_script");
    const verification = importSql.indexOf("\\i :verification_script");
    const countCheck = importSql.indexOf("tenant_transfer_expected_counts");
    const fkCheck = importSql.indexOf("tenant_transfer_fk_violations");
    const commit = importSql.lastIndexOf("COMMIT;");
    expect(lock).toBeLessThan(preflight);
    expect(preflight).toBeLessThan(copy);
    expect(copy).toBeLessThan(remap);
    expect(remap).toBeLessThan(verification);
    expect(countCheck).toBeLessThan(fkCheck);
    expect(fkCheck).toBeLessThan(commit);
  });

  test("remaps cross-environment references without copying development credentials", () => {
    expect(exportSql).toContain("tenant_transfer_remap_rules");
    expect(exportSql).toContain("sanitized_douyin_installation");
    expect(exportSql).toContain("sanitized_sms_verification_code");
    expect(exportSql).toContain("''authorization_status'', ''revoked''");
    expect(exportSql).toContain("''access_token_ciphertext'', NULL");
    expect(exportSql).toContain("''code'', ''MIGRATED''");
    expect(exportSql).toContain("WHEN target.table_name = 'tenant_supplier_settings' THEN");
    expect(exportSql).toContain("''module_enabled'', false");
    expect(exportSql).toContain("''enabled_by_employee_id'', NULL");
    expect(exportSql).toContain("''enabled_at'', NULL");
    expect(exportSql).toContain("''ownership_reads_enabled'', false");
    expect(exportSql).toContain("''private_supplier_writes_enabled'', false");
    expect(exportSql).toContain("''private_catalog_writes_enabled'', false");
    expect(exportSql).toContain("''procurement_snapshot_v1_enabled'', false");
    expect(exportSql).toContain("WHEN target.table_name = 'ocr_recognitions' THEN");
    expect(exportSql).toContain("''result_ciphertext'', NULL");
    expect(exportSql).toContain("''status'', ''expired''");
    expect(exportSql).toContain(
      "owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid",
    );
    expect(exportSql).toContain("system.release.read");
    expect(exportSql).toContain("system.release.run");
    expect(exportSql).toContain("permission.code NOT LIKE ''platform.%''");
    expect(exportSql).toContain("employee_permission_overrides");
    expect(exportSql).toContain("WHEN 'tenant_supplier_code_registry' THEN");
    expect(exportSql).toContain(
      "row.tenant_supplier_id IS NULL OR EXISTS",
    );
    expect(exportSql).toContain(
      "SELECT component.component_appid INTO STRICT target_component_appid",
    );
    expect(exportSql).toContain(
      "WHERE component.status = ''active''",
    );

    const copy = importSql.indexOf(":copy_script");
    const remap = importSql.indexOf(":remap_script");
    const verification = importSql.indexOf(":verification_script");
    expect(copy).toBeGreaterThanOrEqual(0);
    expect(remap).toBeGreaterThan(copy);
    expect(verification).toBeGreaterThan(remap);
  });

  test("checksums every sensitive artifact and refuses group-readable output", () => {
    expect(transferScript).toContain("umask 077");
    expect(transferScript).toContain("sha256sum");
    expect(transferScript).toContain("chmod 600");
    expect(transferScript).toContain("manifest.sha256");
    expect(transferScript).toContain("trap cleanup EXIT");
    expect(transferScript).toContain("REPO_ROOT");
    expect(transferScript).toContain("生产迁移制品目录不能位于仓库内");
    expect(transferScript).not.toContain("rm -rf '$REMOTE_STAGE'\" >/dev/null 2>&1 || true");
    expect(transferScript).toContain("EXPECTED_ARTIFACT_FILES");
    expect(transferScript).toContain("制品校验清单文件集合不完整");
    expect(transferScript).toContain("mktemp -d /tmp/gooes-tenant-transfer-XXXXXXXX");
    expect(transferScript).not.toContain("TENANT_TRANSFER_SOURCE_SSH");
    expect(transferScript).not.toContain("TENANT_TRANSFER_TARGET_SSH");
    expect(transferScript).not.toContain("TENANT_TRANSFER_DATABASE_CONTAINER");
  });

  test("binds a short-lived dry-run receipt to the production database", () => {
    expect(transferScript).toContain("system_identifier");
    expect(transferScript).toContain("migration_version");
    expect(transferScript).toContain("manifest_digest");
    expect(transferScript).toContain("import_script_digest");
    expect(transferScript).toContain("DRY_RUN_MAX_AGE_SECONDS=1800");
    expect(transferScript).toContain("TENANT_TRANSFER_WORKERS_PAUSED");
    expect(exportSql).toContain("source_migration_version");
    expect(exportSql).toContain("schema_contract");
    expect(transferScript).toContain("sourceMigrationVersion");
    expect(importSql).toContain("SET LOCAL lock_timeout");
    expect(importSql).toContain("SET LOCAL statement_timeout");
  });

  test("requires a recent verified full backup and actually stopped workers", () => {
    expect(transferScript).toContain("verify_remote_backup");
    expect(transferScript).toContain(".sha256");
    expect(transferScript).toContain(".list");
    expect(transferScript).toContain(".metadata.json");
    expect(transferScript).toContain("pg_restore");
    expect(transferScript).toContain("supabase_migrations");
    expect(transferScript).toContain("verify_workers_paused");
    expect(transferScript).toContain("gooes-social-video-worker");
    expect(transferScript).toContain("gooes-cos-reconcile-worker");
    expect(transferScript).toContain("gooes-billing-reconcile-worker");
    expect(transferScript).toContain("actual_backup_sha256");
    expect(transferScript).toContain('[[ "$(wc -l < "$backup_file.sha256")" -eq 1 ]]');
    expect(transferScript).toContain('[[ "$sidecar_sha256" == "$actual_backup_sha256" ]]');
    expect(transferScript).toContain('[[ "$sidecar_path" == "$backup_file" ]]');
    expect(transferScript).toContain("cmp -s");
    expect(transferScript).toContain('SCHEMA - ${schema} ');
    expect(transferScript).toContain("TABLE DATA public tenants");
    expect(transferScript).toContain("TABLE DATA auth users");
    expect(transferScript).toContain("TABLE DATA storage objects");
    expect(transferScript).toContain("TABLE DATA supabase_migrations schema_migrations");
    expect(transferScript).toContain("metadata.backup_sha256 !== actualBackupSha256");
  });
});
