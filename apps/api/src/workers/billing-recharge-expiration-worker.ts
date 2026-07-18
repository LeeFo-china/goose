import { setTimeout as sleep } from "node:timers/promises";
import type { BillingRechargeExpirationTelemetry } from "@/services/billing-recharge-expiration";

const SERVICE_NAME = "billing-recharge-expiration-worker";
const DEFAULT_INTERVAL_MS = 10_000;
const MIN_INTERVAL_MS = 1_000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 50;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 100;
const DEFAULT_FAILURE_CODE = "BILLING_RECHARGE_EXPIRATION_TICK_FAILED";
const SAFE_FAILURE_MESSAGE = "充值过期收敛执行失败";
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,99}$/;

type WorkerEnvironment = Readonly<Record<string, string | undefined>>;
type ShutdownSignal = "SIGINT" | "SIGTERM";
type ExpirationServicePort = {
  runExpiredOrderChecks: (
    input: { batchSize: number },
  ) => Promise<BillingRechargeExpirationTelemetry>;
};

export type BillingRechargeExpirationWorkerConfig = {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
};

export type BillingRechargeExpirationWorkerLogEntry = {
  level: "info" | "warn" | "error";
  time: string;
  service: typeof SERVICE_NAME;
  message: string;
  [key: string]: unknown;
};

export type BillingRechargeExpirationWorkerDependencies = {
  service?: ExpirationServicePort;
  loadService?: () => Promise<ExpirationServicePort>;
  environment?: WorkerEnvironment;
  logger?: (entry: BillingRechargeExpirationWorkerLogEntry) => void;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type BillingRechargeExpirationWorker = {
  tick: () => Promise<void>;
  run: () => Promise<void>;
  stop: (signal?: ShutdownSignal) => Promise<void>;
};

export function getBillingRechargeExpirationWorkerConfig(
  environment: WorkerEnvironment = process.env,
): BillingRechargeExpirationWorkerConfig {
  return {
    enabled: parseBooleanEnv(
      environment.BILLING_RECHARGE_EXPIRATION_WORKER_ENABLED,
      true,
    ),
    intervalMs: parseNumberEnv(
      environment.BILLING_RECHARGE_EXPIRATION_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
      MIN_INTERVAL_MS,
      MAX_INTERVAL_MS,
    ),
    batchSize: parseNumberEnv(
      environment.BILLING_RECHARGE_EXPIRATION_BATCH_SIZE,
      DEFAULT_BATCH_SIZE,
      MIN_BATCH_SIZE,
      MAX_BATCH_SIZE,
    ),
  };
}

export function createBillingRechargeExpirationWorker(
  dependencies: BillingRechargeExpirationWorkerDependencies = {},
): BillingRechargeExpirationWorker {
  const injectedService = dependencies.service;
  const serviceLoader = dependencies.loadService ?? (
    injectedService
      ? async () => injectedService
      : loadDefaultExpirationService
  );
  const environment = dependencies.environment ?? process.env;
  const logger = dependencies.logger ?? writeJsonLog;
  const now = dependencies.now ?? Date.now;
  const sleepFor = dependencies.sleep ?? sleep;
  let stopping = false;
  let activeTick: Promise<void> | null = null;
  let resolvedService: ExpirationServicePort | null = injectedService ?? null;
  let runLoopActive = false;
  let shutdownPromise: Promise<void> | null = null;

  const loadService = async (): Promise<ExpirationServicePort> => {
    if (resolvedService) return resolvedService;
    const service = await serviceLoader();
    resolvedService = service;
    return service;
  };

  const log = (
    level: BillingRechargeExpirationWorkerLogEntry["level"],
    message: string,
    meta?: Record<string, unknown>,
  ): void => {
    logger({
      level,
      time: new Date(now()).toISOString(),
      service: SERVICE_NAME,
      message,
      ...(meta ?? {}),
    });
  };

  const tick = async (): Promise<void> => {
    if (activeTick) {
      log("warn", "previous tick still running");
      return;
    }
    if (stopping) {
      log("warn", "worker stopping");
      return;
    }

    const config = getBillingRechargeExpirationWorkerConfig(environment);
    if (!config.enabled) {
      log("info", "worker disabled");
      return;
    }

    const startedAt = now();
    const operation = executeTick({
      batchSize: config.batchSize,
      loadService,
      now,
      startedAt,
      log,
    });
    activeTick = operation;
    try {
      await operation;
    } finally {
      if (activeTick === operation) activeTick = null;
    }
  };

  const stop = (signal?: ShutdownSignal): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    const pending = activeTick;
    shutdownPromise = (async () => {
      if (signal) log("warn", `received ${signal}`);
      if (!pending) return;
      log("info", "waiting for running tick before shutdown");
      await pending;
    })();
    return shutdownPromise;
  };

  const run = async (): Promise<void> => {
    if (runLoopActive) {
      log("warn", "worker already running");
      return;
    }
    runLoopActive = true;
    const onSigint = (): void => {
      void stop("SIGINT");
    };
    const onSigterm = (): void => {
      void stop("SIGTERM");
    };
    try {
      process.on("SIGINT", onSigint);
      process.on("SIGTERM", onSigterm);
      log("info", "worker started", getBillingRechargeExpirationWorkerConfig(environment));
      while (!stopping) {
        await tick();
        if (stopping) break;
        await sleepUntilNextTick({
          intervalMs: getBillingRechargeExpirationWorkerConfig(environment).intervalMs,
          isStopping: () => stopping,
          now,
          sleepFor,
        });
      }
      await stop();
      log("info", "worker stopped");
    } finally {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      runLoopActive = false;
    }
  };

  return { tick, run, stop };
}

