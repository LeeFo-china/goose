import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("wechat pay migration contract", () => {
  test("extends tenant payment configs instead of adding a duplicate config table", () => {
    const migrationSource = readWechatPayMigration();

    expect(migrationSource).toContain("ALTER TABLE public.tenant_payment_configs");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS merchant_name");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS serial_no");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS notify_url");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS validation_status");
    expect(migrationSource).not.toContain("tenant_wechat_pay_configs");
  });

  test("creates idempotent order and notification tables", () => {
    const migrationSource = readWechatPayMigration();

    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.wechat_payment_orders");
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.wechat_payment_notifications");
    expect(migrationSource).toContain("wechat_payment_orders_tenant_out_trade_unique_idx");
    expect(migrationSource).toContain("wechat_payment_orders_transaction_unique_idx");
    expect(migrationSource).toContain("wechat_payment_orders_pending_task_unique_idx");
    expect(migrationSource).toContain("wechat_payment_notifications_notify_unique_idx");
  });

  test("registers first-batch wechat pay permissions", () => {
    const migrationSource = readWechatPayMigration();

    expect(migrationSource).toContain("wechat_pay.config.read");
    expect(migrationSource).toContain("wechat_pay.config.manage");
    expect(migrationSource).toContain("wechat_pay.order.read");
    expect(migrationSource).toContain("wechat_pay.notify.read");
    expect(migrationSource).not.toContain("wechat_pay.refund.request");
    expect(migrationSource).not.toContain("wechat_pay.refund.review");
  });

  test("extends tenant payment configs for sub merchant onboarding state", () => {
    const migrationSource = readWechatPaySubMerchantMigration();

    expect(migrationSource).toContain("ALTER TABLE public.tenant_payment_configs");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS principal_type");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS applyment_business_code");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS applyment_id");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS applyment_state");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS appid_binding_state");
    expect(migrationSource).toContain("tenant_payment_configs_principal_type_check");
    expect(migrationSource).toContain("tenant_payment_configs_applyment_state_check");
    expect(migrationSource).toContain("tenant_payment_configs_appid_binding_state_check");
    expect(migrationSource).toContain("tenant_payment_configs_sub_merchant_unique_idx");
    expect(migrationSource).not.toContain("api_v3_key");
    expect(migrationSource).not.toContain("private_key");
  });

  test("adds bounded lookup indexes for wechat pay callback processing", () => {
    const migrationSource = readWechatPayCallbackLookupMigration();

    expect(migrationSource).toContain("wechat_payment_orders_out_trade_no_idx");
    expect(migrationSource).toContain(
      "tenant_payment_configs_wechat_callback_candidates_idx",
    );
    expect(migrationSource).toContain("encrypted_config_ref IS NOT NULL");
  });
});

function readWechatPayMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260701093000_wechat_pay_models.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readWechatPaySubMerchantMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260701143000_wechat_pay_submerchant_onboarding.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readWechatPayCallbackLookupMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260701170000_wechat_pay_callback_lookup_indexes.sql",
      import.meta.url,
    ),
    "utf8",
  );
}
