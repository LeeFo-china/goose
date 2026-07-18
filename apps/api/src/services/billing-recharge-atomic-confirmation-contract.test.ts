import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    import.meta.dir,
    "../../../../supabase/migrations/20260718121000_confirm_recharge_and_recover_atomically.sql",
  ),
  "utf8",
);
const serviceDirectory = import.meta.dir;
const confirmationSource = readFileSync(
  join(serviceDirectory, "billing-recharge-payment-confirmation.ts"),
  "utf8",
);
const callbackSource = readFileSync(
  join(serviceDirectory, "wechat-pay-callbacks.ts"),
  "utf8",
);
const compensationSource = readFileSync(
  join(serviceDirectory, "platform-billing-recharge-compensation.ts"),
  "utf8",
);

describe("atomic recharge confirmation migration", () => {
  test("confirms credits before recovering the confirmed order tenant subscription", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_confirm_wechat_recharge_and_recover",
    );
    expect(migration).toMatch(
      /billing_confirm_wechat_recharge\([\s\S]*billing_recover_subscription_after_recharge\(/,
    );
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain("v_confirmation->'order'->>'tenant_id'");
    expect(migration).toContain("'recovery', v_recovery");
  });

  test("exposes the wrapper only to service_role", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).toContain("FROM PUBLIC");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("FROM authenticated");
    expect(migration).toContain("TO service_role");
  });

  test("keeps every application confirmation path on the atomic repository call", () => {
    expect(confirmationSource).not.toContain("recoverAfterRecharge");
    expect(callbackSource).not.toContain("billingSubscriptionService");
    expect(compensationSource).not.toContain("recoverAfterRecharge");
  });
});
