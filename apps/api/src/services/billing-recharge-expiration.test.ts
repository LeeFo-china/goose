import { describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const NOW = new Date("2026-07-18T03:00:00.000Z");
const config = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台充值商户",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wx-app",
  sub_app_id: null,
  encrypted_config_ref: "secret://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  serial_no: "SERIALNO",
  notify_url: "https://api.example.com/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;
const secretBundle = {
  privateKeyPem: "test-private-key",
  apiV3Key: "test-api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

describe("BillingRechargeExpirationService", () => {
  test("claims one bounded page with one clock read and skips config for an empty page", async () => {
    const harness = await createHarness([]);

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 101 });

    expect(harness.nowFactory).toHaveBeenCalledTimes(1);
    expect(harness.repository.claimExpiredOrders).toHaveBeenCalledWith({
      now: NOW,
      batchSize: 100,
      leaseSeconds: 10,
    });
    expect(harness.paymentConfigRepository.findWechatPayConfig).not
      .toHaveBeenCalled();
    expect(harness.secretBundleService.load).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimed: 0,
      paid: 0,
      closed: 0,
      retried: 0,
      failed: 0,
    });
  });

  test("confirms SUCCESS without closing and releases the claim afterward", async () => {
    const order = makeOrder();
    const transaction = successTransaction(order);
    const harness = await createHarness([order]);
    harness.queryTransaction
      .mockImplementationOnce(async () => transaction);

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.calls).toEqual(["query:order-1", "confirm:order-1", "release:order-1:null"]);
    expect(harness.wechatPayGateway.closeTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(harness.paymentConfirmation.confirm).toHaveBeenCalledWith({
      order,
      transaction,
      notificationId: null,
      source: "expiration_reconcile",
    });
    expect(result).toEqual({ claimed: 1, paid: 1, closed: 0, retried: 0, failed: 0 });
  });

  test("mirrors CLOSED locally without calling close again", async () => {
    const harness = await createHarness([makeOrder()]);
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "CLOSED" }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.calls).toEqual(["query:order-1", "mark:order-1"]);
    expect(harness.wechatPayGateway.closeTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(result.closed).toBe(1);
  });

  test("closes NOTPAY remotely before conditionally closing it locally", async () => {
    const harness = await createHarness([makeOrder()]);
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.calls).toEqual([
      "query:order-1",
      "close:order-1",
      "mark:order-1",
    ]);
    expect(result.closed).toBe(1);
  });

  test("releases USERPAYING for retry without remote or local close", async () => {
    const harness = await createHarness([makeOrder()]);
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "USERPAYING" }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.calls).toEqual([
      "query:order-1",
      "release:order-1:BILLING_RECHARGE_EXPIRE_TRADE_STATE_RETRY",
    ]);
    expect(harness.wechatPayGateway.closeTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(harness.repository.markOrderClosed).not.toHaveBeenCalled();
    expect(result.retried).toBe(1);
  });

  test("releases a first-query failure and continues with later orders", async () => {
    const harness = await createHarness([makeOrder(), makeOrder(2)]);
    harness.queryTransaction
      .mockImplementationOnce(async () => {
        throw new Error("internal host and credential detail");
      })
      .mockImplementationOnce(async () => ({ trade_state: "CLOSED" }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.calls).toEqual([
      "query:order-1",
      "release:order-1:BILLING_RECHARGE_EXPIRE_QUERY_FAILED",
      "query:order-2",
      "mark:order-2",
    ]);
    expect(result).toEqual({ claimed: 2, paid: 0, closed: 1, retried: 0, failed: 1 });
  });

  test("re-queries once after close failure and confirms SUCCESS", async () => {
    const order = makeOrder();
    const transaction = successTransaction(order);
    const harness = await createHarness([order]);
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }))
      .mockImplementationOnce(async () => transaction);
    harness.closeTransaction
      .mockImplementationOnce(async () => {
        throw new Error("close timeout");
      });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.calls).toEqual([
      "query:order-1",
      "close:order-1",
      "query:order-1",
      "confirm:order-1",
      "release:order-1:null",
    ]);
    expect(harness.repository.markOrderClosed).not.toHaveBeenCalled();
    expect(result.paid).toBe(1);
  });

  test("re-queries once after close failure and mirrors CLOSED", async () => {
    const harness = await createHarness([makeOrder()]);
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }))
      .mockImplementationOnce(async () => ({ trade_state: "CLOSED" }));
    harness.closeTransaction
      .mockImplementationOnce(async () => {
        throw new Error("close timeout");
      });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.calls).toEqual([
      "query:order-1",
      "close:order-1",
      "query:order-1",
      "mark:order-1",
    ]);
    expect(result.closed).toBe(1);
  });

  test("does not close locally when the second query remains NOTPAY", async () => {
    const harness = await createHarness([makeOrder()]);
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }))
      .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }));
    harness.closeTransaction
      .mockImplementationOnce(async () => {
        throw new Error("close timeout");
      });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.repository.markOrderClosed).not.toHaveBeenCalled();
    expect(harness.calls.at(-1)).toBe(
      "release:order-1:BILLING_RECHARGE_EXPIRE_CLOSE_UNCERTAIN",
    );
    expect(result.retried).toBe(1);
  });

  test("releases a claim as failed when the second query also fails", async () => {
    const harness = await createHarness([makeOrder()]);
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }))
      .mockImplementationOnce(async () => {
        throw new Error("second query failed");
      });
    harness.closeTransaction
      .mockImplementationOnce(async () => {
        throw new Error("close timeout");
      });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.calls.at(-1)).toBe(
      "release:order-1:BILLING_RECHARGE_EXPIRE_SECOND_QUERY_FAILED",
    );
    expect(result.failed).toBe(1);
  });

  test("releases every valid claim if loading batch config or secret fails", async () => {
    for (const failure of ["config", "secret"] as const) {
      const harness = await createHarness([makeOrder(), makeOrder(2)]);
      if (failure === "config") {
        harness.paymentConfigRepository.findWechatPayConfig
          .mockImplementationOnce(async () => {
            throw new Error("database host secret");
          });
      } else {
        harness.secretBundleService.load.mockImplementationOnce(async () => {
          throw new Error("private key secret");
        });
      }

      const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

      expect(harness.repository.releaseCloseClaim).toHaveBeenCalledTimes(2);
      expect(harness.repository.releaseCloseClaim).toHaveBeenNthCalledWith(1, {
        orderId: "order-1",
        claimToken: "claim-1",
        errorMessage: "BILLING_RECHARGE_EXPIRE_BATCH_CONFIG_FAILED",
      });
      expect(harness.wechatPayGateway.queryTransactionByOutTradeNo).not
        .toHaveBeenCalled();
      expect(result.failed).toBe(2);
    }
  });

  test("rejects a batch config that is not enabled for tenant recharge", async () => {
    const harness = await createHarness([makeOrder()]);
    harness.paymentConfigRepository.findWechatPayConfig
      .mockImplementationOnce(async () => ({
        ...config,
        enabled_channels: ["project_payment"],
      }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.secretBundleService.load).not.toHaveBeenCalled();
    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith({
      orderId: "order-1",
      claimToken: "claim-1",
      errorMessage: "BILLING_RECHARGE_EXPIRE_BATCH_CONFIG_FAILED",
    });
    expect(result).toEqual({ claimed: 1, paid: 0, closed: 0, retried: 0, failed: 1 });
  });

  test("attempts every batch release when one release fails", async () => {
    const harness = await createHarness([makeOrder(), makeOrder(2)]);
    harness.paymentConfigRepository.findWechatPayConfig
      .mockImplementationOnce(async () => {
        throw new Error("config unavailable");
      });
    harness.repository.releaseCloseClaim.mockImplementationOnce(async () => {
      throw new Error("database unavailable");
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(2);
  });

  test("validates claims and config matching without stopping later orders", async () => {
    const noToken = makeOrder(1, { close_claim_token: " " });
    const noTradeNo = makeOrder(2, { out_trade_no: " " });
    const mismatch = makeOrder(3, { payment_config_id: "old-config" });
    const valid = makeOrder(4);
    const harness = await createHarness([noToken, noTradeNo, mismatch, valid]);
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "CLOSED" }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith({
      orderId: "order-2",
      claimToken: "claim-2",
      errorMessage: "BILLING_RECHARGE_EXPIRE_OUT_TRADE_NO_REQUIRED",
    });
    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith({
      orderId: "order-3",
      claimToken: "claim-3",
      errorMessage: "BILLING_RECHARGE_EXPIRE_PAYMENT_CONFIG_MISMATCH",
    });
    expect(harness.calls.at(-2)).toBe("query:order-4");
    expect(harness.calls.at(-1)).toBe("mark:order-4");
    expect(result).toEqual({ claimed: 4, paid: 0, closed: 1, retried: 0, failed: 3 });
  });

  test("does not count a conditional close race as closed", async () => {
    const harness = await createHarness([makeOrder()]);
    harness.queryTransaction
      .mockImplementationOnce(async () => ({ trade_state: "CLOSED" }));
    harness.repository.markOrderClosed.mockImplementationOnce(async (input) => {
      harness.calls.push(`mark:${input.orderId}`);
      return null;
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(result).toEqual({ claimed: 1, paid: 0, closed: 0, retried: 1, failed: 0 });
  });

  test("processes at most 100 claimed fixtures sequentially without another claim", async () => {
    const orders = Array.from({ length: 100 }, (_, index) => makeOrder(index + 1));
    const harness = await createHarness(orders);
    harness.queryTransaction
      .mockImplementation(async () => ({ trade_state: "CLOSED" }));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 101 });

    expect(harness.repository.claimExpiredOrders).toHaveBeenCalledTimes(1);
    expect(harness.paymentConfigRepository.findWechatPayConfig)
      .toHaveBeenCalledTimes(1);
    expect(harness.secretBundleService.load).toHaveBeenCalledTimes(1);
    expect(harness.wechatPayGateway.queryTransactionByOutTradeNo)
      .toHaveBeenCalledTimes(100);
    expect(harness.repository.markOrderClosed).toHaveBeenCalledTimes(100);
    expect(harness.calls).toEqual(orders.flatMap((order) => [
      `query:${order.id}`,
      `mark:${order.id}`,
    ]));
    expect(result).toEqual({ claimed: 100, paid: 0, closed: 100, retried: 0, failed: 0 });
  });
});

