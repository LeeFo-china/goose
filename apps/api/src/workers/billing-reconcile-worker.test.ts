import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import {
  captureWorkerEnv,
  clearWorkerConfigEnv,
  createBrandingVirtualPaymentService,
  restoreWorkerEnv,
  setSupabaseTestEnv,
  type WorkerEnv,
} from "./billing-reconcile-worker-test-fixtures";

const SUBSCRIPTION_RESULT = {
  ensured: 1,
  reminded: 2,
  charged: 3,
  locked: 4,
  skipped: 5,
  errors: [],
};
const SUBSCRIPTION_SUMMARY = {
  ensured: 1,
  reminded: 2,
  charged: 3,
  locked: 4,
  skipped: 5,
  error_count: 0,
};
const RECHARGE_EXPIRATION_RESULT = {
  claimed: 3,
  paid: 1,
  closed: 1,
  retried: 1,
  failed: 0,
  release_failed: 0,
};

const RECHARGE_EXPIRATION_SUMMARY = {
  claimed: 3,
  paid: 1,
  closed: 1,
  retried: 1,
  failed: 0,
  release_failed: 0,
};
const REFUND_RESULT = {
  claimed: 2,
  success: 1,
  processing: 1,
  closed: 0,
  abnormal: 0,
  rescheduled: 1,
  failed: 0,
};

describe("billing reconcile worker imports", () => {
  test("does not register shutdown signal handlers on import", async () => {
    const previousEnv = captureWorkerEnv();
    const sigintListenerCount = process.listenerCount("SIGINT");
    const sigtermListenerCount = process.listenerCount("SIGTERM");

    try {
      setSupabaseTestEnv();

      await import("./billing-reconcile-worker");

      expect(process.listenerCount("SIGINT")).toBe(sigintListenerCount);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermListenerCount);
    } finally {
      restoreWorkerEnv(previousEnv);
    }
  });
});

describe("getWorkerConfig", () => {
  beforeEach(() => {
    previousWorkerEnv = captureWorkerEnv();
    setSupabaseTestEnv();
    clearWorkerConfigEnv();
  });

  afterEach(() => {
    restoreWorkerEnv(previousWorkerEnv);
  });

  test("uses the enabled 60-second bounded defaults", async () => {
    expect(await readWorkerConfig()).toEqual({
      enabled: true,
      intervalMs: 60_000,
      batchSize: 100,
      rechargeExpirationBatchSize: 50,
      brandingAddonExpirationBatchSize: 50,
      brandingVirtualPaymentBatchSize: 20,
      refundBatchSize: 20,
    });
  });
  test("falls back for blank and invalid refund batch sizes", async () => {
    process.env.BILLING_REFUND_RECONCILE_BATCH_SIZE = " ";
    expect((await readWorkerConfig()).refundBatchSize).toBe(20);

    process.env.BILLING_REFUND_RECONCILE_BATCH_SIZE = "invalid";
    expect((await readWorkerConfig()).refundBatchSize).toBe(20);
  });

  test("clamps refund batch size to 1 through 100", async () => {
    process.env.BILLING_REFUND_RECONCILE_BATCH_SIZE = "0";
    expect((await readWorkerConfig()).refundBatchSize).toBe(1);

    process.env.BILLING_REFUND_RECONCILE_BATCH_SIZE = "500";
    expect((await readWorkerConfig()).refundBatchSize).toBe(100);
  });

  test("keeps the existing subscription and interval bounds", async () => {
    process.env.BILLING_RECONCILE_BATCH_SIZE = "500";
    process.env.BILLING_RECONCILE_INTERVAL_MS = "1";

    const config = await readWorkerConfig();

    expect(config.batchSize).toBe(100);
    expect(config.intervalMs).toBe(10_000);
  });
});

