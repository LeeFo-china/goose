import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationSource = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260721170000_atomic_wechat_pay_applyment_activation.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("wechat pay applyment activation migration", () => {
  test("activates tenant payment config and applyment atomically", () => {
    expect(migrationSource).toContain(
      "CREATE OR REPLACE FUNCTION public.activate_wechat_pay_applyment_config",
    );
    expect(migrationSource).toContain("FOR UPDATE");
    expect(migrationSource).toContain("INSERT INTO public.tenant_payment_configs");
    expect(migrationSource).toContain("ON CONFLICT (tenant_id, provider) DO UPDATE");
    expect(migrationSource).toContain("status = 'active'");
    expect(migrationSource).toContain("sensitive_payload_ciphertext = NULL");
    expect(migrationSource).toContain(
      "INSERT INTO public.tenant_wechat_pay_applyment_events",
    );
    expect(migrationSource).toContain("auth.role() <> 'service_role'");
    expect(migrationSource).toContain("TO service_role");
  });
});
