import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  BillingSubscriptionRpcResult,
  TenantBillingSubscriptionLockState,
  TenantSubscriptionInvoiceRecord,
} from "@/repositories/billing-subscriptions";

describe("normalizeSubscriptionPageRange", () => {
  test("falls back to page 1 when page is not positive", async () => {
    const { normalizeSubscriptionPageRange } =
      await importBillingSubscriptionRepository();

    expect(
      normalizeSubscriptionPageRange({ page: 0, pageSize: 50 }),
    ).toEqual({
      page: 1,
      pageSize: 50,
      from: 0,
      to: 49,
    });
  });

  test("caps pageSize at 100", async () => {
    const { normalizeSubscriptionPageRange } =
      await importBillingSubscriptionRepository();

    expect(
      normalizeSubscriptionPageRange({ page: 1, pageSize: 101 }),
    ).toEqual({
      page: 1,
      pageSize: 100,
      from: 0,
      to: 99,
    });
  });

  test("calculates page 2 range for pageSize 50", async () => {
    const { normalizeSubscriptionPageRange } =
      await importBillingSubscriptionRepository();

    expect(
      normalizeSubscriptionPageRange({ page: 2, pageSize: 50 }),
    ).toEqual({
      page: 2,
      pageSize: 50,
      from: 50,
      to: 99,
    });
  });

  test("falls back to default pageSize when pageSize is invalid", async () => {
    const { normalizeSubscriptionPageRange } =
      await importBillingSubscriptionRepository();

    expect(
      normalizeSubscriptionPageRange({ page: 1, pageSize: 50.5 }),
    ).toEqual({
      page: 1,
      pageSize: 100,
      from: 0,
      to: 99,
    });
  });
});

