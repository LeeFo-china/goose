import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listLedgerRows = mock(async () => [
  {
    id: "income-a",
    project_id: "project-a",
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
    direction: "in",
    entry_type: "project_payment",
    amount: 50000,
    occurred_at: "2026-06-05T10:00:00.000Z",
    metadata: { payment_type: "stage_1" },
  },
  {
    id: "expense-a",
    project_id: "project-a",
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: "category-labor",
    cost_category_name: "人工",
    direction: "out",
    entry_type: "expense_settlement",
    amount: 12000,
    occurred_at: "2026-06-06T10:00:00.000Z",
    metadata: {},
  },
  {
    id: "income-b",
    project_id: "project-b",
    project_name: "B 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
    direction: "in",
    entry_type: "project_payment",
    amount: 10000,
    occurred_at: "2026-06-07T10:00:00.000Z",
    metadata: {},
  },
  {
    id: "expense-unallocated",
    project_id: "project-b",
    project_name: "B 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
    direction: "out",
    entry_type: "manual_expense",
    amount: 1500,
    occurred_at: "2026-06-08T10:00:00.000Z",
    metadata: {},
  },
  {
    id: "supplier-payment-a",
    project_id: "project-a",
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
    direction: "out",
    entry_type: "supplier_payment",
    amount: 5000,
    occurred_at: "2026-06-09T10:00:00.000Z",
    metadata: {},
  },
]);

const listSupplierCostRows = mock(async () => [{
  id: "supplier-cost-a",
  project_id: "project-a",
  project_name: "A 项目",
  project_status: "constructing",
  cost_category_id: "category-labor",
  cost_category_name: "人工",
  amount: "5000.00",
  occurred_at: "2026-06-09T09:00:00.000Z",
}]);

const listReceivableRows = mock(async () => [
  {
    id: "receivable-a",
    project_id: "project-a",
    project_name: "A 项目",
    project_status: "constructing",
    amount: 60000,
    paid_amount: 50000,
    due_date: "2026-06-10",
    status: "partially_paid",
    payment_type: "stage_1",
  },
  {
    id: "receivable-b",
    project_id: "project-b",
    project_name: "B 项目",
    project_status: "constructing",
    amount: 15000,
    paid_amount: 10000,
    due_date: "2026-05-20",
    status: "partially_paid",
    payment_type: "stage_2",
  },
  {
    id: "receivable-canceled",
    project_id: "project-b",
    project_name: "B 项目",
    project_status: "constructing",
    amount: 9000,
    paid_amount: 0,
    due_date: "2026-05-01",
    status: "canceled",
    payment_type: "extra",
  },
]);

const listCandidateRows = mock(async () => ({
  receivables: [
    {
      id: "receivable-a",
      project_id: "project-a",
      project_name: "A 项目",
      title: "阶段款",
      amount: 60000,
      paid_amount: 50000,
      due_date: "2026-06-10",
      status: "partially_paid",
      allocation_amount: 45000,
    },
  ],
  payments: [],
  ledgers: [],
  expenseSettlements: [],
  expenseLedgers: [],
}));