describe("tick", () => {
  beforeEach(() => {
    previousWorkerEnv = captureWorkerEnv();
    setSupabaseTestEnv();
    clearWorkerConfigEnv();
  });

  afterEach(() => {
    restoreWorkerEnv(previousWorkerEnv);
  });

  test("runs every billing child with independent bounded batches", async () => {
    const subscriptionService = {
      runDueChecks: mock(async () => SUBSCRIPTION_RESULT),
    };
    const refundReconciliationService = {
      runBatch: mock(async () => REFUND_RESULT),
    };
    const rechargeExpirationService = {
      runExpiredOrderChecks: mock(async () => RECHARGE_EXPIRATION_RESULT),
    };
    const brandingAddonExpirationService = createBrandingAddonExpirationService();
    const brandingVirtualPaymentReconciliationService =
      createBrandingVirtualPaymentService();
    const logger = mock(() => {});
    const markHealthy = mock(async () => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      subscriptionService,
      rechargeExpirationService,
      brandingAddonExpirationService,
      brandingVirtualPaymentReconciliationService,
      refundReconciliationService,
      healthEvidence: { markHealthy },
      logger,
    });

    expect(subscriptionService.runDueChecks).toHaveBeenCalledWith({
      batchSize: 100,
    });
    expect(refundReconciliationService.runBatch).toHaveBeenCalledWith({
      limit: 20,
    });
    expect(rechargeExpirationService.runExpiredOrderChecks).toHaveBeenCalledWith({
      batchSize: 50,
    });
    expect(
      brandingAddonExpirationService.runExpiredOrderChecks,
    ).toHaveBeenCalledWith({ batchSize: 50 });
    expect(logger).toHaveBeenCalledWith(
      "info",
      "tick completed",
      expect.objectContaining({
        result: {
          subscription: { status: "fulfilled", result: SUBSCRIPTION_SUMMARY },
          recharge_expiration: {
            status: "fulfilled",
            result: RECHARGE_EXPIRATION_SUMMARY,
          },
          branding_addon_expiration: {
            status: "fulfilled",
            result: RECHARGE_EXPIRATION_RESULT,
          },
          branding_virtual_payment: {
            status: "fulfilled",
            result: {
              claimed: 0,
              queried: 0,
              confirmed: 0,
              closed: 0,
              failed: 0,
              grant_recovered: 0,
            },
          },
          refund: { status: "fulfilled", result: REFUND_RESULT },
        },
      }),
    );
  });

  test("whitelists scalar child summaries without logging returned error text", async () => {
    const subscriptionService = {
      runDueChecks: mock(async () => ({
        ...SUBSCRIPTION_RESULT,
        errors: ["distinctive subscription raw secret"],
      })),
    };
    const refundReconciliationService = {
      runBatch: mock(async () => ({
        ...REFUND_RESULT,
        raw_secret: "distinctive refund raw secret",
      })),
    };
    const rechargeExpirationService = {
      runExpiredOrderChecks: mock(async () => ({
        ...RECHARGE_EXPIRATION_RESULT,
        release_failures: [{
          order_id: "order-1",
          diagnostic: "distinctive expiration raw secret",
          error_code: "BILLING_RECHARGE_EXPIRE_RELEASE_FAILED" as const,
          error_message: "释放充值过期订单租约失败" as const,
        }],
        raw_secret: "distinctive expiration raw secret",
      })),
    };
    const brandingAddonExpirationService = {
      runExpiredOrderChecks: mock(async () => ({
        ...RECHARGE_EXPIRATION_RESULT,
        raw_secret: "distinctive addon raw secret",
      })),
    };
    const brandingVirtualPaymentReconciliationService =
      createBrandingVirtualPaymentService();
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      subscriptionService,
      rechargeExpirationService,
      brandingAddonExpirationService,
      brandingVirtualPaymentReconciliationService,
      refundReconciliationService,
      logger,
    });

    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).toContain('"error_count":1');
    expect(logged).toContain('"claimed":2');
    expect(logged).not.toContain("distinctive subscription raw secret");
    expect(logged).not.toContain("distinctive refund raw secret");
    expect(logged).not.toContain("distinctive expiration raw secret");
    expect(logged).not.toContain("distinctive addon raw secret");
    expect(logged).not.toContain("raw_secret");
  });

  test("still runs refunds when subscriptions fail", async () => {
    const subscriptionService = {
      runDueChecks: mock(async () => {
        throw new Error("subscription secret must not be logged");
      }),
    };
    const refundReconciliationService = {
      runBatch: mock(async () => REFUND_RESULT),
    };
    const rechargeExpirationService = {
      runExpiredOrderChecks: mock(async () => RECHARGE_EXPIRATION_RESULT),
    };
    const brandingAddonExpirationService = createBrandingAddonExpirationService();
    const brandingVirtualPaymentReconciliationService =
      createBrandingVirtualPaymentService();
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      subscriptionService,
      rechargeExpirationService,
      brandingAddonExpirationService,
      brandingVirtualPaymentReconciliationService,
      refundReconciliationService,
      logger,
    });

    expect(rechargeExpirationService.runExpiredOrderChecks).toHaveBeenCalledTimes(1);
    expect(refundReconciliationService.runBatch).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).toContain('"subscription":{"status":"rejected"}');
    expect(logged).toContain('"refund":{"status":"fulfilled"');
    expect(logged).not.toContain("subscription secret must not be logged");
  });

  test("preserves the subscription result when refunds fail", async () => {
    const subscriptionService = {
      runDueChecks: mock(async () => SUBSCRIPTION_RESULT),
    };
    const refundReconciliationService = {
      runBatch: mock(async () => {
        throw new Error("refund secret must not be logged");
      }),
    };
    const rechargeExpirationService = {
      runExpiredOrderChecks: mock(async () => RECHARGE_EXPIRATION_RESULT),
    };
    const brandingAddonExpirationService = createBrandingAddonExpirationService();
    const brandingVirtualPaymentReconciliationService =
      createBrandingVirtualPaymentService();
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      subscriptionService,
      rechargeExpirationService,
      brandingAddonExpirationService,
      brandingVirtualPaymentReconciliationService,
      refundReconciliationService,
      logger,
    });

    expect(logger).toHaveBeenCalledWith(
      "error",
      "tick completed with errors",
      expect.objectContaining({
        result: expect.objectContaining({
          subscription: { status: "fulfilled", result: SUBSCRIPTION_SUMMARY },
          recharge_expiration: {
            status: "fulfilled",
            result: RECHARGE_EXPIRATION_SUMMARY,
          },
          branding_addon_expiration: {
            status: "fulfilled",
            result: RECHARGE_EXPIRATION_RESULT,
          },
          refund: { status: "rejected" },
        }),
      }),
    );
    expect(JSON.stringify(logger.mock.calls)).not.toContain(
      "refund secret must not be logged",
    );
  });

  test("still runs refunds when recharge expiration fails", async () => {
    const subscriptionService = {
      runDueChecks: mock(async () => SUBSCRIPTION_RESULT),
    };
    const rechargeExpirationService = {
      runExpiredOrderChecks: mock(async () => {
        throw new Error("expiration secret must not be logged");
      }),
    };
    const brandingAddonExpirationService = createBrandingAddonExpirationService();
    const brandingVirtualPaymentReconciliationService =
      createBrandingVirtualPaymentService();
    const refundReconciliationService = {
      runBatch: mock(async () => REFUND_RESULT),
    };
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      subscriptionService,
      rechargeExpirationService,
      brandingAddonExpirationService,
      brandingVirtualPaymentReconciliationService,
      refundReconciliationService,
      logger,
    });

    expect(refundReconciliationService.runBatch).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).toContain('"recharge_expiration":{"status":"rejected"}');
    expect(logged).toContain('"refund":{"status":"fulfilled"');
    expect(logged).not.toContain("expiration secret must not be logged");
  });

  test("keeps process-level no-overlap while a tick is running", async () => {
    let releaseSubscription: (() => void) | undefined;
    const subscriptionPending = new Promise<void>((resolve) => {
      releaseSubscription = resolve;
    });
    const subscriptionService = {
      runDueChecks: mock(async () => {
        await subscriptionPending;
        return SUBSCRIPTION_RESULT;
      }),
    };
    const refundReconciliationService = {
      runBatch: mock(async () => REFUND_RESULT),
    };
    const rechargeExpirationService = {
      runExpiredOrderChecks: mock(async () => RECHARGE_EXPIRATION_RESULT),
    };
    const brandingAddonExpirationService = createBrandingAddonExpirationService();
    const brandingVirtualPaymentReconciliationService =
      createBrandingVirtualPaymentService();
    const markHealthy = mock(async () => {});
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");
    const firstTick = tick({
      subscriptionService,
      rechargeExpirationService,
      brandingAddonExpirationService,
      brandingVirtualPaymentReconciliationService,
      refundReconciliationService,
      healthEvidence: { markHealthy },
      logger,
    });
    await Promise.resolve();
    await tick({
      subscriptionService,
      rechargeExpirationService,
      refundReconciliationService,
      healthEvidence: { markHealthy },
      logger,
    });
    expect(subscriptionService.runDueChecks).toHaveBeenCalledTimes(1);
    expect(rechargeExpirationService.runExpiredOrderChecks).toHaveBeenCalledTimes(0);
    expect(
      brandingAddonExpirationService.runExpiredOrderChecks,
    ).toHaveBeenCalledTimes(0);
    expect(refundReconciliationService.runBatch).toHaveBeenCalledTimes(0);
    expect(markHealthy).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith("warn", "previous tick still running");

    releaseSubscription?.();
    await firstTick;
    expect(rechargeExpirationService.runExpiredOrderChecks).toHaveBeenCalledTimes(1);
    expect(
      brandingAddonExpirationService.runExpiredOrderChecks,
    ).toHaveBeenCalledTimes(1);
    expect(refundReconciliationService.runBatch).toHaveBeenCalledTimes(1);
    expect(markHealthy).toHaveBeenCalledTimes(1);
  });

  test("refreshes health only after all children succeed and recovers later", async () => {
    const subscriptionService = {
      runDueChecks: mock(async () => SUBSCRIPTION_RESULT),
    };
    const rechargeExpirationService = {
      runExpiredOrderChecks: mock(async () => RECHARGE_EXPIRATION_RESULT),
    };
    const brandingAddonExpirationService = createBrandingAddonExpirationService();
    const brandingVirtualPaymentReconciliationService =
      createBrandingVirtualPaymentService();
    const refundReconciliationService = {
      runBatch: mock(async () => REFUND_RESULT),
    };
    const markHealthy = mock(async () => {});
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");
    const dependencies = {
      subscriptionService,
      rechargeExpirationService,
      brandingAddonExpirationService,
      brandingVirtualPaymentReconciliationService,
      refundReconciliationService,
      healthEvidence: { markHealthy },
      logger,
    };

    await tick(dependencies);
    expect(markHealthy).toHaveBeenCalledTimes(1);

    subscriptionService.runDueChecks.mockImplementation(async () => {
      throw new Error("distinctive subscription secret");
    });
    await tick(dependencies);
    await tick(dependencies);
    expect(markHealthy).toHaveBeenCalledTimes(1);

    subscriptionService.runDueChecks.mockImplementation(async () => SUBSCRIPTION_RESULT);
    await tick(dependencies);
    expect(markHealthy).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(logger.mock.calls)).not.toContain(
      "distinctive subscription secret",
    );
  });
});

let previousWorkerEnv: WorkerEnv;

async function readWorkerConfig() {
  const { getWorkerConfig } = await import("./billing-reconcile-worker");
  return getWorkerConfig();
}

function createBrandingAddonExpirationService() {
  return {
    runExpiredOrderChecks: mock(async () => RECHARGE_EXPIRATION_RESULT),
  };
}
