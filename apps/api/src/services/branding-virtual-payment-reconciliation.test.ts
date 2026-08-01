import { describe, expect, mock, test } from "bun:test";

import type {
  BrandingVirtualPaymentReconciliationClaim,
} from "@/repositories/branding-virtual-payment-reconciliation";
import type {
  QueryVirtualOrderInput,
  QueryVirtualOrderResult,
} from "@/services/wechat-virtual-payment-gateway-contracts";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ORDER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLAIM_TOKEN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function createClaim(
  patch: Partial<BrandingVirtualPaymentReconciliationClaim> = {},
): BrandingVirtualPaymentReconciliationClaim {
  return {
    id: ORDER_ID,
    tenant_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    out_trade_no: "BV202608010001",
    environment: "production",
    offer_id: "offer-1",
    secret_revision: 1,
    provider_product_id: "branding-annual",
    payer_openid: "payer-openid",
    amount_fen: 100,
    provider_order_no: null,
    transaction_id: null,
    payment_status: "pending",
    fulfillment_status: "pending",
    paid_amount_fen: null,
    paid_at: null,
    payment_expires_at: "2026-08-01T01:05:00.000Z",
    payment_request_issued_at: "2026-08-01T01:00:00.000Z",
    entitlement_event_id: null,
    reconcile_claim_token: CLAIM_TOKEN,
    reconcile_claim_expires_at: "2026-08-01T02:02:00.000Z",
    reconcile_attempt_count: 1,
    reconcile_last_error_code: null,
    reconcile_last_error: null,
    reconcile_next_at: "2026-08-01T02:00:00.000Z",
    reconcile_last_checked_at: null,
    reconcile_last_provider_status: null,
    reconcile_completion_kind: null,
    reconcile_query_provider_order_no: null,
    reconcile_query_transaction_id: null,
    reconcile_query_paid_amount_fen: null,
    reconcile_query_paid_at: null,
    provider_delivery_status: "not_required",
    provider_delivery_attempt_count: 0,
    provider_delivery_attempt_key: null,
    provider_delivery_last_error_code: null,
    provider_delivery_last_error: null,
    provider_delivery_provided_at: null,
    provider_delivery_request_id: null,
    ...patch,
  };
}

function createQueryResult(
  patch: Partial<QueryVirtualOrderResult> = {},
): QueryVirtualOrderResult {
  return {
    requestId: "wechat-request-1",
    environment: "production",
    orderId: "BV202608010001",
    status: 2,
    businessType: 0,
    orderType: 0,
    orderFee: 100,
    couponFee: 0,
    paidFee: 100,
    refundFee: 0,
    leftFee: 100,
    createdAt: 1_785_546_000,
    updatedAt: 1_785_546_060,
    paidAt: 1_785_546_060,
    providedAt: 0,
    wechatOrderId: "wechat-order-1",
    channelOrderId: "independent-channel-order-1",
    wechatPayOrderId: "wechat-pay-order-1",
    settledAt: null,
    settlementState: null,
    platformFeeFen: null,
    cpsFeeFen: null,
    ...patch,
  };
}

function createHarness(claims = [createClaim()]) {
  return {
    repository: {
      claimReconciliationBatch: mock(async () => claims),
      rescheduleReconciliation: mock(async () => true),
      closeUnpaidReconciliation: mock(async () => true),
      prepareSuccessfulQueryReconciliation: mock(async () => true),
      finalizeReconciliationAfterConfirmation: mock(async () => true),
      markReconciliationDelivery: mock(async () => true),
      beginReconciliationDeliveryRetry: mock(async () => true),
    },
    gateway: {
      queryOrder: mock(async (_input: QueryVirtualOrderInput) =>
        createQueryResult()
      ),
      notifyProvideGoods: mock(async () => ({
        accepted: true as const,
        requestId: "provide-request-1",
      })),
    },
    confirmation: {
      confirm: mock(async () => ({
        idempotent: false,
        payment_recorded: true,
        fulfilled: true,
        recoverable: false,
        entitlement_event_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        entitlement_status: "active" as const,
        failure_code: null,
      })),
    },
    accessTokenProvider: { getAccessToken: mock(async () => "access-token") },
    settingsService: {
      getPlatformSecretString: mock(async () => JSON.stringify({
        appKey: "app-key",
        revision: 1,
      })),
    },
  };
}

