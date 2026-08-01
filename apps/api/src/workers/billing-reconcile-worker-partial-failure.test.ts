import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { BillingDueCheckResult } from "@/services/billing-subscriptions";

import { BRANDING_VIRTUAL_PAYMENT_RESULT } from "./billing-reconcile-worker-test-fixtures";

const SUBSCRIPTION_RESULT: BillingDueCheckResult = {
  ensured: 1,
  reminded: 2,
  charged: 3,
  locked: 4,
  skipped: 5,
  errors: [],
};

const RECHARGE_EXPIRATION_RESULT = {
  claimed: 3,
  paid: 1,
  closed: 1,
  retried: 1,
  failed: 0,
  release_failed: 0,
};

const BRANDING_ADDON_EXPIRATION_RESULT = {
  claimed: 2,
  paid: 1,
  closed: 1,
  retried: 0,
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

describe("billing reconcile worker partial failures", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL ??= "http://localhost:54321";
    process.env.SUPABASE_PUBLISH ??= "test-publish-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
    delete process.env.BILLING_RECONCILE_WORKER_ENABLED;
  });

  test("does not refresh health when subscriptions resolve with errors", async () => {
    const result = await runTick({
      subscription: {
        ...SUBSCRIPTION_RESULT,
        errors: ["distinctive subscription secret"],
      },
    });

    assertEveryChildExecuted(result);
    expect(result.markHealthy).not.toHaveBeenCalled();
    expect(result.logger).toHaveBeenCalledWith(
      "error",
      "tick completed with errors",
      expect.objectContaining({
        result: expect.objectContaining({
          subscription: {
            status: "fulfilled",
            result: expect.objectContaining({ error_count: 1 }),
          },
        }),
      }),
    );
    assertSafeScalarLog(result.logger, ["\"error_count\":1"], [
      "distinctive subscription secret",
    ]);
  });

  test("does not refresh health when expiration resolves with failed items", async () => {
    const result = await runTick({
      expiration: {
        ...RECHARGE_EXPIRATION_RESULT,
        failed: 1,
        raw_secret: "distinctive expiration failed secret",
      },
    });

    assertEveryChildExecuted(result);
    expect(result.markHealthy).not.toHaveBeenCalled();
    expect(result.logger).toHaveBeenCalledWith(
      "error",
      "tick completed with errors",
      expect.objectContaining({
        result: expect.objectContaining({
          recharge_expiration: {
            status: "fulfilled",
            result: expect.objectContaining({ failed: 1, release_failed: 0 }),
          },
        }),
      }),
    );
    assertSafeScalarLog(result.logger, ["\"failed\":1"], [
      "distinctive expiration failed secret",
      "raw_secret",
    ]);
  });

  test("does not refresh health when expiration resolves with release failures", async () => {
    const result = await runTick({
      expiration: {
        ...RECHARGE_EXPIRATION_RESULT,
        release_failed: 1,
        release_failures: [{
          order_id: "order-secret",
          diagnostic: "distinctive release failure secret",
        }],
      },
    });

    assertEveryChildExecuted(result);
    expect(result.markHealthy).not.toHaveBeenCalled();
    expect(result.logger).toHaveBeenCalledWith(
      "error",
      "tick completed with errors",
      expect.objectContaining({
        result: expect.objectContaining({
          recharge_expiration: {
            status: "fulfilled",
            result: expect.objectContaining({ failed: 0, release_failed: 1 }),
          },
        }),
      }),
    );
    assertSafeScalarLog(result.logger, ["\"release_failed\":1"], [
      "distinctive release failure secret",
      "order-secret",
      "release_failures",
    ]);
  });

  test("does not refresh health when refunds resolve with failed items", async () => {
    const result = await runTick({
      refund: {
        ...REFUND_RESULT,
        failed: 1,
        raw_secret: "distinctive refund failed secret",
      },
    });

    assertEveryChildExecuted(result);
    expect(result.markHealthy).not.toHaveBeenCalled();
    expect(result.logger).toHaveBeenCalledWith(
      "error",
      "tick completed with errors",
      expect.objectContaining({
        result: expect.objectContaining({
          refund: {
            status: "fulfilled",
            result: expect.objectContaining({ failed: 1 }),
          },
        }),
      }),
    );
    assertSafeScalarLog(result.logger, ["\"failed\":1"], [
      "distinctive refund failed secret",
      "raw_secret",
    ]);
  });

  test("refreshes health after a later all-zero fulfilled tick", async () => {
    let refundTick = 0;
    const subscriptionService = {
      runDueChecks: mock(async () => SUBSCRIPTION_RESULT),
    };
    const rechargeExpirationService = {
      runExpiredOrderChecks: mock(async () => RECHARGE_EXPIRATION_RESULT),
    };
    const brandingAddonExpirationService = {
      runExpiredOrderChecks: mock(async () => BRANDING_ADDON_EXPIRATION_RESULT),
    };
    const brandingVirtualPaymentReconciliationService = {
      reconcile: mock(async () => BRANDING_VIRTUAL_PAYMENT_RESULT),
    };
    const refundReconciliationService = {
      runBatch: mock(async () => ({
        ...REFUND_RESULT,
        failed: refundTick++ === 0 ? 1 : 0,
      })),
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
    expect(markHealthy).not.toHaveBeenCalled();

    await tick(dependencies);
    expect(markHealthy).toHaveBeenCalledTimes(1);
    expect(subscriptionService.runDueChecks).toHaveBeenCalledTimes(2);
    expect(rechargeExpirationService.runExpiredOrderChecks).toHaveBeenCalledTimes(2);
    expect(brandingAddonExpirationService.runExpiredOrderChecks)
      .toHaveBeenCalledTimes(2);
    expect(refundReconciliationService.runBatch).toHaveBeenCalledTimes(2);
    expect(logger).toHaveBeenNthCalledWith(
      1,
      "error",
      "tick completed with errors",
      expect.anything(),
    );
    expect(logger).toHaveBeenNthCalledWith(
      2,
      "info",
      "tick completed",
      expect.anything(),
    );
  });
});

