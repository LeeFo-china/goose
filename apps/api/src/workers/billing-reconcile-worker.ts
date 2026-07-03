import { setTimeout as sleep } from "node:timers/promises";
import { billingSubscriptionService } from "@/services/billing-subscriptions";

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 10_000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 100;

export type BillingReconcileWorkerConfig = {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
};

let stopping = false;
let running = false;

function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    service: "billing-reconcile-worker",
    message,
    ...(meta || {}),
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function parseNumberEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return fallback;

  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.floor(value), max));
}

export function getWorkerConfig(): BillingReconcileWorkerConfig {
  return {
    enabled: parseBooleanEnv("BILLING_RECONCILE_WORKER_ENABLED", true),
    intervalMs: parseNumberEnv(
      "BILLING_RECONCILE_INTERVAL_MS",
      DEFAULT_INTERVAL_MS,
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
    ),
    batchSize: parseNumberEnv(
      "BILLING_RECONCILE_BATCH_SIZE",
      DEFAULT_BATCH_SIZE,
      MIN_BATCH_SIZE,
      MAX_BATCH_SIZE,
    ),
  };
}

export async function tick(): Promise<void> {
  if (running) {
    log("warn", "previous tick still running");
    return;
  }

  const config = getWorkerConfig();
  if (!config.enabled) {
    log("info", "worker disabled");
    return;
  }

  running = true;
  const startedAt = Date.now();

  try {
    const result = await billingSubscriptionService.runDueChecks({
      batchSize: config.batchSize,
    });

    log("info", "tick completed", {
      duration_ms: Date.now() - startedAt,
      result,
    });
  } catch (error) {
    log("error", "tick failed", {
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
}

function registerShutdownSignalHandlers(): void {
  process.on("SIGINT", () => {
    stopping = true;
    log("warn", "received SIGINT");
  });

  process.on("SIGTERM", () => {
    stopping = true;
    log("warn", "received SIGTERM");
  });
}

async function sleepUntilNextTick(intervalMs: number): Promise<void> {
  const startedAt = Date.now();

  while (!stopping) {
    const remainingMs = intervalMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      return;
    }

    await sleep(Math.min(1000, remainingMs));
  }
}

async function main(): Promise<void> {
  registerShutdownSignalHandlers();
  log("info", "worker started", getWorkerConfig());

  while (!stopping) {
    await tick();
    await sleepUntilNextTick(getWorkerConfig().intervalMs);
  }

  while (running) {
    log("info", "waiting for running tick before shutdown");
    await sleep(1000);
  }

  log("info", "worker stopped");
}

if (import.meta.main) {
  main().catch((error) => {
    log("error", "worker crashed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
