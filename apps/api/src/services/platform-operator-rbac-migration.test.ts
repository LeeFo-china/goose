import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const foundationMigrationSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260805180000_create_platform_operator_rbac_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

const commandMigrationSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260805183000_create_platform_operator_commands.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("platform operator RBAC migrations", () => {
  test("creates platform staff foundation without tenant role leakage", () => {
    expect(foundationMigrationSql).toContain(
      "ADD COLUMN IF NOT EXISTS admin_auth_version integer NOT NULL DEFAULT 1",
    );
    expect(foundationMigrationSql).toContain(
      "ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1",
    );
    expect(foundationMigrationSql).toContain("'platform_staff'");
    expect(foundationMigrationSql).toContain("'platform_operations'");
    expect(foundationMigrationSql).toContain(
      "permissions.code LIKE 'platform.%'",
    );
    expect(foundationMigrationSql).toContain("access_scope = 'all'");
    expect(foundationMigrationSql).toContain(
      "CREATE FUNCTION public.guard_platform_employee_phone",
    );
    expect(foundationMigrationSql).toContain("pg_advisory_xact_lock");
    expect(foundationMigrationSql).toContain("GRANT EXECUTE");
    expect(foundationMigrationSql).toContain("TO service_role");
    expect(foundationMigrationSql).not.toContain("TO authenticated");
  });

  test("creates service-role-only platform operator and role commands", () => {
    for (const fn of [
      "create_platform_operator",
      "update_platform_operator",
      "replace_platform_operator_roles",
      "transition_platform_operator_status",
      "revoke_platform_operator_sessions",
      "create_platform_role",
      "update_platform_role",
      "replace_platform_role_permissions",
      "archive_platform_role",
    ]) {
      expect(commandMigrationSql).toContain(`FUNCTION public.${fn}`);
      expect(commandMigrationSql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]*TO service_role`,
        ),
      );
    }

    expect(commandMigrationSql).toContain("PLATFORM_LAST_SUPER_ADMIN_REQUIRED");
    expect(commandMigrationSql).toContain("platform_audit_logs");
    expect(commandMigrationSql).toContain(
      "admin_auth_version = admin_auth_version + 1",
    );
    expect(commandMigrationSql).toContain("permissions.code LIKE 'platform.%'");
    expect(commandMigrationSql).not.toContain("TO authenticated");
  });
});
