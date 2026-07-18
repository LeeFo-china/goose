import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const WORKER_ENV_KEYS = [
  "BILLING_RECHARGE_EXPIRATION_WORKER_ENABLED",
  "BILLING_RECHARGE_EXPIRATION_INTERVAL_MS",
  "BILLING_RECHARGE_EXPIRATION_BATCH_SIZE",
  "SUPABASE_URL",
  "SUPABASE_PUBLISH",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type WorkerEnvKey = (typeof WORKER_ENV_KEYS)[number];
type WorkerEnvironment = Record<WorkerEnvKey, string | undefined>;

let previousEnvironment: WorkerEnvironment;

beforeEach(() => {
  previousEnvironment = captureEnvironment();
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_PUBLISH = "test-publish-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  delete process.env.BILLING_RECHARGE_EXPIRATION_WORKER_ENABLED;
  delete process.env.BILLING_RECHARGE_EXPIRATION_INTERVAL_MS;
  delete process.env.BILLING_RECHARGE_EXPIRATION_BATCH_SIZE;
});

afterEach(() => {
  restoreEnvironment(previousEnvironment);
});

describe("getBillingRechargeExpirationWorkerConfig", () => {
  test("uses the enabled ten-second fifty-order defaults", async () => {
    const { getBillingRechargeExpirationWorkerConfig } = await loadWorkerModule();

    expect(getBillingRechargeExpirationWorkerConfig()).toEqual({
      enabled: true,
      intervalMs: 10_000,
      batchSize: 50,
    });
  });

  test.each([
    ["", 10_000],
    ["invalid", 10_000],
    ["999", 1_000],
    ["1000.9", 1_000],
    [String(25 * 60 * 60 * 1000), 24 * 60 * 60 * 1000],
  ])("bounds interval %s to %d milliseconds", async (rawValue, expected) => {
    process.env.BILLING_RECHARGE_EXPIRATION_INTERVAL_MS = rawValue;
    const { getBillingRechargeExpirationWorkerConfig } = await loadWorkerModule();

    expect(getBillingRechargeExpirationWorkerConfig().intervalMs).toBe(expected);
  });

  test.each([
    [" ", 50],
    ["invalid", 50],
    ["0", 1],
    ["8.9", 8],
    ["101", 100],
  ])("bounds batch size %s to %d", async (rawValue, expected) => {
    process.env.BILLING_RECHARGE_EXPIRATION_BATCH_SIZE = rawValue;
    const { getBillingRechargeExpirationWorkerConfig } = await loadWorkerModule();

    expect(getBillingRechargeExpirationWorkerConfig().batchSize).toBe(expected);
  });

  test("falls back for invalid enabled values and accepts false", async () => {
    const { getBillingRechargeExpirationWorkerConfig } = await loadWorkerModule();
    process.env.BILLING_RECHARGE_EXPIRATION_WORKER_ENABLED = "not-a-boolean";
    expect(getBillingRechargeExpirationWorkerConfig().enabled).toBe(true);

    process.env.BILLING_RECHARGE_EXPIRATION_WORKER_ENABLED = "false";
    expect(getBillingRechargeExpirationWorkerConfig().enabled).toBe(false);
  });
});

describe("billing recharge expiration worker", () => {
  test("does not register shutdown handlers on import", async () => {
    const sigintListeners = process.listenerCount("SIGINT");
    const sigtermListeners = process.listenerCount("SIGTERM");

    await loadWorkerModule();

    expect(process.listenerCount("SIGINT")).toBe(sigintListeners);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermListeners);
  });

  test("does not call the service when disabled", async () => {
    const harness = await createWorkerHarness({
      environment: {
        BILLING_RECHARGE_EXPIRATION_WORKER_ENABLED: "false",
      },
    });

    await harness.worker.tick();

    expect(harness.runExpiredOrderChecks).not.toHaveBeenCalled();
    expect(harness.entries).toContainEqual(expect.objectContaining({
      level: "info",
      service: "billing-recharge-expiration-worker",
      message: "worker disabled",
    }));
  });

  test("passes the configured batch size and logs complete safe telemetry", async () => {
    const telemetry = {
      claimed: 4,
      paid: 1,
      closed: 2,
      retried: 1,
      failed: 0,
      release_failed: 1,
      raw_transaction: "secret transaction body",
    };
    const harness = await createWorkerHarness({
      environment: { BILLING_RECHARGE_EXPIRATION_BATCH_SIZE: "25" },
      result: telemetry,
    });

    await harness.worker.tick();

    expect(harness.runExpiredOrderChecks).toHaveBeenCalledWith({ batchSize: 25 });
    expect(harness.entries).toContainEqual(expect.objectContaining({
      level: "info",
      service: "billing-recharge-expiration-worker",
      message: "tick completed",
      duration_ms: expect.any(Number),
      telemetry: {
        claimed: 4,
        paid: 1,
        closed: 2,
        retried: 1,
        failed: 0,
        release_failed: 1,
      },
    }));
    expect(JSON.stringify(harness.entries)).not.toContain("raw_transaction");
    expect(JSON.stringify(harness.entries)).not.toContain("secret transaction body");
  });

  test("skips an overlapping tick while the first tick remains pending", async () => {
    const deferred = createDeferred<ExpirationTelemetry>();
    const harness = await createWorkerHarness({ implementation: () => deferred.promise });

    const firstTick = harness.worker.tick();
    await Promise.resolve();
    await harness.worker.tick();

    expect(harness.runExpiredOrderChecks).toHaveBeenCalledTimes(1);
    expect(harness.entries).toContainEqual(expect.objectContaining({
      level: "warn",
      message: "previous tick still running",
    }));

    deferred.resolve(emptyTelemetry());
    await firstTick;
  });

  test("logs only safe error fields and permits a later tick after failure", async () => {
    let callCount = 0;
    const harness = await createWorkerHarness({
      implementation: async () => {
        callCount += 1;
        if (callCount === 1) {
          const error = new Error("apiV3Key=secret raw transaction body");
          Object.assign(error, { code: "WECHAT_PAY_QUERY_FAILED", token: "secret" });
          throw error;
        }
        return emptyTelemetry();
      },
    });

    await harness.worker.tick();
    await harness.worker.tick();

    expect(harness.runExpiredOrderChecks).toHaveBeenCalledTimes(2);
    const failureEntry = harness.entries.find((entry) => entry.message === "tick failed");
    expect(failureEntry).toEqual(expect.objectContaining({
      level: "error",
      error_code: "WECHAT_PAY_QUERY_FAILED",
      error_message: "充值过期收敛执行失败",
    }));
    expect(JSON.stringify(failureEntry)).not.toContain("secret");
    expect(JSON.stringify(failureEntry)).not.toContain("transaction body");
    expect(Object.keys(failureEntry ?? {}).sort()).toEqual([
      "duration_ms",
      "error_code",
      "error_message",
      "level",
      "message",
      "service",
      "time",
    ]);
  });

  test("graceful stop waits for an active tick to finish", async () => {
    const deferred = createDeferred<ExpirationTelemetry>();
    const harness = await createWorkerHarness({ implementation: () => deferred.promise });
    let stopResolved = false;

    const activeTick = harness.worker.tick();
    await Promise.resolve();
    const stopping = harness.worker.stop("SIGTERM").then(() => {
      stopResolved = true;
    });
    await Promise.resolve();

    expect(stopResolved).toBe(false);
    expect(harness.entries).toContainEqual(expect.objectContaining({
      level: "warn",
      message: "received SIGTERM",
    }));
    expect(harness.entries).toContainEqual(expect.objectContaining({
      level: "info",
      message: "waiting for running tick before shutdown",
    }));

    deferred.resolve(emptyTelemetry());
    await Promise.all([activeTick, stopping]);
    expect(stopResolved).toBe(true);
  });
});

