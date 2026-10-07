import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20261007100000_manual_tenant_access_policy.sql",
  import.meta.url,
);

describe("manual tenant access policy migration", () => {
  test("preserves existing access and adds explicit policy for manual tenants", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("creation_source");
    expect(sql).toContain("service_access_policy");
    expect(sql).toContain("default 'legacy_compatible'");
    expect(sql).toContain("'service_access_policy', (select service_access_policy from tenant_fact)");
  });
});