const getMonthlyOverview = mock(async () => ({
  summary: {
    income_amount: 60000,
    expense_amount: 13500,
    gross_profit_amount: 46500,
    gross_profit_rate: 0.775,
    receivable_amount: 75000,
    received_amount: 60000,
    receivable_remaining_amount: 15000,
    overdue_receivable_amount: 15000,
    reconciliation_exception_count: 2,
    unallocated_expense_amount: 1500,
  },
  closing: {
    id: "closing-1",
    status: "closed" as const,
    closed_at: "2026-06-30T12:00:00.000Z",
    reopened_at: null,
    notes: "月结",
    snapshot_summary: {
      income_amount: 59000,
      expense_amount: 12000,
    },
    current_summary: {
      income_amount: 60000,
      expense_amount: 13500,
      gross_profit_amount: 46500,
      gross_profit_rate: 0.775,
      receivable_amount: 75000,
      received_amount: 60000,
      receivable_remaining_amount: 15000,
      overdue_receivable_amount: 15000,
      reconciliation_exception_count: 2,
      unallocated_expense_amount: 1500,
    },
    difference_summary: {
      income_amount: 1000,
      expense_amount: 1500,
      gross_profit_amount: 0,
    },
    has_snapshot_difference: true,
  },
  scope: {
    month: "2026-06",
    date_from: "2026-06-01",
    date_to: "2026-06-30",
    source_limit: 10000,
    truncated: false,
  },
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
  const { FinanceSpecializedReportService } = await import(
    "./finance-specialized-reports"
  );
  return new FinanceSpecializedReportService({
    operatingReportRepository: {
      listLedgerRows,
      listSupplierCostRows,
      listReceivableRows,
    },
    reconciliationRepository: {
      listCandidateRows,
    },
    monthlyOverviewService: {
      getMonthlyOverview,
    },
    accessPolicyService: accessPolicy,
  });
}

describe("FinanceSpecializedReportService", () => {
  beforeEach(() => {
    listLedgerRows.mockClear();
    listSupplierCostRows.mockClear();
    listReceivableRows.mockClear();
    listCandidateRows.mockClear();
    getMonthlyOverview.mockClear();
    accessPolicy.assertTenantContext.mockClear();
    accessPolicy.hasPermission.mockClear();
  });

  test("returns paginated project ranking sorted by gross profit", async () => {
    const service = await createService();

    const result = await service.getProjectRanking(
      authContextWithPermissions([
        { code: "finance.reports.read", scope: "all" },
      ]),
      {
        month: "2026-06",
        page: 1,
        pageSize: 1,
        sort_by: "gross_profit_amount",
        sort_order: "desc",
      },
    );

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(result.list).toEqual([
      expect.objectContaining({
        project_id: "project-a",
        project_name: "A 项目",
        income_amount: 50000,
        expense_amount: 17000,
        gross_profit_amount: 33000,
        gross_profit_rate: 0.66,
        receivable_remaining_amount: 10000,
        overdue_receivable_amount: 10000,
        reconciliation_exception_count: 2,
      }),
    ]);
    expect(listLedgerRows).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      projectStatus: undefined,
      sourceLimit: 10000,
    });
  });

  test("includes unpaid supplier cost in project ranking", async () => {
    listLedgerRows.mockImplementationOnce(async () => []);
    listReceivableRows.mockImplementationOnce(async () => []);
    listCandidateRows.mockImplementationOnce(async () => ({
      receivables: [],
      payments: [],
      ledgers: [],
      expenseSettlements: [],
      expenseLedgers: [],
    }));
    const service = await createService();

    const result = await service.getProjectRanking(
      authContextWithPermissions([
        { code: "finance.reports.read", scope: "all" },
      ]),
      {
        month: "2026-06",
        page: 1,
        pageSize: 20,
        sort_by: "expense_amount",
        sort_order: "desc",
      },
    );

    expect(result.list).toEqual([
      expect.objectContaining({
        project_id: "project-a",
        expense_amount: 5000,
        gross_profit_amount: -5000,
      }),
    ]);
  });

  test("returns paginated cost category summary", async () => {
    const service = await createService();

    const result = await service.getCostCategorySummary(
      authContextWithPermissions([
        { code: "finance.reports.read", scope: "all" },
      ]),
      {
        month: "2026-06",
        page: 1,
        pageSize: 20,
        sort_by: "expense_amount",
        sort_order: "desc",
      },
    );

    expect(result.summary).toEqual({
      expense_amount: 18500,
      unallocated_expense_amount: 1500,
    });
    expect(result.list).toEqual([
      {
        cost_category_id: "category-labor",
        cost_category_name: "人工",
        expense_amount: 17000,
        expense_percent: 0.9189,
        ledger_entry_count: 1,
        project_count: 1,
      },
      {
        cost_category_id: null,
        cost_category_name: "未归集",
        expense_amount: 1500,
        expense_percent: 0.0811,
        ledger_entry_count: 1,
        project_count: 1,
      },
    ]);
  });

  test("returns receivable aging buckets and paginated receivable items", async () => {
    const service = await createService();

    const result = await service.getReceivableAging(
      authContextWithPermissions([
        { code: "finance.reports.read", scope: "all" },
      ]),
      {
        as_of: "2026-06-30",
        page: 1,
        pageSize: 20,
      },
    );

    expect(result.buckets).toEqual([
      expect.objectContaining({ key: "not_due", amount: 0, count: 0 }),
      expect.objectContaining({ key: "overdue_1_7", amount: 0, count: 0 }),
      expect.objectContaining({ key: "overdue_8_30", amount: 10000, count: 1 }),
      expect.objectContaining({ key: "overdue_31_60", amount: 5000, count: 1 }),
      expect.objectContaining({ key: "overdue_60_plus", amount: 0, count: 0 }),
    ]);
    expect(result.list.map((item) => item.receivable_id)).toEqual([
      "receivable-b",
      "receivable-a",
    ]);
  });

  test("exports monthly overview as csv", async () => {
    const service = await createService();

    const result = await service.exportMonthlyOverviewCsv(
      authContextWithPermissions([
        { code: "finance.reports.export", scope: "all" },
      ]),
      { month: "2026-06", format: "csv" },
    );

    expect(result.filename).toBe("finance-monthly-overview-2026-06.csv");
    expect(result.content_type).toBe("text/csv; charset=utf-8");
    expect(result.content).toContain("月份,结账状态,本月收入,本月支出");
    expect(result.content).toContain("2026-06,已结账,60000,13500");
    expect(getMonthlyOverview).toHaveBeenCalled();
  });

  test("rejects export without export permission", async () => {
    const service = await createService();

    await expect(
      service.exportMonthlyOverviewCsv(
        authContextWithPermissions([
          { code: "finance.reports.read", scope: "all" },
        ]),
        { month: "2026-06", format: "csv" },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(getMonthlyOverview).not.toHaveBeenCalled();
  });
});
