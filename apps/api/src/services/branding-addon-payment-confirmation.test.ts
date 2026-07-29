import { describe, expect, mock, test } from "bun:test";

import type {
  BrandingAddonCallbackOrderRecord,
  BrandingConfirmPurchaseResult,
} from "@/repositories/branding-addon-orders";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const order = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "BA202607280001",
  out_trade_no: "BA202607280001",
  product_code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  amount_fen: 1,
  term_years: 1,
  status: "pending",
  payment_config_id: "config-1",
  payment_mchid: "1900000001",
  payment_appid: "wx-branding-app",
  payment_expires_at: "2026-07-28T08:05:00.000Z",
  transaction_id: null,
  paid_amount_fen: null,
  paid_at: null,
  entitlement_event_id: null,
  created_at: "2026-07-28T08:00:00.000Z",
  updated_at: "2026-07-28T08:00:00.000Z",
} satisfies BrandingAddonCallbackOrderRecord;

const successfulResource = {
  appid: order.payment_appid,
  mchid: order.payment_mchid,
  out_trade_no: order.out_trade_no,
  transaction_id: "4200000000202607280000000001",
  trade_state: "SUCCESS",
  success_time: "2026-07-28T08:01:00+08:00",
  amount: { total: 1, currency: "CNY" },
};

describe("BrandingAddonPaymentConfirmation", () => {
  test("sends every validated callback binding to the atomic RPC repository", async () => {
    const {
      BrandingAddonPaymentConfirmation,
      parseAndAssertBrandingAddonCallback,
    } = await import("@/services/branding-addon-payment-confirmation");
    const result: BrandingConfirmPurchaseResult = {
      idempotent: false,
      order: null,
      entitlement: null,
      event: null,
      source_type: "purchase",
    };
    const confirmPurchase = mock(async () => result);
    const confirmation = new BrandingAddonPaymentConfirmation({
      confirmPurchase,
    });
    const transaction = parseAndAssertBrandingAddonCallback(
      "TRANSACTION.SUCCESS",
      successfulResource,
      order,
    );

    await confirmation.confirm({
      order,
      transaction,
      notificationId: "notification-1",
      source: "wechat_callback",
    });

    expect(confirmPurchase).toHaveBeenCalledWith({
      orderId: order.id,
      outTradeNo: order.out_trade_no,
      transactionId: successfulResource.transaction_id,
      paidAmountFen: order.amount_fen,
      paidAt: successfulResource.success_time,
      mchid: order.payment_mchid,
      appid: order.payment_appid,
      notificationId: "notification-1",
      metadata: {
        confirmation_source: "wechat_callback",
        out_trade_no: order.out_trade_no,
      },
    });
  });
});
