import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TenantBillingPlanRecord,
  TenantBillingSubscriptionLockState,
  TenantBillingSubscriptionRecord,
  TenantSubscriptionInvoiceRecord,
  TenantSubscriptionInvoiceWithLedgerRecord,
  TenantSubscriptionLedgerRecord,
} from "@/repositories/billing-subscriptions";

describe("billing subscription invoice repository contract", () => {
  test("exposes tenant invoice read queries with ledger snapshots and pagination", () => {
    const repositorySource = readFileSync(
      join(import.meta.dir, "../repositories/billing-subscriptions.ts"),
      "utf8",
    );

    expect(repositorySource).toContain("findPlanById");
    expect(repositorySource).toContain("findOpenInvoiceDetailByTenantId");
    expect(repositorySource).toContain("listInvoicesByTenantId");
    expect(repositorySource).toContain("findInvoiceByTenantId");
    expect(repositorySource).toContain("tenant_credit_ledger");
    expect(repositorySource).toContain(".range(from, to)");
    expect(repositorySource).toContain(".eq(\"tenant_id\", input.tenantId)");
    expect(repositorySource).toContain(".eq(\"id\", input.invoiceId)");
  });
});

describe("billing subscription invoice controller contract", () => {
  test("exposes locked-state-safe tenant subscription invoice routes", () => {
    const controllerSource = readFileSync(
      join(import.meta.dir, "../controllers/billing/index.ts"),
      "utf8",
    );

    expect(controllerSource).toContain("@Get(\"/billing/subscription\")");
    expect(controllerSource).toContain(
      "@Get(\"/billing/subscription-invoices\")",
    );
    expect(controllerSource).toContain(
      "@Get(\"/billing/subscription-invoices/:id\")",
    );
    expect(controllerSource).toContain("allowedWhenBillingLocked: true");
    expect(controllerSource).toContain("BillingSubscriptionInvoiceQuerySchema");
    expect(controllerSource).toContain("BillingSubscriptionInvoiceParamSchema");
  });
});

describe("BillingSubscriptionService tenant invoice reads", () => {
  test("returns tenant subscription summary with plan, open invoice, and lock state", async () => {
    const service = await createService();
    repository.findSubscriptionByTenantId.mockImplementation(async () =>
      subscription("locked")
    );
    repository.findPlanById.mockImplementation(async () => defaultPlan);
    repository.findOpenInvoiceDetailByTenantId.mockImplementation(async () =>
      invoice("invoice-open", { status: "past_due" })
    );
    repository.getLockStateByTenantId.mockImplementation(async () => lockedState);

    const result = await service.getTenantSubscription("tenant-1");

    expect(result).toMatchObject({
      plan: {
        code: "system_monthly_1000",
        monthly_fee_credits: 1000,
      },
      subscription: {
        id: "subscription-1",
        status: "locked",
        status_label: "已锁定",
      },
      current_invoice: {
        id: "invoice-open",
        status: "past_due",
        status_label: "已逾期",
        payment_hint: {
          required_credits: 100,
        },
      },
      lock: {
        locked: true,
        reason: "TENANT_CREDITS_INSUFFICIENT",
      },
    });
    expect(repository.findPlanById).toHaveBeenCalledWith("plan-1");
    expect(repository.findOpenInvoiceDetailByTenantId).toHaveBeenCalledWith(
      "tenant-1",
    );
  });

  test("lists tenant subscription invoices with ledger snapshots", async () => {
    const service = await createService();
    repository.listInvoicesByTenantId.mockImplementation(async () => ({
      list: [
        invoice("invoice-paid", {
          status: "paid",
          ledger: subscriptionLedger("ledger-1"),
        }),
      ],
      pagination: { page: 2, pageSize: 3, total: 4, totalPages: 2 },
    }));

    const result = await service.listTenantInvoices("tenant-1", {
      page: 2,
      pageSize: 3,
      status: "paid",
    });

    expect(repository.listInvoicesByTenantId).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      page: 2,
      pageSize: 3,
      status: "paid",
    });
    expect(result).toEqual({
      list: [
        expect.objectContaining({
          id: "invoice-paid",
          status: "paid",
          status_label: "已支付",
          payment_hint: null,
          ledger: expect.objectContaining({
            id: "ledger-1",
            event_type_label: "系统月度使用费",
            source_label: "系统使用费账单 invoice-paid",
          }),
        }),
      ],
      pagination: { page: 2, pageSize: 3, total: 4, totalPages: 2 },
    });
  });

  test("returns tenant invoice detail with payment hint for unpaid invoices", async () => {
    const service = await createService();
    repository.findInvoiceByTenantId.mockImplementation(async () =>
      invoice("invoice-detail", { status: "failed" })
    );

    const result = await service.getTenantInvoice("tenant-1", "invoice-detail");

    expect(repository.findInvoiceByTenantId).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      invoiceId: "invoice-detail",
    });
    expect(result).toMatchObject({
      id: "invoice-detail",
      status: "failed",
      status_label: "扣费失败",
      payment_hint: {
        required_credits: 100,
        action_label: "去充值",
      },
    });
  });
});

