import { describe, expect, test } from "bun:test";

import {
  createReconciliationClaim,
  createReconciliationHarness,
} from "./branding-virtual-payment-reconciliation.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const LEASE_EXPIRES_AT = "2026-08-01T02:01:00.000Z";
const SAFE_NOW = new Date("2026-08-01T02:00:29.000Z");
const LOW_BUDGET_NOW = new Date("2026-08-01T02:00:31.001Z");

describe("BrandingVirtualPaymentReconciliationService lease checkpoints", () => {
  test("does not query after token and secret preparation consumes the budget", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const token = deferred<string>();
    let now = SAFE_NOW;
    const dependencies = createReconciliationHarness([
      createReconciliationClaim({
        reconcile_claim_expires_at: LEASE_EXPIRES_AT,
      }),
    ]);
    dependencies.accessTokenProvider.getAccessToken.mockImplementation(
      async () => token.promise,
    );
    const service = new BrandingVirtualPaymentReconciliationService({
      ...dependencies,
      nowFactory: () => now,
    });

    const reconciliation = service.reconcile({ batchSize: 20 });
    await flushMicrotasks();
    expect(dependencies.accessTokenProvider.getAccessToken)
      .toHaveBeenCalledTimes(1);
    now = LOW_BUDGET_NOW;
    token.resolve("access-token");
    const result = await reconciliation;

    expect(dependencies.gateway.queryOrder).not.toHaveBeenCalled();
    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledWith(expect.objectContaining({
        errorCode: "BRANDING_VIRTUAL_RECONCILIATION_LEASE_BUDGET_LOW",
      }));
    expect(result).toMatchObject({ failed: 1 });
  });

  test("does not confirm after query preparation consumes the budget", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const prepared = deferred<boolean>();
    let now = SAFE_NOW;
    const dependencies = createReconciliationHarness([
      createReconciliationClaim({
        reconcile_claim_expires_at: LEASE_EXPIRES_AT,
      }),
    ]);
    dependencies.repository.prepareSuccessfulQueryReconciliation
      .mockImplementation(async () => prepared.promise);
    const service = new BrandingVirtualPaymentReconciliationService({
      ...dependencies,
      nowFactory: () => now,
    });

    const reconciliation = service.reconcile({ batchSize: 20 });
    await flushMicrotasks();
    expect(dependencies.repository.prepareSuccessfulQueryReconciliation)
      .toHaveBeenCalledTimes(1);
    now = LOW_BUDGET_NOW;
    prepared.resolve(true);
    const result = await reconciliation;

    expect(dependencies.confirmation.confirm).not.toHaveBeenCalled();
    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledWith(expect.objectContaining({
        errorCode: "BRANDING_VIRTUAL_RECONCILIATION_LEASE_BUDGET_LOW",
        officialStatus: 2,
      }));
    expect(result).toMatchObject({ failed: 1 });
  });

  test("does not notify delivery after token preparation consumes the budget", async () => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    const token = deferred<string>();
    let now = SAFE_NOW;
    const dependencies = createReconciliationHarness([
      createReconciliationClaim({
        provider_order_no: "wechat-order-1",
        payment_status: "succeeded",
        fulfillment_status: "granted",
        provider_delivery_status: "pending",
        provider_delivery_attempt_key: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        reconcile_claim_expires_at: LEASE_EXPIRES_AT,
      }),
    ]);
    dependencies.accessTokenProvider.getAccessToken.mockImplementation(
      async () => token.promise,
    );
    const service = new BrandingVirtualPaymentReconciliationService({
      ...dependencies,
      nowFactory: () => now,
    });

    const reconciliation = service.reconcile({ batchSize: 20 });
    await flushMicrotasks();
    expect(dependencies.accessTokenProvider.getAccessToken)
      .toHaveBeenCalledTimes(1);
    now = LOW_BUDGET_NOW;
    token.resolve("access-token");
    const result = await reconciliation;

    expect(dependencies.gateway.notifyProvideGoods).not.toHaveBeenCalled();
    expect(dependencies.repository.markReconciliationDelivery)
      .not.toHaveBeenCalled();
    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledWith(expect.objectContaining({
        errorCode: "BRANDING_VIRTUAL_RECONCILIATION_LEASE_BUDGET_LOW",
      }));
    expect(result).toMatchObject({ failed: 1 });
  });

  test.each([
    {
      branch: "query checkpoint",
      claim: createReconciliationClaim({
        reconcile_last_provider_status: 3,
        reconcile_completion_kind: "query",
        reconcile_query_provider_order_no: "wechat-order-1",
        reconcile_query_transaction_id: "wechat-pay-order-1",
        reconcile_query_paid_amount_fen: 100,
        reconcile_query_paid_at: "2026-08-01T01:01:00.000Z",
        reconcile_claim_expires_at: LEASE_EXPIRES_AT,
      }),
    },
    {
      branch: "grant recovery",
      claim: createReconciliationClaim({
        provider_order_no: "wechat-order-1",
        transaction_id: "wechat-pay-order-1",
        payment_status: "succeeded",
        fulfillment_status: "grant_failed",
        paid_amount_fen: 100,
        paid_at: "2026-08-01T01:01:00.000Z",
        reconcile_completion_kind: "grant_recovery",
        reconcile_claim_expires_at: LEASE_EXPIRES_AT,
      }),
    },
  ])("rechecks the lease before $branch confirmation", async ({ claim }) => {
    const { BrandingVirtualPaymentReconciliationService } = await import(
      "./branding-virtual-payment-reconciliation"
    );
    let clockRead = 0;
    const dependencies = createReconciliationHarness([claim]);
    const service = new BrandingVirtualPaymentReconciliationService({
      ...dependencies,
      nowFactory: () => {
        clockRead += 1;
        return clockRead === 1 ? SAFE_NOW : LOW_BUDGET_NOW;
      },
    });

    const result = await service.reconcile({ batchSize: 20 });

    expect(dependencies.confirmation.confirm).not.toHaveBeenCalled();
    expect(dependencies.repository.rescheduleReconciliation)
      .toHaveBeenCalledWith(expect.objectContaining({
        errorCode: "BRANDING_VIRTUAL_RECONCILIATION_LEASE_BUDGET_LOW",
      }));
    expect(result).toMatchObject({ failed: 1 });
  });
});

function deferred<T>() {
  let resolve = (_value: T): void => {};
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}
