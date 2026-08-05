import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("platform billing manage permission migration", () => {
  test("seeds billing manage permission and grants it to platform admin only", () => {
    const migration = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260805192000_seed_platform_billing_manage_permission.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migration).toContain("platform.billing.manage");
    expect(migration).toMatch(/INSERT INTO public\.permissions/i);
    expect(migration).toMatch(/roles\.code = 'platform_admin'/);
    expect(migration).not.toContain("platform_finance_review");
  });
});
