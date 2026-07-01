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
