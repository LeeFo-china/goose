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
  source_trial_id: "00000000-0000-4000-8000-000000000501",
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
      order: {
        id: order.id,
        tenant_id: order.tenant_id,
        payment_status: "paid",
        transaction_id: transaction.transactionId,
        source_trial_id: order.source_trial_id,
      },
      work_order: { id: "work-order-1" },
      access_mode: "paid_onboarding" as const,
      conversion_anomaly: null,
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
      access_mode: "paid_onboarding",
      idempotent: false,
      conversion_anomaly: null,
    });
  });

  test("preserves payment success while exposing a bound attribution anomaly", async () => {
    const anomaly = {
      code: "TRIAL_ALREADY_ATTRIBUTED" as const,
      trial_id: order.source_trial_id,
      order_id: order.id,
      attributed_order_id: "00000000-0000-4000-8000-000000000302",
    };
    const confirmPayment = mock(async () => ({
      order: {
        id: order.id,
        tenant_id: order.tenant_id,
        payment_status: "paid",
        transaction_id: transaction.transactionId,
        source_trial_id: order.source_trial_id,
      },
      work_order: { id: "work-order-1" },
      access_mode: "paid_onboarding" as const,
      conversion_anomaly: anomaly,
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
      notificationId: "notification-2",
      source: "wechat_callback",
    });

    expect(result).toMatchObject({
      order: { payment_status: "paid" },
      conversion_anomaly: anomaly,
    });
  });

  test.each([
    {
      name: "source mismatch",
      patch: { source_trial_id: "00000000-0000-4000-8000-000000000599" },
    },
    {
      name: "transaction mismatch",
      patch: { transaction_id: "other-transaction" },
    },
    {
      name: "anomaly binding mismatch",
      patch: {
        conversion_anomaly: {
          code: "TRIAL_ALREADY_ATTRIBUTED",
          trial_id: order.source_trial_id,
          order_id: "00000000-0000-4000-8000-000000000399",
          attributed_order_id: "00000000-0000-4000-8000-000000000302",
        },
      },
    },
  ])("rejects malformed atomic trial conversion facts: $name", async ({ patch }) => {
    const rpcResult = {
      order: {
        id: order.id,
        tenant_id: order.tenant_id,
        payment_status: "paid",
        transaction_id: transaction.transactionId,
        source_trial_id: order.source_trial_id,
      },
      work_order: { id: "work-order-1" },
      access_mode: "paid_onboarding" as const,
      conversion_anomaly: null,
      idempotent: false,
      ...patch,
    };
    if ("source_trial_id" in patch || "transaction_id" in patch) {
      rpcResult.order = { ...rpcResult.order, ...patch };
      delete (rpcResult as Record<string, unknown>).source_trial_id;
      delete (rpcResult as Record<string, unknown>).transaction_id;
    }
    const { PlatformServiceOrderPaymentConfirmation } = await import(
      "./platform-service-order-payment-confirmation"
    );
    const service = new PlatformServiceOrderPaymentConfirmation({
      repository: { confirmPayment: mock(async () => rpcResult) },
    });

    await expect(service.confirm({
      order,
      transaction,
      notificationId: "notification-3",
      source: "wechat_callback",
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });
});
