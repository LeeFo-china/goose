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

  test("creates tenant wechat pay applyment workflow tables and indexes", () => {
    const migrationSource = readWechatPayApplymentMigration();

    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.tenant_wechat_pay_applyments");
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.tenant_wechat_pay_applyment_events");
    expect(migrationSource).toContain("tenant_wechat_pay_applyments_status_check");
    expect(migrationSource).toContain("tenant_wechat_pay_applyments_tenant_status_submitted_idx");
    expect(migrationSource).toContain("tenant_wechat_pay_applyment_events_applyment_created_idx");
    expect(migrationSource).toContain("tenant_wechat_pay_applyments_application_no_unique_idx");
    expect(migrationSource).not.toContain("api_v3_key");
    expect(migrationSource).not.toContain("private_key");
  });

  test("registers tenant and platform applyment permissions", () => {
    const migrationSource = readWechatPayApplymentMigration();

    expect(migrationSource).toContain("wechat_pay.applyment.read");
    expect(migrationSource).toContain("wechat_pay.applyment.submit");
    expect(migrationSource).toContain("platform.wechat_pay.applyment.read");
    expect(migrationSource).toContain("platform.wechat_pay.applyment.review");
    expect(migrationSource).toContain("platform.wechat_pay.applyment.manage");
    expect(migrationSource).toContain("platform.wechat_pay.config.activate");
  });

  test("extends applyments with official bank account fields without plaintext account storage", () => {
    const migrationSource = readWechatPayApplymentBankAccountMigration();

    expect(migrationSource).toContain("settlement_account_type");
    expect(migrationSource).toContain("settlement_account_number_masked");
    expect(migrationSource).toContain("settlement_bank_full_name");
    expect(migrationSource).toContain("settlement_bank_branch_id");
    expect(migrationSource).toContain("tenant_wechat_pay_applyments_settlement_account_type_check");
    expect(migrationSource).not.toContain("settlement_account_number text");
    expect(migrationSource).not.toContain("account_number_encrypted");
  });

  test("adds platform wechat recharge primitives for tenant credit billing", () => {
    const migrationSource = readPlatformWechatRechargeMigration();

    expect(migrationSource).toContain("ALTER TABLE public.tenant_credit_orders");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS payment_config_id");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS out_trade_no");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS prepay_id");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS transaction_id");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS paid_amount_fen");
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.tenant_credit_wechat_notifications");
    expect(migrationSource).toContain("tenant_credit_orders_out_trade_unique_idx");
    expect(migrationSource).toContain("tenant_credit_orders_wechat_transaction_unique_idx");
    expect(migrationSource).toContain("tenant_credit_wechat_notifications_notify_unique_idx");
    expect(migrationSource).toContain("CREATE OR REPLACE FUNCTION public.billing_confirm_wechat_recharge");
    expect(migrationSource).toContain("'wechat_recharge'");
    expect(migrationSource).toContain("FOR UPDATE");
    expect(migrationSource).toContain("BILLING_RECHARGE_AMOUNT_MISMATCH");
    expect(migrationSource).not.toContain("finance_ledger_entries");
    expect(migrationSource).not.toContain("wechat_payment_orders");
  });

  test("binds tenant credit wechat recharge orders to platform payment configs", () => {
    const migrationSource = readPlatformWechatRechargePaymentConfigFkMigration();

    expect(migrationSource).toContain(
      "DROP CONSTRAINT IF EXISTS tenant_credit_orders_payment_config_id_fkey",
    );
    expect(migrationSource).toContain(
      "ADD CONSTRAINT tenant_credit_orders_payment_config_id_fkey",
    );
    expect(migrationSource).toContain("FOREIGN KEY (payment_config_id)");
    expect(migrationSource).toContain(
      "REFERENCES public.platform_payment_configs(id)",
    );
    expect(migrationSource).toContain("ON DELETE SET NULL");
    expect(migrationSource).not.toContain(
      "REFERENCES public.tenant_payment_configs(id)",
    );
  });

  test("creates platform payment config for platform recharge merchant", () => {
    const migrationSource = [
      readPlatformPaymentConfigMigration(),
      readPlatformPaymentProfilesMigration(),
    ].join("\n");

    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.platform_payment_configs");
    expect(migrationSource).toContain("provider text NOT NULL DEFAULT 'wechat_pay'");
    expect(migrationSource).toContain("profile_code");
    expect(migrationSource).toContain("principal_type text NOT NULL DEFAULT 'platform'");
    expect(migrationSource).toContain("merchant_mode text NOT NULL DEFAULT 'direct_merchant'");
    expect(migrationSource).toContain("service_provider_sub_merchant");
    expect(migrationSource).toContain("sub_merchant_id");
    expect(migrationSource).toContain("sub_app_id");
    expect(migrationSource).toContain("encrypted_config_ref text NULL");
    expect(migrationSource).toContain("enabled_channels text[] NOT NULL DEFAULT ARRAY['tenant_recharge']");
    expect(migrationSource).toContain("platform_payment_configs_provider_profile_unique_idx");
    expect(migrationSource).toContain("platform.payment.config.read");
    expect(migrationSource).toContain("platform.payment.config.manage");
    expect(migrationSource).toContain("PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE");
    expect(migrationSource).not.toContain("api_v3_key");
    expect(migrationSource).not.toContain("private_key");
  });

  test("creates platform credit recharge product table", () => {
    const migrationSource = readPlatformCreditRechargeProductsMigration();

    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.platform_credit_recharge_products");
    expect(migrationSource).toContain("code text NOT NULL");
    expect(migrationSource).toContain("amount_fen integer NOT NULL");
    expect(migrationSource).toContain("credits bigint NOT NULL");
    expect(migrationSource).toContain("bonus_credits bigint NOT NULL DEFAULT 0");
    expect(migrationSource).toContain("platform_credit_recharge_products_code_unique_idx");
    expect(migrationSource).toContain("platform_credit_recharge_products_enabled_sort_idx");
    expect(migrationSource).toContain("billing.recharge.create");
    expect(migrationSource).toContain("billing.recharge.read");
    expect(migrationSource).toContain("platform.billing.recharge_product.manage");
    expect(migrationSource).not.toContain("api_v3_key");
    expect(migrationSource).not.toContain("private_key");
  });

  test("creates tenant credit refund request records without direct refund execution", () => {
    const migrationSource = readTenantCreditRefundRequestsMigration();

    expect(migrationSource).toContain("ALTER TABLE public.tenant_credit_orders");
    expect(migrationSource).toContain("ADD COLUMN IF NOT EXISTS refund_status");
    expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.tenant_credit_refund_requests");
    expect(migrationSource).toContain("tenant_credit_refund_requests_idempotency_idx");
    expect(migrationSource).toContain("tenant_credit_refund_requests_active_order_idx");
    expect(migrationSource).toContain("billing.recharge.refund.request");
    expect(migrationSource).toContain("platform.billing.recharge_refund.read");
    expect(migrationSource).toContain("platform.billing.recharge_refund.review");
    expect(migrationSource).toContain("'pending_review'::text");
    expect(migrationSource).not.toContain("billing_confirm_wechat_refund");
    expect(migrationSource).not.toContain("wechat_payment_refunds");
  });

  test("confirms tenant credit recharge refunds with reverse ledger RPC", () => {
    const migrationSource = readTenantCreditRefundConfirmationMigration();

    expect(migrationSource).toContain("CREATE OR REPLACE FUNCTION public.billing_confirm_wechat_recharge_refund");
    expect(migrationSource).toContain("tenant_credit_refund_requests_out_refund_no_unique_idx");
    expect(migrationSource).toContain("FOR UPDATE");
    expect(migrationSource).toContain("available_credits");
    expect(migrationSource).toContain("'wechat_recharge_refund'");
    expect(migrationSource).toContain("'tenant_credit_refund_request'");
    expect(migrationSource).toContain("direction");
    expect(migrationSource).toContain("'out'");
    expect(migrationSource).toContain("status = 'refunded'");
    expect(migrationSource).toContain("refund_status = 'refunded'");
    expect(migrationSource).toContain("BILLING_RECHARGE_REFUND_CREDITS_CONSUMED");
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

function readWechatPayApplymentMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260701210000_wechat_pay_applyments.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readWechatPayApplymentBankAccountMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260702110000_wechat_pay_applyment_bank_account_fields.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readPlatformWechatRechargeMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260702150000_platform_wechat_recharge_credit.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readPlatformWechatRechargePaymentConfigFkMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260703123000_fix_tenant_credit_order_platform_payment_fk.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readPlatformPaymentConfigMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260702161000_platform_payment_configs.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readPlatformPaymentProfilesMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260703153000_platform_wechat_pay_profiles.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readPlatformCreditRechargeProductsMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260702170000_platform_credit_recharge_products.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readTenantCreditRefundRequestsMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260715103000_create_tenant_credit_refund_requests.sql",
      import.meta.url,
    ),
    "utf8",
  );
}

function readTenantCreditRefundConfirmationMigration() {
  return readFileSync(
    new URL(
      "../../../../supabase/migrations/20260715120000_confirm_tenant_credit_recharge_refunds.sql",
      import.meta.url,
    ),
    "utf8",
  );
}
