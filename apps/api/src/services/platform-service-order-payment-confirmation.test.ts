import { describe, expect, mock, test } from "bun:test";
import type { OrderRecord } from "@/repositories/platform-service-order-records";
import type { WechatPayValidatedSuccessTransaction } from "@/services/wechat-pay-transaction-contract";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const order = {
  id: "00000000-0000-4000-8000-000000000301",
  tenant_id: "00000000-0000-4000-8000-000000000011",
  order_no: "TSO202608030001",
  out_trade_no: "TSO202608030001",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  payment_status: "pending",
  service_status: "waiting_payment",
  prepay_id: "prepay-1",
  payment_expires_at: "2026-08-03T12:05:00.000Z",
  paid_at: null,
  closed_at: null,
  terms_version: 1,
  version: 1,
  created_at: "2026-08-03T12:00:00.000Z",
  updated_at: "2026-08-03T12:00:00.000Z",
} satisfies OrderRecord;

const transaction = {
  appid: "wx-platform",
  merchantMode: "direct_merchant",
  merchantId: "1900000001",
  subMerchantId: null,
  outTradeNo: "TSO202608030001",
  transactionId: "4200000000202608030000000001",
  tradeState: "SUCCESS",
  successTime: "2026-08-03T12:01:00+08:00",
  amountFen: 980000,
  currency: "CNY",
  requestId: null,
} satisfies WechatPayValidatedSuccessTransaction;

describe("PlatformServiceOrderPaymentConfirmation", () => {
  test("confirms payment through the platform service RPC adapter", async () => {
    const confirmPayment = mock(async (_input: unknown) => ({
      order: { id: order.id, payment_status: "paid" },
      work_order: { id: "work-order-1" },
      idempotent: false,
    }));
    const { PlatformServiceOrderPaymentConfirmation } = await import(
      "./platform-service-order-payment-confirmation"
    );
    const service = new PlatformServiceOrderPaymentConfirmation({
      repository: { confirmPayment },
    });

    const result = await service.confirm({
      order,
      transaction,
      notificationId: "notification-1",
      source: "wechat_callback",
    });

    expect(confirmPayment).toHaveBeenCalledWith({
      orderId: order.id,
      transactionId: transaction.transactionId,
      paidAmountFen: 980000,
      paidAt: transaction.successTime,
      notificationId: "notification-1",
      metadata: {
        confirmation_source: "wechat_callback",
        out_trade_no: "TSO202608030001",
      },
    });
    expect(result).toMatchObject({
      work_order: { id: "work-order-1" },
      idempotent: false,
    });
  });
});
