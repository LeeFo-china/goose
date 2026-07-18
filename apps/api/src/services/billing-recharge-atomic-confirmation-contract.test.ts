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
  test("locks recoverable invoice and subscription before credit confirmation", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_confirm_wechat_recharge_and_recover",
    );
    expect(migration).toMatch(
      /FROM public\.tenant_credit_orders[\s\S]*FROM public\.tenant_subscription_invoices[\s\S]*FOR UPDATE[\s\S]*FROM public\.tenant_billing_subscriptions[\s\S]*FOR UPDATE[\s\S]*billing_confirm_wechat_recharge\([\s\S]*billing_recover_subscription_after_recharge\(/,
    );
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain("BILLING_RECHARGE_ORDER_NOT_FOUND");
    expect(migration).toContain("'recovery', v_recovery");
  });

  test("prevents direct service-role calls from bypassing the canonical lock order", () => {
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTION public.billing_confirm_wechat_recharge(",
    );
    expect(migration).toContain("FROM service_role");
  });

  test("uses the same deterministic recoverable invoice in prelock and recovery", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_recover_subscription_after_recharge",
    );
    expect(migration).toContain(
      "ORDER BY invoices.due_at ASC, invoices.id ASC",
    );
    expect(migration).toContain("ORDER BY due_at ASC, id ASC");
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
