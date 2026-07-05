import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("billing reconcile worker source", () => {
  test("wires subscription due checks and bounded worker config", () => {
    const source = readFileSync(
      join(import.meta.dir, "billing-reconcile-worker.ts"),
      "utf8",
    );

    expect(source).toContain("billingSubscriptionService.runDueChecks");
    expect(source).toContain("BILLING_RECONCILE_INTERVAL_MS");
    expect(source).toContain("BILLING_RECONCILE_BATCH_SIZE");
    expect(source).toContain("tick completed");
    expect(source).toContain("billing-reconcile-worker");
    expect(source).toContain("import.meta.main");
  });
});

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
  });

  afterEach(() => {
    restoreWorkerEnv(previousWorkerEnv);
  });

  test("uses default batch size when env is blank", async () => {
    process.env.BILLING_RECONCILE_BATCH_SIZE = " ";

    const config = await readWorkerConfig();

    expect(config.batchSize).toBe(100);
  });

  test("caps batch size at 100", async () => {
    process.env.BILLING_RECONCILE_BATCH_SIZE = "500";

    const config = await readWorkerConfig();

    expect(config.batchSize).toBe(100);
  });

  test("uses default interval when env is blank", async () => {
    process.env.BILLING_RECONCILE_INTERVAL_MS = "";

    const config = await readWorkerConfig();

    expect(config.intervalMs).toBe(60_000);
  });

  test("clamps interval to 10000 minimum", async () => {
    process.env.BILLING_RECONCILE_INTERVAL_MS = "1";

    const config = await readWorkerConfig();

    expect(config.intervalMs).toBe(10_000);
  });
});

const WORKER_ENV_KEYS = [
  "BILLING_RECONCILE_BATCH_SIZE",
  "BILLING_RECONCILE_INTERVAL_MS",
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

function setSupabaseTestEnv(): void {
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_PUBLISH ??= "test-publish-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
}
