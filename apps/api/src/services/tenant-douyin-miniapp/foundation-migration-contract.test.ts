import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../../../../supabase/migrations/20260726100000_tenant_douyin_workspace_foundation.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\s+/g, " ");

describe("tenant douyin workspace foundation migration", () => {
  test("seeds tenant permissions for tenant system administrators", () => {
    for (const code of [
      "douyin_miniapp.read",
      "douyin_miniapp.manage",
      "douyin_miniapp.audit.submit",
      "douyin_lead.read",
      "douyin_lead.assign",
      "douyin_lead.follow_up",
      "douyin_lead.convert",
    ]) {
      expect(migration).toContain(`'${code}'`);
    }

    expect(migration).toContain("WHERE roles.code = 'system_admin'");
    expect(migration).toContain("AND roles.tenant_id IS NOT NULL");
  });

  test("rejects dirty data before creating one-active-merchant index", () => {
    expect(migration).toContain(
      "DOUYIN_TENANT_MULTIPLE_ACTIVE_MERCHANT_INSTALLATIONS",
    );
    expect(migration).toContain(
      "CREATE UNIQUE INDEX douyin_miniapp_installations_one_active_merchant_per_tenant",
    );
    expect(migration).toContain(
      "WHERE tenant_id IS NOT NULL AND installation_kind = 'merchant' AND authorization_status = 'active'",
    );
  });
});
