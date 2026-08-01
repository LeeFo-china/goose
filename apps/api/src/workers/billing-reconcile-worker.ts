import { setTimeout as sleep } from "node:timers/promises";
import {
  billingSubscriptionService,
  type BillingDueCheckResult,
} from "@/services/billing-subscriptions";
import {
  billingRechargeRefundReconciliationService,
  type RefundReconciliationSummary,
} from "@/services/billing-recharge-refund-reconciliation";
import type { BillingRechargeExpirationTelemetry } from "@/services/billing-recharge-expiration";
import type { BrandingAddonExpirationTelemetry } from "@/services/branding-addon-expiration";
import type {
  BrandingVirtualReconciliationTelemetry,
} from "@/services/branding-virtual-payment-reconciliation";
import { markBillingReconcileWorkerHealthy } from "@/workers/billing-reconcile-worker-health";

const DEFAULT_INTERVAL_MS = 60_000;
const MIN_INTERVAL_MS = 10_000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_RECHARGE_EXPIRATION_BATCH_SIZE = 50;
const DEFAULT_BRANDING_ADDON_EXPIRATION_BATCH_SIZE = 50;
const DEFAULT_BRANDING_VIRTUAL_PAYMENT_RECONCILE_BATCH_SIZE = 20;
const DEFAULT_REFUND_BATCH_SIZE = 20;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 100;

export type BillingReconcileWorkerConfig = {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  rechargeExpirationBatchSize: number;
  brandingAddonExpirationBatchSize: number;
  brandingVirtualPaymentBatchSize: number;
  refundBatchSize: number;
};

type WorkerLogger = (
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
) => void;

type BillingReconcileWorkerDependencies = {
  subscriptionService?: {
    runDueChecks(input: { batchSize: number }): Promise<BillingDueCheckResult>;
  };
  rechargeExpirationService?: {
    runExpiredOrderChecks(input: {
      batchSize: number;
    }): Promise<BillingRechargeExpirationTelemetry>;
  };
  brandingAddonExpirationService?: {
    runExpiredOrderChecks(input: {
      batchSize: number;
    }): Promise<BrandingAddonExpirationTelemetry>;
  };
  brandingVirtualPaymentReconciliationService?: {
    reconcile(input: {
      batchSize: number;
    }): Promise<BrandingVirtualReconciliationTelemetry>;
  };
  refundReconciliationService?: {
    runBatch(input: { limit: number }): Promise<RefundReconciliationSummary>;
  };
  logger?: WorkerLogger;
  healthEvidence?: { markHealthy(): Promise<void> };
};

type ChildResult<Result> =
  | { status: "fulfilled"; result: Result }
  | { status: "rejected" };

type FulfilledChildResult<Result> = {
  status: "fulfilled";
  result: Result;
};

type BillingReconcileTickResults = {
  subscription: ChildResult<ReturnType<typeof summarizeSubscriptionResult>>;
  rechargeExpiration: ChildResult<
    ReturnType<typeof summarizeRechargeExpirationResult>
  >;
  brandingAddonExpiration: ChildResult<
    ReturnType<typeof summarizeBrandingAddonExpirationResult>
  >;
  brandingVirtualPayment: ChildResult<
    ReturnType<typeof summarizeBrandingVirtualPaymentResult>
  >;
  refund: ChildResult<ReturnType<typeof summarizeRefundResult>>;
};

