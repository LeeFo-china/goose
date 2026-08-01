import { describe, expect, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type {
  QueryVirtualOrderInput,
} from "@/services/wechat-virtual-payment-gateway-contracts";
import {
  CLAIM_TOKEN,
  createQueryResult,
  createReconciliationClaim as createClaim,
  createReconciliationHarness as createHarness,
  ORDER_ID,
} from "./branding-virtual-payment-reconciliation.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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

  test("keeps delivery pending when provider success persistence fails", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const attemptKey = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const dependencies = createHarness([createClaim({
      provider_order_no: "wechat-order-1",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      provider_delivery_status: "pending",
      provider_delivery_attempt_key: attemptKey,
    })]);
    dependencies.repository.markReconciliationDelivery.mockRejectedValue(
      Errors.dbError("delivery success persistence failed"),
    );
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    const result = await service.reconcile({ batchSize: 20 });

    expect(dependencies.gateway.notifyProvideGoods).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.markReconciliationDelivery)
      .toHaveBeenCalledTimes(1);
    expect(dependencies.repository.markReconciliationDelivery)
      .toHaveBeenCalledWith(expect.objectContaining({ status: "succeeded" }));
    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ failed: 1 });
  });

  test("reschedules without side effects when less than thirty lease seconds remain", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const dependencies = createHarness([createClaim({
      reconcile_claim_expires_at: "2026-08-01T02:00:29.999Z",
    })]);
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    const result = await service.reconcile({ batchSize: 20 });

    expect(dependencies.gateway.queryOrder).not.toHaveBeenCalled();
    expect(dependencies.gateway.notifyProvideGoods).not.toHaveBeenCalled();
    expect(dependencies.confirmation.confirm).not.toHaveBeenCalled();
    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledWith(expect.objectContaining({
        errorCode: "BRANDING_VIRTUAL_RECONCILIATION_LEASE_BUDGET_LOW",
      }));
    expect(result).toMatchObject({ failed: 1 });
  });

  test("does not confirm when the prepare command rejects a false result", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const dependencies = createHarness();
    dependencies.repository.prepareSuccessfulQueryReconciliation
      .mockRejectedValue(Errors.dbError("prepare returned false"));
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    const result = await service.reconcile({ batchSize: 20 });

    expect(dependencies.confirmation.confirm).not.toHaveBeenCalled();
    expect(dependencies.repository.finalizeReconciliationAfterConfirmation)
      .not.toHaveBeenCalled();
    expect(dependencies.gateway.notifyProvideGoods).not.toHaveBeenCalled();
    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ failed: 1 });
  });

  test("does not notify when the delivery retry begin command rejects", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const dependencies = createHarness([createClaim({
      provider_order_no: "wechat-order-1",
      payment_status: "succeeded",
      fulfillment_status: "granted",
      provider_delivery_status: "failed",
      provider_delivery_attempt_key: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    })]);
    dependencies.repository.beginReconciliationDeliveryRetry
      .mockRejectedValue(Errors.dbError("begin returned false"));
    const service = new BrandingVirtualPaymentReconciliationService(dependencies);

    const result = await service.reconcile({ batchSize: 20 });

    expect(dependencies.gateway.notifyProvideGoods).not.toHaveBeenCalled();
    expect(dependencies.repository.markReconciliationDelivery)
      .not.toHaveBeenCalled();
    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ failed: 1 });
  });
});
