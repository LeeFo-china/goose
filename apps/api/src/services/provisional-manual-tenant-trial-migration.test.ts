import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20261007101000_provisional_manual_tenant_trials.sql",
  import.meta.url,
);

describe("provisional manual tenant trial migration", () => {
  test("keeps verified and provisional identity keys distinct", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("identity_basis");
    expect(sql).toContain("provisional_tenant");
    expect(sql).toContain("provisional-tenant:");
    expect(sql).toContain("platform_service_trial_grant");
    expect(sql).toContain("platform_service_trial_lock_verified_enterprise_identity");
  });
});
