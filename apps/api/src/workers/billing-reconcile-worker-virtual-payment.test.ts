import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

const SUBSCRIPTION_RESULT = {
  ensured: 1,
  reminded: 0,
  charged: 0,
  locked: 0,
  skipped: 0,
  errors: [],
};
const EXPIRATION_RESULT = {
  claimed: 0,
  paid: 0,
  closed: 0,
  retried: 0,
  failed: 0,
  release_failed: 0,
};
const REFUND_RESULT = {
  claimed: 0,
  success: 0,
  processing: 0,
  closed: 0,
  abnormal: 0,
  rescheduled: 0,
  failed: 0,
};
const VIRTUAL_PAYMENT_RESULT = {
  claimed: 6,
  queried: 5,
  confirmed: 4,
  closed: 1,
  failed: 0,
  grantRecovered: 2,
};

const WORKER_ENV_KEYS = [
  "BILLING_RECONCILE_WORKER_ENABLED",
  "BILLING_BRANDING_VIRTUAL_PAYMENT_RECONCILE_BATCH_SIZE",
  "SUPABASE_URL",
  "SUPABASE_PUBLISH",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type WorkerEnvKey = (typeof WORKER_ENV_KEYS)[number];
let previousEnv: Record<WorkerEnvKey, string | undefined>;

describe("billing reconcile worker virtual payment child", () => {
  beforeEach(() => {
    previousEnv = Object.fromEntries(
      WORKER_ENV_KEYS.map((key) => [key, process.env[key]]),
    ) as Record<WorkerEnvKey, string | undefined>;
    process.env.SUPABASE_URL ??= "http://localhost:54321";
    process.env.SUPABASE_PUBLISH ??= "test-publish-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
    delete process.env.BILLING_RECONCILE_WORKER_ENABLED;
    delete process.env.BILLING_BRANDING_VIRTUAL_PAYMENT_RECONCILE_BATCH_SIZE;
  });

  afterEach(() => {
    for (const key of WORKER_ENV_KEYS) {
      const value = previousEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("uses an independent default and clamps it to one through one hundred", async () => {
    const { getWorkerConfig } = await import("./billing-reconcile-worker");

    expect(getWorkerConfig().brandingVirtualPaymentBatchSize).toBe(20);
    process.env.BILLING_BRANDING_VIRTUAL_PAYMENT_RECONCILE_BATCH_SIZE = "0";
    expect(getWorkerConfig().brandingVirtualPaymentBatchSize).toBe(1);
    process.env.BILLING_BRANDING_VIRTUAL_PAYMENT_RECONCILE_BATCH_SIZE = "500";
    expect(getWorkerConfig().brandingVirtualPaymentBatchSize).toBe(100);
  });

  test("runs reconciliation with its independent batch and logs only scalar telemetry", async () => {
    const brandingVirtualPaymentReconciliationService = {
      reconcile: mock(async () => ({
        ...VIRTUAL_PAYMENT_RESULT,
        refundClaimed: 3,
        refundQueried: 2,
        refundSucceeded: 1,
        refundFailed: 0,
        refundCompensated: 1,
        raw_secret: "distinctive virtual payment secret",
      })),
    };
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      ...successfulDependencies(),
      brandingVirtualPaymentReconciliationService,
      healthEvidence: { markHealthy: mock(async () => {}) },
      logger,
    });

    expect(brandingVirtualPaymentReconciliationService.reconcile)
      .toHaveBeenCalledWith({ batchSize: 20 });
    expect(logger).toHaveBeenCalledWith(
      "info",
      "tick completed",
      expect.objectContaining({
        result: expect.objectContaining({
          branding_virtual_payment: {
            status: "fulfilled",
            result: {
              claimed: 6,
              queried: 5,
              confirmed: 4,
              closed: 1,
              failed: 0,
              grant_recovered: 2,
              refund_claimed: 3,
              refund_queried: 2,
              refund_succeeded: 1,
              refund_failed: 0,
              refund_compensated: 1,
              refund_pending: 0,
              refund_rescheduled: 0,
              refund_terminal_failed: 0,
            },
          },
        }),
      }),
    );
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain("distinctive virtual payment secret");
    expect(logged).not.toContain("raw_secret");
  });

  test("keeps later children running and health stale when reconciliation rejects", async () => {
    const refundReconciliationService = {
      runBatch: mock(async () => REFUND_RESULT),
    };
    const brandingVirtualPaymentReconciliationService = {
      reconcile: mock(async () => {
        throw new Error("distinctive virtual payment provider secret");
      }),
    };
    const markHealthy = mock(async () => {});
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      ...successfulDependencies(),
      brandingVirtualPaymentReconciliationService,
      refundReconciliationService,
      healthEvidence: { markHealthy },
      logger,
    });

    expect(refundReconciliationService.runBatch).toHaveBeenCalledTimes(1);
    expect(markHealthy).not.toHaveBeenCalled();
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).toContain(
      '"branding_virtual_payment":{"status":"rejected"}',
    );
    expect(logged).toContain('"refund":{"status":"fulfilled"');
    expect(logged).not.toContain("distinctive virtual payment provider secret");
  });

  test("keeps health stale when reconciliation reports failed items", async () => {
    const markHealthy = mock(async () => {});
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      ...successfulDependencies(),
      brandingVirtualPaymentReconciliationService: {
        reconcile: mock(async () => ({
          ...VIRTUAL_PAYMENT_RESULT,
          refundClaimed: 1,
          refundFailed: 1,
        })),
      },
      healthEvidence: { markHealthy },
      logger,
    });

    expect(markHealthy).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(
      "error",
      "tick completed with errors",
      expect.objectContaining({
        result: expect.objectContaining({
          branding_virtual_payment: {
            status: "fulfilled",
            result: expect.objectContaining({ failed: 0, refund_failed: 1 }),
          },
        }),
      }),
    );
  });
});

function successfulDependencies() {
  return {
    subscriptionService: {
      runDueChecks: mock(async () => SUBSCRIPTION_RESULT),
    },
    rechargeExpirationService: {
      runExpiredOrderChecks: mock(async () => EXPIRATION_RESULT),
    },
    brandingAddonExpirationService: {
      runExpiredOrderChecks: mock(async () => EXPIRATION_RESULT),
    },
    refundReconciliationService: {
      runBatch: mock(async () => REFUND_RESULT),
    },
  };
}