async function executeTick(input: {
  batchSize: number;
  loadService: () => Promise<ExpirationServicePort>;
  now: () => number;
  startedAt: number;
  log: (
    level: BillingRechargeExpirationWorkerLogEntry["level"],
    message: string,
    meta?: Record<string, unknown>,
  ) => void;
}): Promise<void> {
  try {
    const service = await input.loadService();
    const telemetry = await service.runExpiredOrderChecks({
      batchSize: input.batchSize,
    });
    input.log("info", "tick completed", {
      duration_ms: Math.max(0, input.now() - input.startedAt),
      telemetry: safeTelemetry(telemetry),
    });
  } catch (error) {
    input.log("error", "tick failed", {
      duration_ms: Math.max(0, input.now() - input.startedAt),
      ...safeErrorFields(error),
    });
  }
}

async function loadDefaultExpirationService(): Promise<ExpirationServicePort> {
  const { billingRechargeExpirationService } = await import(
    "@/services/billing-recharge-expiration"
  );
  return billingRechargeExpirationService;
}

async function sleepUntilNextTick(input: {
  intervalMs: number;
  isStopping: () => boolean;
  now: () => number;
  sleepFor: (milliseconds: number) => Promise<void>;
}): Promise<void> {
  const startedAt = input.now();
  while (!input.isStopping()) {
    const elapsedMs = Math.max(0, input.now() - startedAt);
    const remainingMs = input.intervalMs - elapsedMs;
    if (remainingMs <= 0) return;
    await input.sleepFor(Math.min(1_000, remainingMs));
  }
}

function safeTelemetry(
  telemetry: BillingRechargeExpirationTelemetry,
): BillingRechargeExpirationTelemetry {
  return {
    claimed: telemetry.claimed,
    paid: telemetry.paid,
    closed: telemetry.closed,
    retried: telemetry.retried,
    failed: telemetry.failed,
    release_failed: telemetry.release_failed,
  };
}

function parseBooleanEnv(rawValue: string | undefined, fallback: boolean): boolean {
  const value = rawValue?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function parseNumberEnv(
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!rawValue?.trim()) return fallback;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}

function safeErrorFields(error: unknown): {
  error_code: string;
  error_message: string;
} {
  const candidate = typeof error === "object" && error !== null && "code" in error
    ? error.code
    : null;
  const errorCode = typeof candidate === "string" && SAFE_ERROR_CODE.test(candidate)
    ? candidate
    : DEFAULT_FAILURE_CODE;
  return {
    error_code: errorCode,
    error_message: SAFE_FAILURE_MESSAGE,
  };
}

function writeJsonLog(entry: BillingRechargeExpirationWorkerLogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(line);
    return;
  }
  if (entry.level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

if (import.meta.main) {
  createBillingRechargeExpirationWorker().run().catch(() => {
    writeJsonLog({
      level: "error",
      time: new Date().toISOString(),
      service: SERVICE_NAME,
      message: "worker crashed",
      error_code: "BILLING_RECHARGE_EXPIRATION_WORKER_CRASHED",
      error_message: "充值过期收敛任务异常退出",
    });
    process.exitCode = 1;
  });
}
