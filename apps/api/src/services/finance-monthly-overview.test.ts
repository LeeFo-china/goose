import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FinanceClosingPeriodRow } from "@/repositories/finance-closing-periods";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listLedgerRows = mock(async () => [
  {
    id: "income-1",
    project_id: "project-1",
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
    direction: "in",
    entry_type: "project_payment",
    amount: 20000,
    occurred_at: "2026-06-05T10:00:00.000Z",
    metadata: {},
  },
  {
    id: "expense-1",
    project_id: "project-1",
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: "category-labor",
    cost_category_name: "人工",
    direction: "out",
    entry_type: "expense_settlement",
    amount: 8000,
    occurred_at: "2026-06-06T10:00:00.000Z",
    metadata: {},
  },
  {
    id: "expense-unallocated",
    project_id: "project-2",
    project_name: "B 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
    direction: "out",
    entry_type: "adjustment",
    amount: 1500,
    occurred_at: "2026-06-07T10:00:00.000Z",
    metadata: {},
  },
  {
    id: "supplier-payment-1",
    project_id: "project-1",
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
    direction: "out",
    entry_type: "supplier_payment",
    amount: 100,
    occurred_at: "2026-06-08T10:00:00.000Z",
    metadata: {},
  },
]);

const listSupplierCostRows = mock(async () => [{
  id: "supplier-cost-1",
  project_id: "project-1",
  project_name: "A 项目",
  project_status: "constructing",
  cost_category_id: "category-material",
  cost_category_name: "材料",
  amount: 100,
  occurred_at: "2026-06-08T09:00:00.000Z",
}]);

const listReceivableRows = mock(async () => [
  {
    id: "receivable-1",
    project_id: "project-1",
    project_name: "A 项目",
    project_status: "constructing",
    amount: 25000,
    paid_amount: 20000,
    due_date: "2026-06-10",
    status: "partially_paid",
    payment_type: "stage_2",
  },
  {
    id: "receivable-2",
    project_id: "project-2",
    project_name: "B 项目",
    project_status: "constructing",
    amount: 5000,
    paid_amount: 0,
    due_date: "2026-06-30",
    status: "pending",
    payment_type: "add_on",
  },
]);

const listReconciliationCandidateRows = mock(async () => ({
  receivables: [
    {
      id: "receivable-1",
      project_id: "project-1",
      project_name: "A 项目",
      title: "中期款",
      amount: 25000,
      paid_amount: 20000,
      due_date: "2026-06-10",
      status: "partially_paid",
      allocation_amount: 18000,
    },
  ],
  payments: [],
  ledgers: [],
  expenseSettlements: [],
  expenseLedgers: [],
}));

const findClosingPeriod = mock(async (): Promise<
  FinanceClosingPeriodRow | null
> => ({
  id: "closing-1",
  tenant_id: "tenant-1",
  period_month: "2026-06",
  status: "closed" as const,
  closed_at: "2026-06-30T12:00:00.000Z",
  closed_by_employee_id: "employee-1",
  reopened_at: null,
  reopened_by_employee_id: null,
  reopen_reason: null,
  snapshot_json: {
    summary: {
      income_amount: 19000,
      expense_amount: 9000,
      gross_profit_amount: 10000,
    },
  },
  notes: "月末结账",
  created_at: "2026-06-30T12:00:00.000Z",
  updated_at: "2026-06-30T12:00:00.000Z",
}));

const accessPolicy = {
  assertTenantContext: mock((authContext: AuthContext) => {
    if (!authContext.tenantId) {
      throw Object.assign(new Error("缺少租户上下文"), {
        statusCode: 403,
        code: "TENANT_CONTEXT_REQUIRED",
      });
    }
    return authContext.tenantId;
  }),
  hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
    authContext.permissions.some((permission) => permission.code === permissionCode)
  ),
};

const baseAuthContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
} satisfies Omit<AuthContext, "permissions">;

function authContextWithPermissions(
  permissions: AuthContext["permissions"],
): AuthContext {
  return {
    ...baseAuthContext,
    permissions,
  };
}