describe("BrandingVirtualPaymentReconciliationService", () => {
  test("clamps the claim batch and uses a two minute lease", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const dependencies = createHarness([]);
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    await service.reconcile({ batchSize: 500 });

    expect(dependencies.repository.claimReconciliationBatch)
      .toHaveBeenCalledWith({ limit: 100, leaseSeconds: 120 });
  });

  test("accepts an independent channel order id for paid status 2", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const dependencies = createHarness();
    const service = new BrandingVirtualPaymentReconciliationService({
      ...dependencies,
      nowFactory: () => new Date("2026-08-01T02:00:00.000Z"),
      attemptKeyFactory: () => "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    });

    const result = await service.reconcile({ batchSize: 20 });

    expect(dependencies.repository.prepareSuccessfulQueryReconciliation)
      .toHaveBeenCalledTimes(1);
    expect(dependencies.confirmation.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "reconciliation",
        notificationId: null,
        allowLateClosedRecovery: true,
        transaction: expect.objectContaining({
          eventType: "query_order",
          paidAt: expect.any(String),
        }),
      }),
    );
    expect(result).toMatchObject({ claimed: 1, queried: 1, confirmed: 1 });
  });

  test.each([0, 1, 6] as const)(
    "closes an expired issued order for unpaid official status %i",
    async (status) => {
      const { BrandingVirtualPaymentReconciliationService } = await import(
        "./branding-virtual-payment-reconciliation"
      );
      const dependencies = createHarness();
      dependencies.gateway.queryOrder.mockImplementation(async () =>
        createQueryResult({
          requestId: null,
          status,
          paidFee: 0,
          paidAt: 0,
          wechatOrderId: null,
          wechatPayOrderId: null,
        })
      );
      const service = new BrandingVirtualPaymentReconciliationService(dependencies);

      const result = await service.reconcile({ batchSize: 20 });

      expect(dependencies.repository.closeUnpaidReconciliation)
        .toHaveBeenCalledWith({
          orderId: ORDER_ID,
          claimToken: CLAIM_TOKEN,
          officialStatus: status,
        });
      expect(dependencies.confirmation.confirm).not.toHaveBeenCalled();
      expect(result).toMatchObject({ closed: 1, failed: 0 });
    },
  );

  test.each([5, 7, 8, 9, 10] as const)(
    "reschedules abnormal official status %i without granting",
    async (status) => {
      const { BrandingVirtualPaymentReconciliationService } = await import(
        "./branding-virtual-payment-reconciliation"
      );
      const dependencies = createHarness();
      dependencies.gateway.queryOrder.mockImplementation(async () =>
        createQueryResult({ requestId: null, status })
      );
      const service = new BrandingVirtualPaymentReconciliationService({
        ...dependencies,
        nowFactory: () => new Date("2026-08-01T02:00:00.000Z"),
      });

      const result = await service.reconcile({ batchSize: 20 });

      expect(dependencies.repository.rescheduleReconciliation)
        .toHaveBeenCalledWith(expect.objectContaining({ officialStatus: status }));
      expect(dependencies.confirmation.confirm).not.toHaveBeenCalled();
      expect(result).toMatchObject({ failed: 1 });
    },
  );

  test("recovers a persisted grant failure without querying WeChat", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const dependencies = createHarness([createClaim({
      provider_order_no: "wechat-order-1",
      transaction_id: "wechat-pay-order-1",
      payment_status: "succeeded",
      fulfillment_status: "grant_failed",
      paid_amount_fen: 100,
      paid_at: "2026-08-01T01:01:00.000Z",
      reconcile_completion_kind: "grant_recovery",
    })]);
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    const result = await service.reconcile({ batchSize: 20 });

    expect(dependencies.gateway.queryOrder).not.toHaveBeenCalled();
    expect(dependencies.confirmation.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ allowLateClosedRecovery: true }),
    );
    expect(dependencies.repository.finalizeReconciliationAfterConfirmation)
      .toHaveBeenCalledWith(expect.objectContaining({ officialStatus: null }));
    expect(result).toMatchObject({ confirmed: 1, grantRecovered: 1 });
  });

  test("resumes a prepared successful query checkpoint without querying again", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const dependencies = createHarness([createClaim({
      reconcile_last_provider_status: 3,
      reconcile_completion_kind: "query",
      reconcile_query_provider_order_no: "wechat-order-1",
      reconcile_query_transaction_id: "wechat-pay-order-1",
      reconcile_query_paid_amount_fen: 100,
      reconcile_query_paid_at: "2026-08-01T01:01:00.000Z",
    })]);
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    await service.reconcile({ batchSize: 20 });

    expect(dependencies.gateway.queryOrder).not.toHaveBeenCalled();
    expect(dependencies.repository.prepareSuccessfulQueryReconciliation)
      .not.toHaveBeenCalled();
    expect(dependencies.repository.finalizeReconciliationAfterConfirmation)
      .toHaveBeenCalledWith(expect.objectContaining({ officialStatus: 3 }));
    expect(dependencies.gateway.notifyProvideGoods).not.toHaveBeenCalled();
  });

  test("starts a new attempt before retrying a failed delivery", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const dependencies = createHarness([createClaim({
      provider_order_no: "wechat-order-1",
      transaction_id: "wechat-pay-order-1",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      paid_amount_fen: 100,
      paid_at: "2026-08-01T01:01:00.000Z",
      entitlement_event_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      provider_delivery_status: "failed",
      provider_delivery_attempt_count: 1,
      provider_delivery_attempt_key: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    })]);
    const service = new BrandingVirtualPaymentReconciliationService({
      ...dependencies,
      attemptKeyFactory: () => "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    });

    await service.reconcile({ batchSize: 20 });

    expect(dependencies.repository.beginReconciliationDeliveryRetry)
      .toHaveBeenCalledWith({
        orderId: ORDER_ID,
        claimToken: CLAIM_TOKEN,
        attemptKey: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      });
    expect(dependencies.gateway.notifyProvideGoods).toHaveBeenCalledWith(
      expect.objectContaining({ wechatOrderId: "wechat-order-1" }),
    );
  });

  test("rejects mismatched provider facts before prepare or confirmation", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const dependencies = createHarness();
    dependencies.gateway.queryOrder.mockImplementation(async () =>
      createQueryResult({ paidFee: 101 })
    );
    const service = new BrandingVirtualPaymentReconciliationService({
      ...dependencies,
      nowFactory: () => new Date("2026-08-01T02:00:00.000Z"),
    });

    const result = await service.reconcile({ batchSize: 20 });

    expect(dependencies.repository.prepareSuccessfulQueryReconciliation)
      .not.toHaveBeenCalled();
    expect(dependencies.confirmation.confirm).not.toHaveBeenCalled();
    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledWith(expect.objectContaining({ officialStatus: 2 }));
    expect(result).toMatchObject({ failed: 1 });
  });

  test("caches one access token and one secret promise per environment in a batch", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const secondId = "11111111-1111-4111-8111-111111111111";
    const secondTradeNo = "BV202608010002";
    const dependencies = createHarness([
      createClaim(),
      createClaim({ id: secondId, out_trade_no: secondTradeNo }),
    ]);
    dependencies.gateway.queryOrder.mockImplementation(
      async (input: QueryVirtualOrderInput) => createQueryResult({
        orderId: input.orderId ?? "",
        channelOrderId: input.orderId ?? "",
        status: 3,
      }),
    );
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    await service.reconcile({ batchSize: 20 });

    expect(dependencies.accessTokenProvider.getAccessToken)
      .toHaveBeenCalledTimes(1);
    expect(dependencies.settingsService.getPlatformSecretString)
      .toHaveBeenCalledTimes(1);
    expect(dependencies.gateway.queryOrder).toHaveBeenCalledTimes(2);
  });

  test("continues later claims after one transport failure", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const secondId = "11111111-1111-4111-8111-111111111111";
    const secondTradeNo = "BV202608010002";
    const dependencies = createHarness([
      createClaim(),
      createClaim({ id: secondId, out_trade_no: secondTradeNo }),
    ]);
    let callCount = 0;
    dependencies.gateway.queryOrder.mockImplementation(async (input) => {
      callCount += 1;
      if (callCount === 1) throw new TypeError("private transport detail");
      return createQueryResult({
        orderId: input.orderId ?? "",
        channelOrderId: input.orderId ?? "",
        status: 6,
        paidFee: 0,
        paidAt: 0,
        wechatOrderId: null,
        wechatPayOrderId: null,
      });
    });
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    const result = await service.reconcile({ batchSize: 20 });

    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledWith(expect.objectContaining({
        errorSummary: "虚拟支付补偿暂时失败",
      }));
    expect(dependencies.repository.closeUnpaidReconciliation)
      .toHaveBeenCalledWith(expect.objectContaining({ orderId: secondId }));
    expect(result).toMatchObject({ claimed: 2, closed: 1, failed: 1 });
  });

  test("reuses an existing pending delivery attempt without incrementing it", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const attemptKey = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const dependencies = createHarness([createClaim({
      provider_order_no: "wechat-order-1",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      provider_delivery_status: "pending",
      provider_delivery_attempt_count: 1,
      provider_delivery_attempt_key: attemptKey,
    })]);
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    await service.reconcile({ batchSize: 20 });

    expect(dependencies.repository.beginReconciliationDeliveryRetry)
      .not.toHaveBeenCalled();
    expect(dependencies.repository.markReconciliationDelivery)
      .toHaveBeenCalledWith(expect.objectContaining({
        status: "succeeded",
        attemptKey,
      }));
  });

  test("processes at most twenty claims concurrently within the lease budget", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    let releaseGate = (): void => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    let active = 0;
    let peak = 0;
    let started = 0;
    const claims = Array.from({ length: 25 }, (_, index) => createClaim({
      id: `${String(index + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
      out_trade_no: `BV20260801${String(index + 1).padStart(4, "0")}`,
    }));
    const dependencies = createHarness(claims);
    dependencies.gateway.queryOrder.mockImplementation(async (input) => {
      started += 1;
      active += 1;
      peak = Math.max(peak, active);
      await gate;
      active -= 1;
      return createQueryResult({
        orderId: input.orderId ?? "",
        status: 6,
        paidFee: 0,
        paidAt: 0,
        wechatOrderId: null,
        wechatPayOrderId: null,
      });
    });
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    const reconciliation = service.reconcile({ batchSize: 100 });
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
    const startedBeforeRelease = started;
    releaseGate();
    await reconciliation;

    expect(startedBeforeRelease).toBe(20);
    expect(peak).toBe(20);
    expect(dependencies.repository.closeUnpaidReconciliation)
      .toHaveBeenCalledTimes(25);
  });
});
