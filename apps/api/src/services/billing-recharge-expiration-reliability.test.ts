import { describe, expect, test } from "bun:test";
import {
  createExpirationHarness,
  makeOrder,
  makePaymentConfig,
  successTransaction,
} from "./billing-recharge-expiration.test-helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("BillingRechargeExpirationService lease reliability", () => {
  test("caps batch 101 at 100 one-row claims", async () => {
    const orders = Array.from({ length: 100 }, (_, index) => makeOrder(index + 1));
    const harness = await createExpirationHarness({ orders });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 101 });

    expect(harness.repository.claimExpiredOrders).toHaveBeenCalledTimes(100);
    expect(harness.repository.claimExpiredOrders.mock.calls.every(
      ([input]) => input.batchSize === 1 && input.excludedOrderIds.length <= 99,
    )).toBe(true);
    expect(result.claimed).toBe(100);
    expect(result.closed).toBe(100);
  });

  test("stops after the first empty claim before the requested limit", async () => {
    const orders = [makeOrder(), makeOrder(2)];
    const harness = await createExpirationHarness({ orders });

    await harness.service.runExpiredOrderChecks({ batchSize: 50 });

    expect(harness.repository.claimExpiredOrders).toHaveBeenCalledTimes(3);
    expect(harness.repository.claimExpiredOrders).toHaveBeenLastCalledWith({
      now: expect.any(Date),
      batchSize: 1,
      leaseSeconds: 60,
      excludedOrderIds: orders.map((order) => order.id),
    });
  });

  test("lost renewal performs no remote or local action", async () => {
    const harness = await createExpirationHarness({ orders: [makeOrder()] });
    harness.repository.renewCloseClaim.mockImplementationOnce(async () => null);

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.wechatPayGateway.queryTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(harness.wechatPayGateway.closeTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(harness.paymentConfirmation.confirm).not.toHaveBeenCalled();
    expect(harness.repository.markOrderClosed).not.toHaveBeenCalled();
    expect(harness.repository.releaseCloseClaim).not.toHaveBeenCalled();
    expect(result.retried).toBe(1);
  });

  test("renewal failure is deferred with a stable diagnostic", async () => {
    const harness = await createExpirationHarness({ orders: [makeOrder()] });
    harness.repository.renewCloseClaim.mockImplementationOnce(async () => {
      throw new Error("database host and token detail");
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.wechatPayGateway.queryTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith({
      orderId: "order-1",
      claimToken: "claim-1",
      errorMessage: "BILLING_RECHARGE_EXPIRE_CLAIM_RENEW_FAILED",
    });
    expect(result.failed).toBe(1);
  });

  test("only the worker whose token renews may query and close", async () => {
    const stale = makeOrder(1, { close_claim_token: "claim-stale" });
    const owner = makeOrder(1, { close_claim_token: "claim-owner" });
    const staleWorker = await createExpirationHarness({ orders: [stale] });
    const ownerWorker = await createExpirationHarness({ orders: [owner] });
    staleWorker.repository.renewCloseClaim.mockImplementationOnce(async () => null);
    ownerWorker.queryTransaction.mockImplementationOnce(async () => ({
      trade_state: "NOTPAY",
    }));

    await Promise.all([
      staleWorker.service.runExpiredOrderChecks({ batchSize: 1 }),
      ownerWorker.service.runExpiredOrderChecks({ batchSize: 1 }),
    ]);

    expect(staleWorker.wechatPayGateway.queryTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(staleWorker.repository.markOrderClosed).not.toHaveBeenCalled();
    expect(ownerWorker.wechatPayGateway.queryTransactionByOutTradeNo)
      .toHaveBeenCalledTimes(1);
    expect(ownerWorker.wechatPayGateway.closeTransactionByOutTradeNo)
      .toHaveBeenCalledTimes(1);
    expect(ownerWorker.repository.markOrderClosed).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: "claim-owner" }),
    );
  });

  test("retries atomic confirmation on a later run after release", async () => {
    const first = makeOrder(1, { close_claim_token: "claim-run-1" });
    const second = makeOrder(1, { close_claim_token: "claim-run-2" });
    const harness = await createExpirationHarness({ orders: [first] });
    const claims = [[first], [], [second], []];
    harness.repository.claimExpiredOrders.mockImplementation(async () =>
      claims.shift() ?? []
    );
    harness.repository.renewCloseClaim.mockImplementation(async (input) =>
      input.claimToken === "claim-run-1" ? first : second
    );
    harness.queryTransaction.mockImplementation(async () => successTransaction(first));
    harness.paymentConfirmation.confirm
      .mockImplementationOnce(async () => {
        throw new Error("atomic recovery rollback");
      })
      .mockImplementationOnce(async () => ({}));

    const firstRun = await harness.service.runExpiredOrderChecks({ batchSize: 2 });
    const secondRun = await harness.service.runExpiredOrderChecks({ batchSize: 2 });

    expect(firstRun.failed).toBe(1);
    expect(secondRun.paid).toBe(1);
    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledTimes(1);
    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: "claim-run-1" }),
    );
  });
});

