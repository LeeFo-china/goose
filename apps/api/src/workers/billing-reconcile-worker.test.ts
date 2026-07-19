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

  test("runs subscriptions and refunds with independent bounded batches", async () => {
    const subscriptionService = {
      runDueChecks: mock(async () => SUBSCRIPTION_RESULT),
    };
    const refundReconciliationService = {
      runBatch: mock(async () => REFUND_RESULT),
    };
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({ subscriptionService, refundReconciliationService, logger });

    expect(subscriptionService.runDueChecks).toHaveBeenCalledWith({
      batchSize: 100,
    });
    expect(refundReconciliationService.runBatch).toHaveBeenCalledWith({
      limit: 20,
    });
    expect(logger).toHaveBeenCalledWith(
      "info",
      "tick completed",
      expect.objectContaining({
        result: {
          subscription: { status: "fulfilled", result: SUBSCRIPTION_SUMMARY },
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
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({ subscriptionService, refundReconciliationService, logger });

    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).toContain('"error_count":1');
    expect(logged).toContain('"claimed":2');
    expect(logged).not.toContain("distinctive subscription raw secret");
    expect(logged).not.toContain("distinctive refund raw secret");
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
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({ subscriptionService, refundReconciliationService, logger });

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
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({ subscriptionService, refundReconciliationService, logger });

    expect(logger).toHaveBeenCalledWith(
      "error",
      "tick completed with errors",
      expect.objectContaining({
        result: {
          subscription: { status: "fulfilled", result: SUBSCRIPTION_SUMMARY },
          refund: { status: "rejected" },
        },
      }),
    );
    expect(JSON.stringify(logger.mock.calls)).not.toContain(
      "refund secret must not be logged",
    );
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
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    const firstTick = tick({
      subscriptionService,
      refundReconciliationService,
      logger,
    });
    await Promise.resolve();
    await tick({ subscriptionService, refundReconciliationService, logger });

    expect(subscriptionService.runDueChecks).toHaveBeenCalledTimes(1);
    expect(refundReconciliationService.runBatch).toHaveBeenCalledTimes(0);
    expect(logger).toHaveBeenCalledWith("warn", "previous tick still running");

    releaseSubscription?.();
    await firstTick;
    expect(refundReconciliationService.runBatch).toHaveBeenCalledTimes(1);
  });
});

const WORKER_ENV_KEYS = [
  "BILLING_RECONCILE_WORKER_ENABLED",
  "BILLING_RECONCILE_BATCH_SIZE",
  "BILLING_RECONCILE_INTERVAL_MS",
  "BILLING_REFUND_RECONCILE_BATCH_SIZE",
  "SUPABASE_URL",
  "SUPABASE_PUBLISH",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type WorkerEnvKey = (typeof WORKER_ENV_KEYS)[number];

let previousWorkerEnv: Record<WorkerEnvKey, string | undefined>;

async function readWorkerConfig() {
  const { getWorkerConfig } = await import("./billing-reconcile-worker");
  return getWorkerConfig();
}

function captureWorkerEnv(): Record<WorkerEnvKey, string | undefined> {
  return Object.fromEntries(
    WORKER_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<WorkerEnvKey, string | undefined>;
}

function restoreWorkerEnv(env: Record<WorkerEnvKey, string | undefined>): void {
  for (const key of WORKER_ENV_KEYS) {
    const value = env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearWorkerConfigEnv(): void {
  delete process.env.BILLING_RECONCILE_WORKER_ENABLED;
  delete process.env.BILLING_RECONCILE_BATCH_SIZE;
  delete process.env.BILLING_RECONCILE_INTERVAL_MS;
  delete process.env.BILLING_REFUND_RECONCILE_BATCH_SIZE;
}

function setSupabaseTestEnv(): void {
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_PUBLISH ??= "test-publish-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
}
