import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  BillingSubscriptionRpcResult,
  TenantBillingSubscriptionLockState,
  TenantSubscriptionInvoiceRecord,
} from "@/repositories/billing-subscriptions";

const migrationDir = join(
  import.meta.dir,
  "../../../../supabase/migrations",
);

describe("tenant subscription billing migration", () => {
  test("creates subscription billing tables and charge recovery RPCs", () => {
    const migrationSource = readLatestTenantSubscriptionBillingMigration();

    expect(migrationSource).toContain(
      "CREATE TABLE IF NOT EXISTS public.tenant_billing_plans",
    );
    expect(migrationSource).toContain(
      "CREATE TABLE IF NOT EXISTS public.tenant_billing_subscriptions",
    );
    expect(migrationSource).toContain(
      "CREATE TABLE IF NOT EXISTS public.tenant_subscription_invoices",
    );
    expect(migrationSource).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_charge_subscription_invoice",
    );
    expect(migrationSource).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_recover_subscription_after_recharge",
    );
    expect(migrationSource).toContain(
      "tenant_subscription_invoices_tenant_period_unique_idx",
    );
    expect(migrationSource).toContain(
      "tenant_subscription_invoices_reminder_status_idx",
    );
    expect(migrationSource).toContain("'subscription_monthly_fee'");
    expect(migrationSource).toContain("'tenant_subscription_invoice'");
    expect(migrationSource).toContain(
      "REVOKE ALL ON FUNCTION public.billing_charge_subscription_invoice",
    );
    expect(migrationSource).toContain(
      "GRANT EXECUTE ON FUNCTION public.billing_charge_subscription_invoice",
    );
    expect(migrationSource).toContain(
      "TENANT_SUBSCRIPTION_INVOICE_TENANT_MISMATCH",
    );
    expect(migrationSource).toContain("FOREIGN KEY (subscription_id, tenant_id)");
    expect(migrationSource).toContain("FOREIGN KEY (last_invoice_id, tenant_id)");
    expect(migrationSource).toContain("TENANT_CREDIT_LEDGER_CONFLICT");
    expect(migrationSource).toContain("GET STACKED DIAGNOSTICS");
    expect(migrationSource).toContain("RAISE;");
  });
});

describe("billing subscription repository contract", () => {
  test("uses subscription tables, due invoice queries, pagination, and charge recovery RPCs", () => {
    const repositorySource = readFileSync(
      join(import.meta.dir, "../repositories/billing-subscriptions.ts"),
      "utf8",
    );

    expect(repositorySource).toContain("tenant_billing_subscriptions");
    expect(repositorySource).toContain("tenant_subscription_invoices");
    expect(repositorySource).toContain("listInvoicesDueForReminder");
    expect(repositorySource).toContain("listInvoicesDueForCharge");
    expect(repositorySource).toContain(".range(from, to)");
    expect(repositorySource).toContain("billing_charge_subscription_invoice");
    expect(repositorySource).toContain(
      "billing_recover_subscription_after_recharge",
    );

    const chargeListSource = repositorySource.slice(
      repositorySource.indexOf("async listInvoicesDueForCharge"),
      repositorySource.indexOf("async markInvoiceReminded"),
    );
    expect(chargeListSource).toContain(
      '.in("status", ["upcoming", "reminded"])',
    );
    expect(chargeListSource).not.toContain('"past_due"');
    expect(chargeListSource).not.toContain('"failed"');

    const markInvoiceRemindedSource = repositorySource.slice(
      repositorySource.indexOf("async markInvoiceReminded"),
      repositorySource.indexOf("async chargeInvoice"),
    );
    expect(markInvoiceRemindedSource).toContain('.eq("status", "upcoming")');
    expect(markInvoiceRemindedSource).toContain(".maybeSingle()");
  });
});

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
      reminded: 1,
      charged: 0,
      locked: 0,
      skipped: 1,
      errors: ["invoice-reminder-error: reminder update failed"],
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
      reminded: 0,
      charged: 1,
      locked: 1,
      skipped: 1,
      errors: ["invoice-error: rpc unavailable"],
    });
  });

  test("continues charge phase when reminder list fails", async () => {
    const service = await createService();
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
      reminded: 0,
      charged: 1,
      locked: 0,
      skipped: 0,
      errors: ["reminders: reminder query failed"],
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

function readLatestTenantSubscriptionBillingMigration() {
  const migrationFile = readdirSync(migrationDir)
    .filter((fileName) =>
      fileName.endsWith("_create_tenant_subscription_billing.sql")
    )
    .sort()
    .at(-1);

  if (!migrationFile) {
    throw new Error("No tenant subscription billing migration found");
  }

  return readFileSync(join(migrationDir, migrationFile), "utf8");
}

async function importBillingSubscriptionRepository() {
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_PUBLISH ??= "test-publish-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

  return import("../repositories/billing-subscriptions");
}

const fixedNow = new Date("2026-07-03T04:00:00.000Z");

const repository = {
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

function invoice(id: string): TenantSubscriptionInvoiceRecord {
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
