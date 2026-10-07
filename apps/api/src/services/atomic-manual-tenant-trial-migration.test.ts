import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20261007102000_atomic_manual_tenant_trial_create.sql",
  import.meta.url,
);

describe("atomic manual tenant trial creation", () => {
  test("creates the tenant and trial inside one database function", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("create or replace function public.create_platform_tenant_with_trial");
    expect(sql).toContain("public.create_tenant_with_default_template(");
    expect(sql).toContain("public.platform_service_trial_grant(");
    expect(sql).toContain("service_access_policy = 'entitlement_required'");
    expect(sql).toContain("p_grace_days => 7");
  });
});