describe("BillingRechargeExpirationService cleanup configuration", () => {
  test.each(["disabled", "suspended"] as const)(
    "uses a %s stored config by id even when recharge channel is disabled",
    async (status) => {
      const config = makePaymentConfig("historical-config", {
        status,
        enabled_channels: [],
      });
      const order = makeOrder(1, { payment_config_id: config.id });
      const harness = await createExpirationHarness({ orders: [order], configs: [config] });

      const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

      expect(harness.paymentConfigRepository.findWechatPayConfigById)
        .toHaveBeenCalledWith(config.id);
      expect(harness.wechatPayGateway.queryTransactionByOutTradeNo)
        .toHaveBeenCalledTimes(1);
      expect(result.closed).toBe(1);
    },
  );

  test("loads each config and secret only once per run", async () => {
    const firstConfig = makePaymentConfig("config-a");
    const secondConfig = makePaymentConfig("config-b");
    const orders = [
      makeOrder(1, { payment_config_id: firstConfig.id }),
      makeOrder(2, { payment_config_id: firstConfig.id }),
      makeOrder(3, { payment_config_id: secondConfig.id }),
      makeOrder(4, { payment_config_id: secondConfig.id }),
    ];
    const harness = await createExpirationHarness({
      orders,
      configs: [firstConfig, secondConfig],
    });

    await harness.service.runExpiredOrderChecks({ batchSize: 5 });

    expect(harness.paymentConfigRepository.findWechatPayConfigById)
      .toHaveBeenCalledTimes(2);
    expect(harness.secretBundleService.load).toHaveBeenCalledTimes(2);
    expect(harness.secretBundleService.load.mock.calls.map(([ref]) => ref))
      .toEqual([firstConfig.encrypted_config_ref, secondConfig.encrypted_config_ref]);
  });

  test.each(["config", "secret"] as const)(
    "isolates one %s load failure and continues with another config",
    async (failure) => {
      const brokenConfig = makePaymentConfig("config-broken");
      const healthyConfig = makePaymentConfig("config-healthy");
      const orders = [
        makeOrder(1, { payment_config_id: brokenConfig.id }),
        makeOrder(2, { payment_config_id: brokenConfig.id }),
        makeOrder(3, { payment_config_id: healthyConfig.id }),
      ];
      const harness = await createExpirationHarness({
        orders,
        configs: [brokenConfig, healthyConfig],
      });
      if (failure === "config") {
        harness.paymentConfigRepository.findWechatPayConfigById
          .mockImplementation(async (configId) => {
            if (configId === brokenConfig.id) throw new Error("database detail");
            return healthyConfig;
          });
      } else {
        harness.secretBundleService.load.mockImplementation(async (ref) => {
          if (ref === brokenConfig.encrypted_config_ref) {
            throw new Error("private key detail");
          }
          return {
            privateKeyPem: "key",
            apiV3Key: "api-key",
            wechatPayPublicKeyId: null,
            wechatPayPublicKeyPem: null,
            baseUrl: "https://api.mch.weixin.qq.com",
          };
        });
      }

      const result = await harness.service.runExpiredOrderChecks({ batchSize: 4 });

      expect(result).toMatchObject({ claimed: 3, closed: 1, failed: 2 });
      expect(harness.paymentConfigRepository.findWechatPayConfigById)
        .toHaveBeenCalledTimes(2);
      expect(harness.calls).toContain("mark:order-3");
    },
  );

  test("rejects incomplete cleanup credentials without a remote call", async () => {
    const invalidConfig = makePaymentConfig("provider-config", {
      merchant_mode: "service_provider_sub_merchant",
      sub_merchant_id: null,
      sub_app_id: null,
    });
    const order = makeOrder(1, { payment_config_id: invalidConfig.id });
    const harness = await createExpirationHarness({
      orders: [order],
      configs: [invalidConfig],
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

    expect(harness.wechatPayGateway.queryTransactionByOutTradeNo).not
      .toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  test("reports every release failure and continues later releases", async () => {
    const harness = await createExpirationHarness({
      orders: [makeOrder(), makeOrder(2)],
    });
    harness.queryTransaction.mockImplementation(async () => ({
      trade_state: "USERPAYING",
    }));
    harness.repository.releaseCloseClaim.mockImplementationOnce(async () => {
      throw new Error("database detail");
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 3 });

    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ retried: 2, release_failed: 1 });
  });
});