type ExpirationTelemetry = {
  claimed: number;
  paid: number;
  closed: number;
  retried: number;
  failed: number;
  release_failed: number;
};

type LogEntry = {
  level: "info" | "warn" | "error";
  service: string;
  message: string;
  [key: string]: unknown;
};

function emptyTelemetry(): ExpirationTelemetry {
  return {
    claimed: 0,
    paid: 0,
    closed: 0,
    retried: 0,
    failed: 0,
    release_failed: 0,
  };
}

async function createWorkerHarness(input: {
  environment?: Record<string, string | undefined>;
  result?: ExpirationTelemetry;
  implementation?: () => Promise<ExpirationTelemetry>;
} = {}) {
  const { createBillingRechargeExpirationWorker } = await loadWorkerModule();
  const entries: LogEntry[] = [];
  const runExpiredOrderChecks = mock(
    input.implementation ?? (async () => input.result ?? emptyTelemetry()),
  );
  const worker = createBillingRechargeExpirationWorker({
    service: { runExpiredOrderChecks },
    environment: input.environment ?? {},
    now: () => 1_000,
    logger: (entry) => entries.push(entry),
  });
  return { entries, runExpiredOrderChecks, worker };
}

async function loadWorkerModule() {
  return import("./billing-recharge-expiration-worker");
}

function createDeferred<Result>() {
  let resolvePromise: (value: Result) => void = () => undefined;
  const promise = new Promise<Result>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function captureEnvironment(): WorkerEnvironment {
  return Object.fromEntries(
    WORKER_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as WorkerEnvironment;
}

function restoreEnvironment(environment: WorkerEnvironment): void {
  for (const key of WORKER_ENV_KEYS) {
    const value = environment[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
