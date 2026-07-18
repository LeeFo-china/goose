import { describe, expect, mock, test } from "bun:test";
import {
  createExpirationHarness,
  defaultPaymentConfig,
  defaultSecretBundle,
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

  test("two workers share one lease and only the renewed owner acts remotely", async () => {
    let currentToken: string | null = null;
    let status = "pending";
    let claimSequence = 0;
    let resolveClaims: (() => void) | null = null;
    const bothClaimed = new Promise<void>((resolve) => {
      resolveClaims = resolve;
    });
    const tokenByWorker = new Map<string, string>();
    const queryWorkers: string[] = [];
    const closeWorkers: string[] = [];
    const markWorkers: string[] = [];
    const markTokens: string[] = [];

    const claimForWorker = async (workerId: string) => {
      claimSequence += 1;
      const claimToken = `claim-${claimSequence}`;
      currentToken = claimToken;
      tokenByWorker.set(workerId, claimToken);
      if (claimSequence === 2) resolveClaims?.();
      await bothClaimed;
      return [makeOrder(1, { close_claim_token: claimToken })];
    };
    const renewCloseClaim = mock(async (input: {
      claimToken: string;
    }) => {
      if (status !== "pending" || input.claimToken !== currentToken) return null;
      return makeOrder(1, { close_claim_token: input.claimToken });
    });
    const markOrderClosed = mock(async (input: {
      claimToken: string;
      workerId?: string;
    }) => {
      if (status !== "pending" || input.claimToken !== currentToken) return null;
      status = "closed";
      markTokens.push(input.claimToken);
      if (input.workerId) markWorkers.push(input.workerId);
      return makeOrder(1, { status: "closed", close_claim_token: null });
    });
    const { BillingRechargeExpirationService } = await import(
      "./billing-recharge-expiration"
    );
    const createWorker = (workerId: string) => {
      const repository = {
        claimExpiredOrders: mock(async () => claimForWorker(workerId)),
        renewCloseClaim,
        markOrderClosed: mock(async (input: {
          orderId: string;
          claimToken: string;
          closedAt: Date;
        }) => markOrderClosed({ ...input, workerId })),
        releaseCloseClaim: mock(async () => null),
      };
      return new BillingRechargeExpirationService({
        repository,
        paymentConfigRepository: {
          findWechatPayConfigById: mock(async () => defaultPaymentConfig),
        },
        secretBundleService: { load: mock(async () => defaultSecretBundle) },
        wechatPayGateway: {
          queryTransactionByOutTradeNo: mock(async () => {
            queryWorkers.push(workerId);
            return { trade_state: "NOTPAY" };
          }),
          closeTransactionByOutTradeNo: mock(async () => {
            closeWorkers.push(workerId);
          }),
        },
        paymentConfirmation: { confirm: mock(async () => ({})) },
      });
    };
    const workers = [
      { id: "worker-a", service: createWorker("worker-a") },
      { id: "worker-b", service: createWorker("worker-b") },
    ];

    const results = await Promise.all(workers.map(({ service }) =>
      service.runExpiredOrderChecks({ batchSize: 1 })
    ));

    const winnerIndex = results.findIndex((result) => result.closed === 1);
    const loserIndex = results.findIndex((result) => result.retried === 1);
    expect(winnerIndex).toBeGreaterThanOrEqual(0);
    expect(loserIndex).toBeGreaterThanOrEqual(0);
    const winner = workers[winnerIndex];
    const loser = workers[loserIndex];
    const winnerToken = winner ? tokenByWorker.get(winner.id) : null;
    if (!winner || !loser || !winnerToken || typeof currentToken !== "string") {
      throw new Error("shared lease test did not select one winner and one loser");
    }
    const winnerId = winner.id;
    const loserId = loser.id;
    expect(queryWorkers).toEqual([winnerId]);
    expect(closeWorkers).toEqual([winnerId]);
    expect(queryWorkers).not.toContain(loserId);
    expect(closeWorkers).not.toContain(loserId);
    expect(markWorkers).toEqual([winnerId]);
    expect(markTokens).toEqual([winnerToken]);
    expect(markTokens).toEqual([currentToken]);
    expect(renewCloseClaim).toHaveBeenCalledTimes(3);
    expect(markOrderClosed).toHaveBeenCalledTimes(1);
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

  test.each(["disabled", "suspended"] as const)(
    "queries and closes a %s service-provider order without app ids",
    async (status) => {
      const config = makePaymentConfig("provider-config", {
        profile_code: "tenant_service_provider",
        merchant_mode: "service_provider_sub_merchant",
        sub_merchant_id: "sub-merchant-1",
        app_id: null,
        sub_app_id: null,
        status,
        enabled_channels: [],
      });
      const order = makeOrder(1, { payment_config_id: config.id });
      const harness = await createExpirationHarness({
        orders: [order],
        configs: [config],
      });
      harness.queryTransaction.mockImplementationOnce(async () => ({
        trade_state: "NOTPAY",
      }));

      const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

      expect(harness.wechatPayGateway.queryTransactionByOutTradeNo)
        .toHaveBeenCalledWith(expect.objectContaining({ config }));
      expect(harness.wechatPayGateway.closeTransactionByOutTradeNo)
        .toHaveBeenCalledWith(expect.objectContaining({ config }));
      expect(result.closed).toBe(1);
    },
  );

  test.each([
    {
      profile_code: "platform_direct_recharge",
      merchant_mode: "service_provider_sub_merchant",
      sub_merchant_id: "sub-merchant-1",
      sub_app_id: "wx-sub-app",
    },
    {
      profile_code: "tenant_service_provider",
      merchant_mode: "direct_merchant",
      sub_merchant_id: null,
    },
  ] as const)(
    "rejects the crossed $profile_code and $merchant_mode cleanup combination",
    async (overrides) => {
      const config = makePaymentConfig("crossed-config", overrides);
      const order = makeOrder(1, { payment_config_id: config.id });
      const harness = await createExpirationHarness({
        orders: [order],
        configs: [config],
      });

      const result = await harness.service.runExpiredOrderChecks({ batchSize: 1 });

      expect(harness.wechatPayGateway.queryTransactionByOutTradeNo).not
        .toHaveBeenCalled();
      expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith({
        orderId: order.id,
        claimToken: order.close_claim_token,
        errorMessage: "BILLING_RECHARGE_EXPIRE_PAYMENT_CONFIG_FAILED",
      });
      expect(result.failed).toBe(1);
    },
  );

  test("defers a missing payment config id and continues the next claim", async () => {
    const missingConfig = makeOrder(1, { payment_config_id: null });
    const healthy = makeOrder(2);
    const harness = await createExpirationHarness({
      orders: [missingConfig, healthy],
    });

    const result = await harness.service.runExpiredOrderChecks({ batchSize: 3 });

    expect(harness.repository.releaseCloseClaim).toHaveBeenCalledWith({
      orderId: missingConfig.id,
      claimToken: missingConfig.close_claim_token,
      errorMessage: "BILLING_RECHARGE_EXPIRE_PAYMENT_CONFIG_REQUIRED",
    });
    expect(harness.repository.renewCloseClaim).toHaveBeenCalledTimes(1);
    expect(harness.repository.renewCloseClaim).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: healthy.id }),
    );
    expect(harness.wechatPayGateway.queryTransactionByOutTradeNo)
      .toHaveBeenCalledTimes(1);
    expect(harness.calls).toContain("mark:order-2");
    expect(result).toMatchObject({ claimed: 2, closed: 1, failed: 1 });
  });

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

  test("rejects a service-provider cleanup config without sub merchant id", async () => {
    const invalidConfig = makePaymentConfig("provider-config", {
      profile_code: "tenant_service_provider",
      merchant_mode: "service_provider_sub_merchant",
      sub_merchant_id: null,
      app_id: null,
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