describe("BillingSubscriptionService", () => {
  beforeEach(() => {
    for (const item of Object.values(repository)) {
      item.mockClear();
    }

    repository.listInvoicesDueForReminder.mockImplementation(async () => []);
    repository.ensureSubscriptionInvoices.mockImplementation(async () => ({
      created: 0,
      scanned: 0,
    }));
    repository.markInvoiceReminded.mockImplementation(async (invoiceId: string) =>
      invoice(invoiceId)
    );
    repository.listInvoicesDueForCharge.mockImplementation(async () => []);
    repository.chargeInvoice.mockImplementation(async () => ({ charged: true }));
    repository.recoverAfterRecharge.mockImplementation(async () => ({
      recovered: true,
    }));
    repository.getLockStateByTenantId.mockImplementation(async () => unlockedState);
  });

  test("marks upcoming invoice as reminded and records reminder errors", async () => {
    const service = await createService();
    repository.listInvoicesDueForReminder.mockImplementation(async () => [
      invoice("invoice-reminded"),
      invoice("invoice-race-lost"),
      invoice("invoice-reminder-error"),
    ]);
    repository.markInvoiceReminded.mockImplementation(async (invoiceId: string) => {
      if (invoiceId === "invoice-race-lost") {
        return null;
      }
      if (invoiceId === "invoice-reminder-error") {
        throw new Error("reminder update failed");
      }
      return invoice(invoiceId);
    });

    const result = await service.runDueChecks({
      now: fixedNow,
      batchSize: 20,
    });

    expect(repository.listInvoicesDueForReminder).toHaveBeenCalledWith({
      nowIso: fixedNow.toISOString(),
      page: 1,
      pageSize: 20,
    });
    expect(repository.markInvoiceReminded).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      ensured: 0,
      reminded: 1,
      charged: 0,
      locked: 0,
      skipped: 1,
      errors: ["invoice-reminder-error: reminder update failed"],
    });
  });

  test("ensures subscription invoices before reminders and charges", async () => {
    const service = await createService();
    const callOrder: string[] = [];
    repository.ensureSubscriptionInvoices.mockImplementation(async () => {
      callOrder.push("ensure");
      return { created: 2, scanned: 5 };
    });
    repository.listInvoicesDueForReminder.mockImplementation(async () => {
      callOrder.push("reminders");
      return [];
    });
    repository.listInvoicesDueForCharge.mockImplementation(async () => {
      callOrder.push("charges");
      return [];
    });

    const result = await service.runDueChecks({
      now: fixedNow,
      batchSize: 25,
    });

    expect(repository.ensureSubscriptionInvoices).toHaveBeenCalledWith({
      nowIso: fixedNow.toISOString(),
      batchSize: 25,
    });
    expect(callOrder).toEqual(["ensure", "reminders", "charges"]);
    expect(result).toEqual({
      ensured: 2,
      reminded: 0,
      charged: 0,
      locked: 0,
      skipped: 0,
      errors: [],
    });
  });

  test("charges due invoices and counts charged and locked without throwing the batch", async () => {
    const service = await createService();
    repository.listInvoicesDueForCharge.mockImplementation(async () => [
      invoice("invoice-charged"),
      invoice("invoice-locked"),
      invoice("invoice-idempotent"),
      invoice("invoice-error"),
    ]);
    repository.chargeInvoice.mockImplementation(async ({ invoiceId }) => {
      if (invoiceId === "invoice-locked") {
        return { failure_code: "TENANT_CREDITS_INSUFFICIENT" };
      }
      if (invoiceId === "invoice-idempotent") {
        return { idempotent: true };
      }
      if (invoiceId === "invoice-error") {
        throw new Error("rpc unavailable");
      }
      return { charged: true };
    });

    const result = await service.runDueChecks({
      now: fixedNow,
      batchSize: 10,
      operatorUserId: "operator-1",
    });

    expect(repository.listInvoicesDueForCharge).toHaveBeenCalledWith({
      nowIso: fixedNow.toISOString(),
      page: 1,
      pageSize: 10,
    });
    expect(repository.chargeInvoice).toHaveBeenCalledWith({
      invoiceId: "invoice-charged",
      operatorUserId: "operator-1",
    });
    expect(result).toEqual({
      ensured: 0,
      reminded: 0,
      charged: 1,
      locked: 1,
      skipped: 1,
      errors: ["invoice-error: rpc unavailable"],
    });
  });

  test("continues later phases when ensure or reminder list fails", async () => {
    const service = await createService();
    repository.ensureSubscriptionInvoices.mockImplementation(async () => {
      throw new Error("ensure failed");
    });
    repository.listInvoicesDueForReminder.mockImplementation(async () => {
      throw new Error("reminder query failed");
    });
    repository.listInvoicesDueForCharge.mockImplementation(async () => [
      invoice("invoice-charged"),
    ]);

    const result = await service.runDueChecks({
      now: fixedNow,
      batchSize: 10,
    });

    expect(repository.listInvoicesDueForReminder).toHaveBeenCalledWith({
      nowIso: fixedNow.toISOString(),
      page: 1,
      pageSize: 10,
    });
    expect(repository.markInvoiceReminded).not.toHaveBeenCalled();
    expect(repository.listInvoicesDueForCharge).toHaveBeenCalledWith({
      nowIso: fixedNow.toISOString(),
      page: 1,
      pageSize: 10,
    });
    expect(repository.chargeInvoice).toHaveBeenCalledWith({
      invoiceId: "invoice-charged",
      operatorUserId: null,
    });
    expect(result).toEqual({
      ensured: 0,
      reminded: 0,
      charged: 1,
      locked: 0,
      skipped: 0,
      errors: [
        "ensure_invoices: ensure failed",
        "reminders: reminder query failed",
      ],
    });
  });

  test("records charge list failures in result errors", async () => {
    const service = await createService();
    repository.listInvoicesDueForCharge.mockImplementation(async () => {
      throw new Error("charge query failed");
    });

    const result = await service.runDueChecks({
      now: fixedNow,
      batchSize: 10,
    });

    expect(repository.listInvoicesDueForCharge).toHaveBeenCalledWith({
      nowIso: fixedNow.toISOString(),
      page: 1,
      pageSize: 10,
    });
    expect(repository.chargeInvoice).not.toHaveBeenCalled();
    expect(result).toEqual({
      ensured: 0,
      reminded: 0,
      charged: 0,
      locked: 0,
      skipped: 0,
      errors: ["charges: charge query failed"],
    });
  });

  test("caps batchSize at 100 before calling repository", async () => {
    const service = await createService();

    await service.runDueChecks({
      now: fixedNow,
      batchSize: 500,
    });

    expect(repository.listInvoicesDueForReminder).toHaveBeenCalledWith({
      nowIso: fixedNow.toISOString(),
      page: 1,
      pageSize: 100,
    });
    expect(repository.listInvoicesDueForCharge).toHaveBeenCalledWith({
      nowIso: fixedNow.toISOString(),
      page: 1,
      pageSize: 100,
    });
    expect(repository.ensureSubscriptionInvoices).toHaveBeenCalledWith({
      nowIso: fixedNow.toISOString(),
      batchSize: 100,
    });
  });

  test("exposes getTenantLockState and recoverAfterRecharge passthroughs", async () => {
    const service = await createService();
    const recovery = { recovered: true, idempotent: false };
    repository.recoverAfterRecharge.mockImplementation(async () => recovery);
    repository.getLockStateByTenantId.mockImplementation(async () => lockedState);

    await expect(service.recoverAfterRecharge("tenant-1")).resolves.toBe(recovery);
    await expect(service.getTenantLockState("tenant-1")).resolves.toBe(
      lockedState,
    );

    expect(repository.recoverAfterRecharge).toHaveBeenCalledWith("tenant-1");
    expect(repository.getLockStateByTenantId).toHaveBeenCalledWith("tenant-1");
  });

});

