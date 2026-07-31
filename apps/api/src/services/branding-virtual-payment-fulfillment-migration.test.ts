import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260801101000_create_branding_virtual_payment_fulfillment.sql",
  import.meta.url,
);

describe("branding virtual-payment fulfillment migration", () => {
  test("creates a private durable inbox without raw payload storage", async () => {
    const migration = await Bun.file(migrationPath).text();
    expect(migration).toContain("CREATE TABLE public.wechat_virtual_payment_notifications");
    expect(migration).toContain("event_key text NOT NULL UNIQUE");
    expect(migration).toContain("normalized_payload jsonb NOT NULL");
    expect(migration).not.toContain("raw_payload");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.wechat_virtual_payment_notifications[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE");
  });

  test("uses the shared tenant lock before order and entitlement locks", async () => {
    const migration = await Bun.file(migrationPath).text();
    const functionBody = migration.slice(
      migration.indexOf("CREATE OR REPLACE FUNCTION public.branding_confirm_virtual_addon_purchase"),
    );
    const tenantLock = functionBody.indexOf("20260728");
    const orderLock = functionBody.indexOf("FOR UPDATE");
    const entitlementLock = functionBody.indexOf("tenant_entitlements", orderLock);
    expect(tenantLock).toBeGreaterThan(0);
    expect(tenantLock).toBeLessThan(orderLock);
    expect(orderLock).toBeLessThan(entitlementLock);
    expect(functionBody).toContain("interval '1 year'");
  });

  test("persists payment before a recoverable grant subtransaction", async () => {
    const migration = await Bun.file(migrationPath).text();
    expect(migration).toContain("payment_status = 'succeeded'");
    expect(migration).toContain("fulfillment_status = 'grant_failed'");
    expect(migration).toMatch(/BEGIN[\s\S]*INSERT INTO public\.tenant_entitlement_events[\s\S]*EXCEPTION[\s\S]*WHEN OTHERS/);
    expect(migration).toContain("BRANDING_VIRTUAL_LATE_PAYMENT_AFTER_CLOSE");
    expect(migration).toContain("OLD.payment_status = 'closed'");
    expect(migration).toContain("NEW.payment_status = 'succeeded'");
  });

  test("validates every provider binding and both provider identities", async () => {
    const migration = await Bun.file(migrationPath).text();
    for (const code of [
      "BRANDING_VIRTUAL_PAYMENT_OPENID_MISMATCH",
      "BRANDING_VIRTUAL_PAYMENT_OUT_TRADE_NO_MISMATCH",
      "BRANDING_VIRTUAL_PAYMENT_ENVIRONMENT_MISMATCH",
      "BRANDING_VIRTUAL_PAYMENT_PRODUCT_MISMATCH",
      "BRANDING_VIRTUAL_PAYMENT_QUANTITY_MISMATCH",
      "BRANDING_VIRTUAL_PAYMENT_CURRENCY_MISMATCH",
      "BRANDING_VIRTUAL_PAYMENT_AMOUNT_MISMATCH",
      "BRANDING_VIRTUAL_PAYMENT_ATTACH_MISMATCH",
      "BRANDING_VIRTUAL_PAYMENT_TRANSACTION_CONFLICT",
      "BRANDING_VIRTUAL_PAYMENT_PROVIDER_ORDER_CONFLICT",
    ]) expect(migration).toContain(code);
    expect(migration).toContain("digest(v_order.payer_openid, 'sha256')");
    expect(migration).toContain("other_order.transaction_id = p_transaction_id");
    expect(migration).toContain("other_order.provider_order_no = p_provider_order_no");
    expect(migration).toContain("v_order.payment_request_issued_at IS NULL");
    expect(migration).toContain("BRANDING_VIRTUAL_PAYMENT_LATE_UNISSUED_ORDER");
  });

  test("binds notification confirmation to the complete immutable inbox fact", async () => {
    const migration = await Bun.file(migrationPath).text();
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.guard_wechat_virtual_payment_notification_snapshot");
    for (const field of [
      "openid_hash",
      "provider_order_no",
      "transaction_id",
      "paid_at",
      "quantity",
      "orig_price_fen",
      "actual_price_fen",
      "attach",
    ]) expect(migration).toContain(`normalized_payload->>'${field}'`);
  });

  test("keeps late-close recovery explicit and preserves stopped entitlement status", async () => {
    const migration = await Bun.file(migrationPath).text();
    expect(migration).toContain("p_allow_late_closed_recovery AND p_source <> 'reconciliation'");
    expect(migration).toContain("v_is_late_closed AND NOT p_allow_late_closed_recovery");
    expect(migration).toContain("v_entitlement.status IN ('suspended', 'revoked')");
    expect(migration).not.toMatch(/SET\s+status = 'active'[\s\S]{0,260}v_entitlement\.status IN \('suspended', 'revoked'\)/);
  });

  test("keeps every security-definer function service-role only", async () => {
    const migration = await Bun.file(migrationPath).text();
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.branding_confirm_virtual_addon_purchase\([\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.branding_confirm_virtual_addon_purchase\([\s\S]*TO service_role/);
  });
});