type SuccessfulBillingReconcileTickResults = {
  subscription: FulfilledChildResult<
    ReturnType<typeof summarizeSubscriptionResult>
  >;
  rechargeExpiration: FulfilledChildResult<
    ReturnType<typeof summarizeRechargeExpirationResult>
  >;
  brandingAddonExpiration: FulfilledChildResult<
    ReturnType<typeof summarizeBrandingAddonExpirationResult>
  >;
  brandingVirtualPayment: FulfilledChildResult<
    ReturnType<typeof summarizeBrandingVirtualPaymentResult>
  >;
  refund: FulfilledChildResult<ReturnType<typeof summarizeRefundResult>>;
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
    rechargeExpirationBatchSize: parseNumberEnv(
      "BILLING_RECHARGE_EXPIRATION_BATCH_SIZE",
      DEFAULT_RECHARGE_EXPIRATION_BATCH_SIZE,
      MIN_BATCH_SIZE,
      MAX_BATCH_SIZE,
    ),
    brandingAddonExpirationBatchSize: parseNumberEnv(
      "BILLING_BRANDING_ADDON_EXPIRATION_BATCH_SIZE",
      DEFAULT_BRANDING_ADDON_EXPIRATION_BATCH_SIZE,
      MIN_BATCH_SIZE,
      MAX_BATCH_SIZE,
    ),
    brandingVirtualPaymentBatchSize: parseNumberEnv(
      "BILLING_BRANDING_VIRTUAL_PAYMENT_RECONCILE_BATCH_SIZE",
      DEFAULT_BRANDING_VIRTUAL_PAYMENT_RECONCILE_BATCH_SIZE,
      MIN_BATCH_SIZE,
      MAX_BATCH_SIZE,
    ),
    refundBatchSize: parseNumberEnv(
      "BILLING_REFUND_RECONCILE_BATCH_SIZE",
      DEFAULT_REFUND_BATCH_SIZE,
      MIN_BATCH_SIZE,
      MAX_BATCH_SIZE,
    ),
  };
}

export async function tick(
  dependencies: BillingReconcileWorkerDependencies = {},
): Promise<void> {
  const logger = dependencies.logger ?? log;
  if (running) {
    logger("warn", "previous tick still running");
    return;
  }

  const config = getWorkerConfig();
  if (!config.enabled) {
    logger("info", "worker disabled");
    return;
  }

  running = true;
  const startedAt = Date.now();
  const subscriptionService = dependencies.subscriptionService ??
    billingSubscriptionService;
  const refundReconciliationService =
    dependencies.refundReconciliationService ??
      billingRechargeRefundReconciliationService;

  try {
    const subscription = await runChild(
      () => subscriptionService.runDueChecks({ batchSize: config.batchSize }),
      summarizeSubscriptionResult,
    );
    const rechargeExpiration = await runChild(
      async () => {
        const service = dependencies.rechargeExpirationService ??
          await loadDefaultRechargeExpirationService();
        return service.runExpiredOrderChecks({
          batchSize: config.rechargeExpirationBatchSize,
        });
      },
      summarizeRechargeExpirationResult,
    );
    const brandingAddonExpiration = await runChild(
      async () => {
        const service = dependencies.brandingAddonExpirationService ??
          await loadDefaultBrandingAddonExpirationService();
        return service.runExpiredOrderChecks({
          batchSize: config.brandingAddonExpirationBatchSize,
        });
      },
      summarizeBrandingAddonExpirationResult,
    );
    const brandingVirtualPayment = await runChild(
      async () => {
        const service =
          dependencies.brandingVirtualPaymentReconciliationService ??
            await loadDefaultBrandingVirtualPaymentReconciliationService();
        return service.reconcile({
          batchSize: config.brandingVirtualPaymentBatchSize,
        });
      },
      summarizeBrandingVirtualPaymentResult,
    );
    const refund = await runChild(
      () => refundReconciliationService.runBatch({
        limit: config.refundBatchSize,
      }),
      summarizeRefundResult,
    );
    const tickResults = {
      subscription,
      rechargeExpiration,
      brandingAddonExpiration,
      brandingVirtualPayment,
      refund,
    };
    const childrenSucceeded = isSuccessfulBillingReconcileTick(tickResults);
    let healthEvidenceFailed = false;
    if (childrenSucceeded) {
      try {
        const healthEvidence = dependencies.healthEvidence ?? {
          markHealthy: markBillingReconcileWorkerHealthy,
        };
        await healthEvidence.markHealthy();
      } catch {
        healthEvidenceFailed = true;
      }
    }

    const tickFailed = !childrenSucceeded || healthEvidenceFailed;
    logger(tickFailed ? "error" : "info", tickFailed
      ? "tick completed with errors"
      : "tick completed", {
      duration_ms: Date.now() - startedAt,
      result: {
        subscription,
        recharge_expiration: rechargeExpiration,
        branding_addon_expiration: brandingAddonExpiration,
        branding_virtual_payment: brandingVirtualPayment,
        refund,
      },
      ...(healthEvidenceFailed
        ? { error_code: "BILLING_RECONCILE_HEALTH_WRITE_FAILED" }
        : {}),
    });
  } finally {
    running = false;
  }
}

