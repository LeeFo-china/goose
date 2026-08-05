import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const foundationMigrationSql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260805180000_create_platform_operator_rbac_foundation.sql",
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
});