async function importBillingSubscriptionRepository() {
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_PUBLISH ??= "test-publish-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

  return import("../repositories/billing-subscriptions");
}

const fixedNow = new Date("2026-07-03T04:00:00.000Z");

const repository = {
  findSubscriptionByTenantId: mock(async () => null),
  findPlanById: mock(async () => null),
  findOpenInvoiceDetailByTenantId: mock(async () => null),
  listInvoicesByTenantId: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  findInvoiceByTenantId: mock(async () => null),
  ensureSubscriptionInvoices: mock(
    async (): Promise<{ created: number; scanned: number }> => ({
      created: 0,
      scanned: 0,
    }),
  ),
  listInvoicesDueForReminder: mock(
    async (): Promise<TenantSubscriptionInvoiceRecord[]> => [],
  ),
  markInvoiceReminded: mock(
    async (
      invoiceId: string,
    ): Promise<TenantSubscriptionInvoiceRecord | null> => invoice(invoiceId),
  ),
  listInvoicesDueForCharge: mock(
    async (): Promise<TenantSubscriptionInvoiceRecord[]> => [],
  ),
  chargeInvoice: mock(
    async (_input: {
      invoiceId: string;
      operatorUserId?: string | null;
    }): Promise<BillingSubscriptionRpcResult> => ({ charged: true }),
  ),
  recoverAfterRecharge: mock(
    async (): Promise<BillingSubscriptionRpcResult> => ({ recovered: true }),
  ),
  getLockStateByTenantId: mock(
    async (): Promise<TenantBillingSubscriptionLockState> => unlockedState,
  ),
};

async function createService() {
  const { BillingSubscriptionService } = await import("./billing-subscriptions");
  return new BillingSubscriptionService({ repository });
}

function invoice(
  id: string,
): TenantSubscriptionInvoiceRecord {
  return {
    id,
    tenant_id: "tenant-1",
    subscription_id: "subscription-1",
    plan_id: "plan-1",
    period_start: "2026-07-01T00:00:00.000Z",
    period_end: "2026-08-01T00:00:00.000Z",
    due_at: "2026-07-03T00:00:00.000Z",
    amount_credits: 100,
    status: "upcoming",
    reminder_due_at: "2026-07-02T00:00:00.000Z",
    reminded_at: null,
    paid_at: null,
    ledger_id: null,
    failure_code: null,
    failure_message: null,
    metadata: {},
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

const unlockedState = {
  locked: false,
  subscription: null,
} satisfies TenantBillingSubscriptionLockState;

const lockedState = {
  locked: true,
  reason: "TENANT_CREDITS_INSUFFICIENT",
  locked_at: "2026-07-03T04:00:00.000Z",
  last_invoice_id: "invoice-locked",
  subscription: {
    id: "subscription-1",
    tenant_id: "tenant-1",
    status: "locked",
    locked_at: "2026-07-03T04:00:00.000Z",
    lock_reason: "TENANT_CREDITS_INSUFFICIENT",
    last_invoice_id: "invoice-locked",
  },
} satisfies TenantBillingSubscriptionLockState;