async function createHarness(orders: TenantCreditOrderRecord[]) {
  const calls: string[] = [];
  const repository = {
    claimExpiredOrders: mock(async () => orders),
    markOrderClosed: mock(async (input: { orderId: string }) => {
      calls.push(`mark:${input.orderId}`);
      return orders.find((order) => order.id === input.orderId) ?? null;
    }),
    releaseCloseClaim: mock(async (input: {
      orderId: string;
      errorMessage: string | null;
    }) => {
      calls.push(`release:${input.orderId}:${input.errorMessage}`);
      return null;
    }),
  };
  const paymentConfigRepository = {
    findWechatPayConfig: mock(async () => config),
  };
  const secretBundleService = { load: mock(async () => secretBundle) };
  const queryTransaction = mock(async (_input: { outTradeNo: string }) => ({
    trade_state: "CLOSED",
  }));
  const closeTransaction = mock(async (_input: { outTradeNo: string }) =>
    undefined);
  const wechatPayGateway = {
    queryTransactionByOutTradeNo: mock(async (input: { outTradeNo: string }) => {
      calls.push(`query:${orderIdFromTradeNo(input.outTradeNo)}`);
      return queryTransaction(input);
    }),
    closeTransactionByOutTradeNo: mock(async (input: { outTradeNo: string }) => {
      calls.push(`close:${orderIdFromTradeNo(input.outTradeNo)}`);
      return closeTransaction(input);
    }),
  };
  const paymentConfirmation = {
    confirm: mock(async (input: { order: TenantCreditOrderRecord }) => {
      calls.push(`confirm:${input.order.id}`);
      return {};
    }),
  };
  const nowFactory = mock(() => NOW);
  const { BillingRechargeExpirationService } = await import(
    "./billing-recharge-expiration"
  );
  const service = new BillingRechargeExpirationService({
    repository,
    paymentConfigRepository,
    secretBundleService,
    wechatPayGateway,
    paymentConfirmation,
    nowFactory,
    leaseSeconds: 5,
  });
  return {
    service,
    calls,
    repository,
    paymentConfigRepository,
    secretBundleService,
    wechatPayGateway,
    queryTransaction,
    closeTransaction,
    paymentConfirmation,
    nowFactory,
  };
}