async function createService() {
  const { BillingSubscriptionService } = await import("./billing-subscriptions");
  return new BillingSubscriptionService({ repository });
}

const repository = {
  findSubscriptionByTenantId: mock(
    async (): Promise<TenantBillingSubscriptionRecord | null> => null,
  ),
  findPlanById: mock(
    async (): Promise<TenantBillingPlanRecord | null> => null,
  ),
  findOpenInvoiceDetailByTenantId: mock(
    async (): Promise<TenantSubscriptionInvoiceWithLedgerRecord | null> => null,
  ),
  listInvoicesByTenantId: mock(
    async (): Promise<{
      list: TenantSubscriptionInvoiceWithLedgerRecord[];
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
    }> => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    }),
  ),
  findInvoiceByTenantId: mock(
    async (): Promise<TenantSubscriptionInvoiceWithLedgerRecord | null> => null,
  ),
  listInvoicesDueForReminder: mock(async () => []),
  markInvoiceReminded: mock(async () => null),
  listInvoicesDueForCharge: mock(async () => []),
  chargeInvoice: mock(async () => ({ charged: true })),
  recoverAfterRecharge: mock(async () => ({ recovered: true })),
  getLockStateByTenantId: mock(
    async (): Promise<TenantBillingSubscriptionLockState> => unlockedState,
  ),
};

function invoice(
  id: string,
  overrides: Partial<TenantSubscriptionInvoiceRecord> & {
    ledger?: TenantSubscriptionLedgerRecord | null;
  } = {},
): TenantSubscriptionInvoiceWithLedgerRecord {
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
    ...overrides,
  };
}

function subscription(status: "active" | "locked") {
  return {
    id: "subscription-1",
    tenant_id: "tenant-1",
    plan_id: "plan-1",
    status,
    current_period_start: "2026-07-01",
    current_period_end: "2026-08-01",
    next_charge_at: "2026-08-01T00:00:00.000Z",
    locked_at: status === "locked" ? "2026-07-03T04:00:00.000Z" : null,
    lock_reason: status === "locked" ? "TENANT_CREDITS_INSUFFICIENT" : null,
    last_invoice_id: status === "locked" ? "invoice-open" : null,
    metadata: {},
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
}

const defaultPlan = {
  id: "plan-1",
  code: "system_monthly_1000",
  name: "系统月度使用费",
  period: "monthly" as const,
  monthly_fee_credits: 1000,
  reminder_days_before_due: 7,
  enabled: true,
  version: 1,
  metadata: {},
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
};

function subscriptionLedger(id: string): TenantSubscriptionLedgerRecord {
  return {
    id,
    tenant_id: "tenant-1",
    direction: "out",
    change_credits: 100,
    balance_after: 900,
    frozen_after: 0,
    event_type: "subscription_monthly_fee",
    source_type: "tenant_subscription_invoice",
    source_id: "invoice-paid",
    source_no: null,
    remark: "系统月度使用费",
    created_at: "2026-07-03T00:00:00.000Z",
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
