import { beforeEach, describe, expect, mock, test } from "bun:test";

import { createBrandingVirtualPaymentService } from "./billing-reconcile-worker-test-fixtures";

const SUBSCRIPTION_RESULT = {
  ensured: 1,
  reminded: 2,
  charged: 3,
  locked: 4,
  skipped: 5,
  errors: [],
};
const EXPIRATION_RESULT = {
  claimed: 1,
  paid: 0,
  closed: 1,
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

describe("billing reconcile worker branding add-on child", () => {
  beforeEach(() => {
    process.env.SUPABASE_URL ??= "http://localhost:54321";
    process.env.SUPABASE_PUBLISH ??= "test-publish-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
    delete process.env.BILLING_RECONCILE_WORKER_ENABLED;
    delete process.env.BILLING_BRANDING_ADDON_EXPIRATION_BATCH_SIZE;
  });

  test("clamps the independent batch size to 1 through 100", async () => {
    const { getWorkerConfig } = await import("./billing-reconcile-worker");
    process.env.BILLING_BRANDING_ADDON_EXPIRATION_BATCH_SIZE = "0";
    expect(getWorkerConfig().brandingAddonExpirationBatchSize).toBe(1);
    process.env.BILLING_BRANDING_ADDON_EXPIRATION_BATCH_SIZE = "500";
    expect(getWorkerConfig().brandingAddonExpirationBatchSize).toBe(100);
  });

  test("runs later children and logs no raw error when the add-on child rejects", async () => {
    const refundReconciliationService = {
      runBatch: mock(async () => REFUND_RESULT),
    };
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      subscriptionService: {
        runDueChecks: mock(async () => SUBSCRIPTION_RESULT),
      },
      rechargeExpirationService: {
        runExpiredOrderChecks: mock(async () => EXPIRATION_RESULT),
      },
      brandingAddonExpirationService: {
        runExpiredOrderChecks: mock(async () => {
          throw new Error("addon expiration secret must not be logged");
        }),
      },
      brandingVirtualPaymentReconciliationService:
        createBrandingVirtualPaymentService(),
      refundReconciliationService,
      logger,
    });

    expect(refundReconciliationService.runBatch).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).toContain(
      '"branding_addon_expiration":{"status":"rejected"}',
    );
    expect(logged).toContain('"refund":{"status":"fulfilled"');
    expect(logged).not.toContain("addon expiration secret must not be logged");
  });

  test("does not refresh health when the add-on child reports failures", async () => {
    const markHealthy = mock(async () => {});
    const logger = mock(() => {});
    const { tick } = await import("./billing-reconcile-worker");

    await tick({
      subscriptionService: {
        runDueChecks: mock(async () => SUBSCRIPTION_RESULT),
      },
      rechargeExpirationService: {
        runExpiredOrderChecks: mock(async () => EXPIRATION_RESULT),
      },
      brandingAddonExpirationService: {
        runExpiredOrderChecks: mock(async () => ({
          ...EXPIRATION_RESULT,
          failed: 1,
        })),
      },
      brandingVirtualPaymentReconciliationService:
        createBrandingVirtualPaymentService(),
      refundReconciliationService: {
        runBatch: mock(async () => REFUND_RESULT),
      },
      healthEvidence: { markHealthy },
      logger,
    });

    expect(markHealthy).not.toHaveBeenCalled();
    expect(logger).toHaveBeenCalledWith(
      "error",
      "tick completed with errors",
      expect.any(Object),
    );
  });
});