function makeOrder(
  sequence = 1,
  overrides: Partial<TenantCreditOrderRecord> = {},
): TenantCreditOrderRecord {
  return {
    id: `order-${sequence}`,
    tenant_id: `tenant-${sequence}`,
    order_no: `R20260718${sequence}`,
    idempotency_key: null,
    package_code: "credits-100",
    credits: 100,
    amount_fen: 100,
    bonus_credits: 0,
    channel: "wechat_pay",
    status: "pending",
    paid_at: null,
    created_by: null,
    remark: null,
    metadata: {},
    payment_config_id: config.id,
    out_trade_no: `WX${sequence}`,
    prepay_id: `prepay-${sequence}`,
    payment_expires_at: "2026-07-18T02:59:00.000Z",
    transaction_id: null,
    paid_amount_fen: 0,
    closed_at: null,
    latest_notification_id: null,
    close_claim_token: `claim-${sequence}`,
    close_claim_expires_at: "2026-07-18T03:01:00.000Z",
    close_attempt_count: 1,
    close_last_error: null,
    created_at: "2026-07-18T02:55:00.000Z",
    updated_at: "2026-07-18T03:00:00.000Z",
    ...overrides,
  };
}

function successTransaction(order: TenantCreditOrderRecord) {
  return {
    out_trade_no: order.out_trade_no,
    transaction_id: `transaction-${order.id}`,
    trade_state: "SUCCESS",
    success_time: "2026-07-18T02:58:00.000Z",
    amount: { total: order.amount_fen, currency: "CNY" },
  };
}

function orderIdFromTradeNo(outTradeNo: string) {
  return `order-${outTradeNo.replace("WX", "")}`;
}