async function createService() {
  const { FinanceMonthlyOverviewService } = await import(
    "./finance-monthly-overview"
  );
  return new FinanceMonthlyOverviewService({
    operatingReportRepository: {
      listLedgerRows,
      listSupplierCostRows,
      listReceivableRows,
    },
    reconciliationRepository: {
      listCandidateRows: listReconciliationCandidateRows,
    },
    closingPeriodRepository: {
      findByMonth: findClosingPeriod,
    },
    accessPolicyService: accessPolicy,
  });
}

describe("FinanceMonthlyOverviewService", () => {
  beforeEach(() => {
    listLedgerRows.mockClear();
    listSupplierCostRows.mockClear();
    listReceivableRows.mockClear();
    listReconciliationCandidateRows.mockClear();
    findClosingPeriod.mockClear();
    accessPolicy.assertTenantContext.mockClear();
    accessPolicy.hasPermission.mockClear();
  });

  test("returns monthly operating summary with reconciliation count and closing snapshot", async () => {
    const service = await createService();

    const result = await service.getMonthlyOverview(
      authContextWithPermissions([
        { code: "finance.reports.read", scope: "all" },
      ]),
      { month: "2026-06" },
    );

    expect(result.scope).toEqual({
      month: "2026-06",
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      source_limit: 10000,
      truncated: false,
    });
    expect(result.summary).toEqual({
      income_amount: 20000,
      expense_amount: 9600,
      gross_profit_amount: 10400,
      gross_profit_rate: 0.52,
      receivable_amount: 30000,
      received_amount: 20000,
      receivable_remaining_amount: 10000,
      overdue_receivable_amount: 5000,
      reconciliation_exception_count: 2,
      unallocated_expense_amount: 1500,
    });
    expect(result.closing).toEqual({
      id: "closing-1",
      status: "closed",
      closed_at: "2026-06-30T12:00:00.000Z",
      reopened_at: null,
      notes: "月末结账",
      snapshot_summary: {
        income_amount: 19000,
        expense_amount: 9000,
        gross_profit_amount: 10000,
      },
      current_summary: {
        income_amount: 20000,
        expense_amount: 9600,
        gross_profit_amount: 10400,
        gross_profit_rate: 0.52,
        receivable_amount: 30000,
        received_amount: 20000,
        receivable_remaining_amount: 10000,
        overdue_receivable_amount: 5000,
        reconciliation_exception_count: 2,
        unallocated_expense_amount: 1500,
      },
      difference_summary: {
        income_amount: 1000,
        expense_amount: 600,
        gross_profit_amount: 400,
      },
      has_snapshot_difference: true,
    });
    expect(listLedgerRows).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      sourceLimit: 10000,
    });
    expect(listSupplierCostRows).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      sourceLimit: 10000,
    });
    expect(listReconciliationCandidateRows).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      sourceLimit: 10000,
    });
  });

  test("reports recognized supplier cost before any supplier payment", async () => {
    listLedgerRows.mockImplementationOnce(async () => []);
    listReceivableRows.mockImplementationOnce(async () => []);
    listReconciliationCandidateRows.mockImplementationOnce(async () => ({
      receivables: [],
      payments: [],
      ledgers: [],
      expenseSettlements: [],
      expenseLedgers: [],
    }));
    findClosingPeriod.mockImplementationOnce(async () => null);
    const service = await createService();

    const result = await service.getMonthlyOverview(
      authContextWithPermissions([
        { code: "finance.reports.read", scope: "all" },
      ]),
      { month: "2026-06" },
    );

    expect(result.summary.expense_amount).toBe(100);
    expect(result.summary.gross_profit_amount).toBe(-100);
    expect(result.summary.unallocated_expense_amount).toBe(0);
  });

  test("rejects monthly overview without finance report permission", async () => {
    const service = await createService();

    await expect(
      service.getMonthlyOverview(authContextWithPermissions([]), {
        month: "2026-06",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(listLedgerRows).not.toHaveBeenCalled();
  });
});
