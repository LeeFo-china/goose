import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type {
  BrandingAddonCloseResultRecord,
  BrandingAddonExpirationOrderRecord,
} from "@/repositories/branding-addon-order-records";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { BrandingAddonPaymentConfirmationInput } from "@/services/branding-addon-payment-confirmation";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const EMPTY_TELEMETRY = {
  claimed: 0,
  paid: 0,
  closed: 0,
  retried: 0,
  failed: 0,
  release_failed: 0,
};

const paymentConfig = {
  id: "config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "品牌权益商户",
  merchant_id: "1900000001",
  sub_merchant_id: null,
  app_id: "wx-branding-app",
  sub_app_id: null,
  encrypted_config_ref: "secret://branding-addon",
  secret_bundle_revision: "revision-1",
  serial_no: "SERIAL-NO",
  notify_url: "https://api.example.com/wechat/notify",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "valid",
  last_validated_at: null,
  risk_switches: {},
  recharge_guard_version: 7,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-28T08:00:00.000Z",
  updated_at: "2026-07-28T08:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const secretBundle = {
  privateKeyPem: "test-private-key",
  apiV3Key: "test-api-v3-key",
  wechatPayPublicKeyId: null,
  wechatPayPublicKeyPem: null,
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "revision-1",
} satisfies WechatPaySecretBundle;

function makeOrder(
  sequence = 1,
  overrides: Partial<BrandingAddonExpirationOrderRecord> = {},
): BrandingAddonExpirationOrderRecord {
  return {
    id: `order-${sequence}`,
    tenant_id: `tenant-${sequence}`,
    order_no: `BA20260728${sequence}`,
    out_trade_no: `BA-WX-${sequence}`,
    product_code: "custom_support_branding_annual",
    entitlement_code: "custom_support_branding",
    amount_fen: 1,
    term_years: 1,
    status: "pending",
    prepay_id: `prepay-${sequence}`,
    payment_config_id: paymentConfig.id,
    expected_guard_version: 7,
    payment_mchid: paymentConfig.merchant_id!,
    payment_appid: paymentConfig.app_id!,
    payment_expires_at: "2026-07-28T07:59:00.000Z",
    transaction_id: null,
    paid_amount_fen: null,
    paid_at: null,
    entitlement_event_id: null,
    close_claim_token: `claim-${sequence}`,
    close_claim_expires_at: "2026-07-28T08:01:00.000Z",
    close_attempt_count: 1,
    close_last_error: null,
    created_at: "2026-07-28T07:55:00.000Z",
    updated_at: "2026-07-28T08:00:00.000Z",
    ...overrides,
  };
}

function successQuery(order: BrandingAddonExpirationOrderRecord) {
  return {
    mchid: order.payment_mchid,
    out_trade_no: order.out_trade_no,
    transaction_id: `4200000000-${order.id}`,
    trade_state: "SUCCESS",
    success_time: "2026-07-28T08:00:30+08:00",
    amount: { total: order.amount_fen, currency: "CNY" },
    requestId: "wechat-request-id",
  };
}

function closedResult(
  order: BrandingAddonExpirationOrderRecord,
): BrandingAddonCloseResultRecord {
  return {
    id: order.id,
    tenant_id: order.tenant_id,
    order_no: order.order_no,
    out_trade_no: order.out_trade_no,
    product_code: order.product_code,
    status: "closed",
    prepay_id: order.prepay_id,
    payment_expires_at: order.payment_expires_at,
    closed_at: "2026-07-28T08:00:00.000Z",
    close_claim_token: null,
    close_claim_expires_at: null,
    close_attempt_count: order.close_attempt_count,
    close_last_error: null,
    updated_at: "2026-07-28T08:00:00.000Z",
  };
}