function isSuccessfulBillingReconcileTick(
  results: BillingReconcileTickResults,
): results is SuccessfulBillingReconcileTickResults {
  if (
    results.subscription.status !== "fulfilled" ||
    results.rechargeExpiration.status !== "fulfilled" ||
    results.brandingAddonExpiration.status !== "fulfilled" ||
    results.brandingVirtualPayment.status !== "fulfilled" ||
    results.refund.status !== "fulfilled"
  ) {
    return false;
  }

  return results.subscription.result.error_count === 0 &&
    results.rechargeExpiration.result.failed === 0 &&
    results.rechargeExpiration.result.release_failed === 0 &&
    results.brandingAddonExpiration.result.failed === 0 &&
    results.brandingAddonExpiration.result.release_failed === 0 &&
    results.brandingVirtualPayment.result.failed === 0 &&
    results.refund.result.failed === 0;
}

async function runChild<Result, Summary>(
  operation: () => Promise<Result>,
  summarize: (result: Result) => Summary,
): Promise<ChildResult<Summary>> {
  try {
    return { status: "fulfilled", result: summarize(await operation()) };
  } catch {
    return { status: "rejected" };
  }
}

function summarizeSubscriptionResult(result: BillingDueCheckResult) {
  return {
    ensured: result.ensured,
    reminded: result.reminded,
    charged: result.charged,
    locked: result.locked,
    skipped: result.skipped,
    error_count: result.errors.length,
  };
}

function summarizeRefundResult(result: RefundReconciliationSummary) {
  return {
    claimed: result.claimed,
    success: result.success,
    processing: result.processing,
    closed: result.closed,
    abnormal: result.abnormal,
    rescheduled: result.rescheduled,
    failed: result.failed,
  };
}

function summarizeRechargeExpirationResult(
  result: BillingRechargeExpirationTelemetry,
) {
  return {
    claimed: result.claimed,
    paid: result.paid,
    closed: result.closed,
    retried: result.retried,
    failed: result.failed,
    release_failed: result.release_failed,
  };
}

function summarizeBrandingAddonExpirationResult(
  result: BrandingAddonExpirationTelemetry,
) {
  return {
    claimed: result.claimed,
    paid: result.paid,
    closed: result.closed,
    retried: result.retried,
    failed: result.failed,
    release_failed: result.release_failed,
  };
}

function summarizeBrandingVirtualPaymentResult(
  result: BrandingVirtualReconciliationTelemetry,
) {
  return {
    claimed: result.claimed,
    queried: result.queried,
    confirmed: result.confirmed,
    closed: result.closed,
    failed: result.failed,
    grant_recovered: result.grantRecovered,
  };
}

async function loadDefaultRechargeExpirationService() {
  const { billingRechargeExpirationService } = await import(
    "@/services/billing-recharge-expiration"
  );
  return billingRechargeExpirationService;
}

async function loadDefaultBrandingAddonExpirationService() {
  const { brandingAddonExpirationService } = await import(
    "@/services/branding-addon-expiration"
  );
  return brandingAddonExpirationService;
}

async function loadDefaultBrandingVirtualPaymentReconciliationService() {
  const { brandingVirtualPaymentReconciliationService } = await import(
    "@/services/branding-virtual-payment-reconciliation"
  );
  return brandingVirtualPaymentReconciliationService;
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