type TickOverrides = {
  subscription?: typeof SUBSCRIPTION_RESULT & Record<string, unknown>;
  expiration?: typeof RECHARGE_EXPIRATION_RESULT & Record<string, unknown>;
  refund?: typeof REFUND_RESULT & Record<string, unknown>;
};

async function runTick(overrides: TickOverrides) {
  const subscriptionService = {
    runDueChecks: mock(async () => overrides.subscription ?? SUBSCRIPTION_RESULT),
  };
  const rechargeExpirationService = {
    runExpiredOrderChecks: mock(async () =>
      overrides.expiration ?? RECHARGE_EXPIRATION_RESULT
    ),
  };
  const brandingAddonExpirationService = {
    runExpiredOrderChecks: mock(async () => BRANDING_ADDON_EXPIRATION_RESULT),
  };
  const brandingVirtualPaymentReconciliationService = {
    reconcile: mock(async () => BRANDING_VIRTUAL_PAYMENT_RESULT),
  };
  const refundReconciliationService = {
    runBatch: mock(async () => overrides.refund ?? REFUND_RESULT),
  };
  const markHealthy = mock(async () => {});
  const logger = mock(() => {});
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

  return {
    subscriptionService,
    rechargeExpirationService,
    brandingAddonExpirationService,
    brandingVirtualPaymentReconciliationService,
    refundReconciliationService,
    markHealthy,
    logger,
  };
}

function assertEveryChildExecuted(result: Awaited<ReturnType<typeof runTick>>): void {
  expect(result.subscriptionService.runDueChecks).toHaveBeenCalledTimes(1);
  expect(result.rechargeExpirationService.runExpiredOrderChecks)
    .toHaveBeenCalledTimes(1);
  expect(result.brandingAddonExpirationService.runExpiredOrderChecks)
    .toHaveBeenCalledTimes(1);
  expect(result.brandingVirtualPaymentReconciliationService.reconcile)
    .toHaveBeenCalledTimes(1);
  expect(result.refundReconciliationService.runBatch).toHaveBeenCalledTimes(1);
}

function assertSafeScalarLog(
  logger: ReturnType<typeof mock>,
  expected: string[],
  forbidden: string[],
): void {
  const logged = JSON.stringify(logger.mock.calls);
  for (const value of expected) expect(logged).toContain(value);
  for (const value of forbidden) expect(logged).not.toContain(value);
}