async function createHarness(orders: BrandingAddonExpirationOrderRecord[]) {
  const claimQueue = [...orders];
  const calls: string[] = [];
  const claimExpiredOrders = mock(async (input: {
    batchSize: number;
    leaseSeconds: number;
    excludedOrderIds: string[];
  }) => {
    const order = claimQueue.shift();
    calls.push(`claim:${order?.id ?? "empty"}:${input.excludedOrderIds.length}`);
    return order ? [order] : [];
  });
  const renewCloseClaim = mock(async (input: {
    orderId: string;
    claimToken: string;
    leaseSeconds: number;
  }) => {
    calls.push(`renew:${input.orderId}:${input.claimToken}`);
    return orders.find((order) =>
      order.id === input.orderId &&
      order.close_claim_token === input.claimToken
    ) ?? null;
  });
  const markOrderClosed = mock(async (input: {
    orderId: string;
    claimToken: string;
    closedAt: Date;
  }) => {
    calls.push(`mark:${input.orderId}:${input.claimToken}`);
    const order = orders.find((candidate) => candidate.id === input.orderId);
    return order ? closedResult(order) : null;
  });
  const releaseCloseClaim = mock(async (input: {
    orderId: string;
    claimToken: string;
    errorMessage: string | null;
  }) => {
    calls.push(`release:${input.orderId}:${input.errorMessage}`);
    return null;
  });
  const findWechatPayConfigById = mock(async () => paymentConfig);
  const load = mock(async () => secretBundle);
  const queryResponse = mock(async (order: BrandingAddonExpirationOrderRecord) => ({
    trade_state: "CLOSED",
  }));
  const closeResponse = mock(async (_order: BrandingAddonExpirationOrderRecord) =>
    undefined
  );
  const queryTransactionByOutTradeNo = mock(async (input: {
    outTradeNo: string;
  }) => {
    const order = orders.find((candidate) =>
      candidate.out_trade_no === input.outTradeNo
    );
    if (!order) throw new Error("test order missing");
    calls.push(`query:${order.id}`);
    const state = await queryResponse(order);
    return {
      mchid: order.payment_mchid,
      out_trade_no: order.out_trade_no,
      requestId: "wechat-request-id",
      ...state,
    };
  });
  const closeTransactionByOutTradeNo = mock(async (input: {
    outTradeNo: string;
  }) => {
    const order = orders.find((candidate) =>
      candidate.out_trade_no === input.outTradeNo
    );
    if (!order) throw new Error("test order missing");
    calls.push(`close:${order.id}`);
    return closeResponse(order);
  });
  const confirm = mock(async (input: BrandingAddonPaymentConfirmationInput) => {
    calls.push(`confirm:${input.order.id}`);
    return {};
  });
  const { BrandingAddonExpirationService } = await import(
    "./branding-addon-expiration"
  );
  const service = new BrandingAddonExpirationService({
    repository: {
      claimExpiredOrders,
      renewCloseClaim,
      markOrderClosed,
      releaseCloseClaim,
    },
    paymentConfigRepository: { findWechatPayConfigById },
    secretBundleService: { load },
    wechatPayGateway: {
      queryTransactionByOutTradeNo,
      closeTransactionByOutTradeNo,
    },
    paymentConfirmation: { confirm },
    nowFactory: () => new Date("2026-07-28T08:00:00.000Z"),
    leaseSeconds: 60,
  });
  return {
    service,
    calls,
    repository: {
      claimExpiredOrders,
      renewCloseClaim,
      markOrderClosed,
      releaseCloseClaim,
    },
    paymentConfigRepository: { findWechatPayConfigById },
    secretBundleService: { load },
    wechatPayGateway: {
      queryTransactionByOutTradeNo,
      closeTransactionByOutTradeNo,
    },
    paymentConfirmation: { confirm },
    queryResponse,
    closeResponse,
  };
}

describe("BrandingAddonExpirationService", () => {
  test("renews the exact claim before querying and atomically confirms SUCCESS", async () => {
    const order = makeOrder();
    const harness = await createHarness([order]);
    harness.queryResponse.mockImplementationOnce(async () => successQuery(order));

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.calls).toEqual([
      "claim:order-1:0",
      "renew:order-1:claim-1",
      "query:order-1",
      "confirm:order-1",
    ]);
    expect(harness.paymentConfirmation.confirm).toHaveBeenCalledWith({
      order,
      transaction: expect.objectContaining({
        appid: order.payment_appid,
        tradeState: "SUCCESS",
      }),
      notificationId: null,
      source: "expiration_reconcile",
    });
    expect(result).toEqual({ ...EMPTY_TELEMETRY, claimed: 1, paid: 1 });
  });

  test("mirrors CLOSED only through the exact pending claim", async () => {
    const order = makeOrder();
    const harness = await createHarness([order]);

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.repository.markOrderClosed).toHaveBeenCalledWith({
      orderId: order.id,
      claimToken: order.close_claim_token,
      closedAt: new Date("2026-07-28T08:00:00.000Z"),
    });
    expect(harness.wechatPayGateway.closeTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(result.closed).toBe(1);
  });

  test.each(["SUCCESS", "CLOSED", "NOTPAY"] as const)(
    "re-queries after an accepted close and safely handles %s",
    async (secondState) => {
      const order = makeOrder();
      const harness = await createHarness([order]);
      harness.queryResponse
        .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }))
        .mockImplementationOnce(async () =>
          secondState === "SUCCESS"
            ? successQuery(order)
            : { trade_state: secondState }
        );

      const result = await harness.service.runExpiredOrderChecks({
        batchSize: 1,
      });

      expect(harness.calls.slice(0, 6)).toEqual([
        "claim:order-1:0",
        "renew:order-1:claim-1",
        "query:order-1",
        "renew:order-1:claim-1",
        "close:order-1",
        "query:order-1",
      ]);
      expect(result[secondState === "SUCCESS" ? "paid" : "closed"]).toBe(1);
    },
  );

  test("does not close remotely after losing the second claim renewal", async () => {
    const order = makeOrder();
    const harness = await createHarness([order]);
    harness.queryResponse.mockImplementationOnce(async () => ({
      trade_state: "NOTPAY",
    }));
    harness.repository.renewCloseClaim
      .mockImplementationOnce(async () => order)
      .mockImplementationOnce(async () => null);

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.repository.renewCloseClaim).toHaveBeenCalledTimes(2);
    expect(harness.wechatPayGateway.closeTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(result).toMatchObject({ claimed: 1, retried: 1, closed: 0 });
  });

  test.each(["SUCCESS", "CLOSED", "NOTPAY"] as const)(
    "re-queries after a failed close without hiding a concurrent %s",
    async (secondState) => {
      const order = makeOrder();
      const harness = await createHarness([order]);
      harness.queryResponse
        .mockImplementationOnce(async () => ({ trade_state: "NOTPAY" }))
        .mockImplementationOnce(async () =>
          secondState === "SUCCESS"
            ? successQuery(order)
            : { trade_state: secondState }
        );
      harness.closeResponse.mockImplementationOnce(async () => {
        throw new Error("close transport failed");
      });

      const result = await harness.service.runExpiredOrderChecks({
        batchSize: 1,
      });

      if (secondState === "SUCCESS") expect(result.paid).toBe(1);
      if (secondState === "CLOSED") expect(result.closed).toBe(1);
      if (secondState === "NOTPAY") {
        expect(result.retried).toBe(1);
        expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith({
          orderId: order.id,
          claimToken: order.close_claim_token,
          errorMessage: "BRANDING_ADDON_EXPIRE_CLOSE_UNCERTAIN",
        });
      }
    },
  );

  test.each([
    [null, true],
    ["prepay-1", false],
  ] as const)(
    "handles ORDER_NOT_EXIST with prepay_id=%s conservatively",
    async (prepayId, shouldClose) => {
      const order = makeOrder(1, { prepay_id: prepayId });
      const harness = await createHarness([order]);
      harness.queryResponse.mockImplementationOnce(async () => {
        throw Errors.business(
          502,
          "微信支付查单失败",
          "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
          { status: 404, code: "ORDER_NOT_EXIST" },
        );
      });

      const result = await harness.service.runExpiredOrderChecks({
        batchSize: 1,
      });

      expect(result[shouldClose ? "closed" : "failed"]).toBe(1);
      expect(harness.repository.markOrderClosed).toHaveBeenCalledTimes(
        shouldClose ? 1 : 0,
      );
      if (!shouldClose) {
        expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith({
          orderId: order.id,
          claimToken: order.close_claim_token,
          errorMessage: "BRANDING_ADDON_EXPIRE_QUERY_FAILED",
        });
      }
    },
  );

  test("binds stored config, guard, merchant, appid and secret revision", async () => {
    const order = makeOrder(1, { expected_guard_version: 8 });
    const harness = await createHarness([order]);

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.wechatPayGateway.queryTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith({
      orderId: order.id,
      claimToken: order.close_claim_token,
      errorMessage: "BRANDING_ADDON_EXPIRE_PAYMENT_CONTEXT_FAILED",
    });
    expect(result).toEqual({ ...EMPTY_TELEMETRY, claimed: 1, failed: 1 });

    const secretHarness = await createHarness([makeOrder()]);
    secretHarness.secretBundleService.load.mockImplementationOnce(async () => ({
      ...secretBundle,
      revision: "unexpected-revision",
    }));
    const secretResult = await secretHarness.service.runExpiredOrderChecks({
      batchSize: 1,
    });
    expect(secretHarness.wechatPayGateway.queryTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(secretResult).toMatchObject({ claimed: 1, failed: 1 });
  });

  test("isolates one query failure, bounds its diagnostic and continues", async () => {
    const first = makeOrder();
    const second = makeOrder(2);
    const harness = await createHarness([first, second]);
    harness.queryResponse.mockImplementation(async (order) => {
      if (order.id === first.id) throw new Error("private network detail");
      return { trade_state: "CLOSED" };
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 3 });

    expect(harness.calls).toContain("mark:order-2:claim-2");
    expect(harness.calls.at(-1)).toBe(
      "release:order-1:BRANDING_ADDON_EXPIRE_QUERY_FAILED",
    );
    expect(JSON.stringify(result)).not.toContain("private network detail");
    expect(result).toEqual({
      ...EMPTY_TELEMETRY,
      claimed: 2,
      closed: 1,
      failed: 1,
    });
  });

  test("caps claims at 100 and sends bounded exclusions to the database clock RPC", async () => {
    const orders = Array.from({ length: 100 }, (_, index) =>
      makeOrder(index + 1)
    );
    const harness = await createHarness(orders);

    const result = await harness.service.runExpiredOrderChecks({
      batchSize: 500,
    });

    expect(harness.repository.claimExpiredOrders).toHaveBeenCalledTimes(100);
    expect(harness.repository.claimExpiredOrders.mock.calls.every(
      ([input]) =>
        input.batchSize === 1 &&
        input.leaseSeconds === 60 &&
        input.excludedOrderIds.length <= 99,
    )).toBe(true);
    expect(result).toMatchObject({ claimed: 100, closed: 100 });
  });

  test("reports a safe release failure without exposing repository errors", async () => {
    const order = makeOrder();
    const harness = await createHarness([order]);
    harness.queryResponse.mockImplementationOnce(async () => ({
      trade_state: "USERPAYING",
    }));
    harness.repository.releaseCloseClaim.mockImplementationOnce(async () => {
      throw new Error("postgres://user:secret@private-host/db");
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(result).toMatchObject({
      retried: 1,
      release_failed: 1,
      release_failures: [{
        order_id: order.id,
        diagnostic: "BRANDING_ADDON_EXPIRE_TRADE_STATE_RETRY",
        error_code: "BRANDING_ADDON_EXPIRE_RELEASE_FAILED",
        error_message: "释放品牌权益订单关单租约失败",
      }],
    });
    expect(JSON.stringify(result)).not.toContain("private-host");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
