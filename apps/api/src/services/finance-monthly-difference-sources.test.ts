import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const projectId = "00000000-0000-4000-8000-000000000001";

const closedPeriod = {
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
      income_amount: 10000,
      expense_amount: 5000,
    },
  },
  notes: "月结",
  created_at: "2026-06-30T11:00:00.000Z",
  updated_at: "2026-06-30T12:00:00.000Z",
};

const findClosingPeriod = mock(async (): Promise<typeof closedPeriod | null> =>
  closedPeriod
);
const getMonthlyOverview = mock(async () => ({
  summary: {
    income_amount: 12000,
    expense_amount: 6500,
    gross_profit_amount: 5500,
    gross_profit_rate: 0.4583,
    receivable_amount: 18000,
    received_amount: 12000,
    receivable_remaining_amount: 6000,
    overdue_receivable_amount: 1000,
    reconciliation_exception_count: 1,
    unallocated_expense_amount: 500,
  },
  closing: {
    id: "closing-1",
    status: "closed" as const,
    closed_at: "2026-06-30T12:00:00.000Z",
    reopened_at: null,
    notes: "月结",
    snapshot_summary: { income_amount: 10000, expense_amount: 5000 },
    current_summary: null,
    difference_summary: { income_amount: 2000, expense_amount: 1500 },
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

const listCorrectionAuditSources = mock(async () => ({
  list: [
    {
      id: "correction-audit:audit-1",
      source_type: "correction_audit" as const,
      source_label: "修正审计",
      source_id: "audit-1",
      occurred_at: "2026-06-30T13:05:00.000Z",
      project_id: projectId,
      project_name: "A 项目",
      amount: 1000,
      direction: null,
      description: "人工核销",
      target: {
        label: "查看修正审计",
        href: `/finance/audits?month=2026-06&project_id=${projectId}`,
      },
    },
  ],
  total: 1,
}));
const listLedgerEntrySources = mock(async () => ({
  list: [
    {
      id: "ledger_entry:ledger-1",
      source_type: "ledger_entry" as const,
      source_label: "财务台账",
      source_id: "ledger-1",
      occurred_at: "2026-06-30T13:00:00.000Z",
      project_id: projectId,
      project_name: "A 项目",
      amount: 800,
      direction: "in" as const,
      description: "项目收款入账",
      target: {
        label: "查看财务台账",
        href: "/finance/ledger?ledger_id=ledger-1",
      },
    },
  ],
  total: 1,
}));
const listReceivablePlanSources = mock(async () => ({
  list: [
    {
      id: "receivable_plan:plan-1",
      source_type: "receivable_plan" as const,
      source_label: "应收计划",
      source_id: "plan-1",
      occurred_at: "2026-06-30T12:30:00.000Z",
      project_id: projectId,
      project_name: "A 项目",
      amount: 2000,
      direction: null,
      description: "新增应收：中期款",
      target: {
        label: "查看应收计划",
        href: `/finance/receivables?project_id=${projectId}&receivable_plan_id=plan-1`,
      },
    },
  ],
  total: 1,
}));
const listExpenseRequestSources = mock(async () => ({
  list: [
    {
      id: "expense_request:expense-1",
      source_type: "expense_request" as const,
      source_label: "费用申请",
      source_id: "expense-1",
      occurred_at: "2026-06-30T12:15:00.000Z",
      project_id: projectId,
      project_name: "A 项目",
      amount: 300,
      direction: "out" as const,
      description: "材料报销",
      target: {
        label: "查看费用申请",
        href: "/expenses?expense_request_id=expense-1",
      },
    },
  ],
  total: 1,
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
  const { FinanceMonthlyDifferenceSourcesService } = await import(
    "./finance-monthly-difference-sources"
  );
  return new FinanceMonthlyDifferenceSourcesService({
    repository: {
      listCorrectionAuditSources,
      listLedgerEntrySources,
      listReceivablePlanSources,
      listExpenseRequestSources,
    },
    closingPeriodRepository: {
      findByMonth: findClosingPeriod,
    },
    monthlyOverviewService: {
      getMonthlyOverview,
    },
    accessPolicyService: accessPolicy,
  });
}

describe("FinanceMonthlyDifferenceSourcesService", () => {
  beforeEach(() => {
    findClosingPeriod.mockClear();
    getMonthlyOverview.mockClear();
    listCorrectionAuditSources.mockClear();
    listLedgerEntrySources.mockClear();
    listReceivablePlanSources.mockClear();
    listExpenseRequestSources.mockClear();
    accessPolicy.assertTenantContext.mockClear();
    accessPolicy.hasPermission.mockClear();
  });

  test("returns empty sources when the monthly closing period has not started", async () => {
    findClosingPeriod.mockResolvedValueOnce(null);
    const service = await createService();

    const result = await service.listDifferenceSources(
      authContextWithPermissions([{ code: "finance.reports.read", scope: "all" }]),
      { month: "2026-06", page: 1, pageSize: 20 },
    );

    expect(result.list).toEqual([]);
    expect(result.summary).toEqual({
      month: "2026-06",
      closing_status: "not_started",
      baseline_at: null,
      has_snapshot_difference: false,
      total: 0,
      by_source_type: {},
    });
    expect(getMonthlyOverview).not.toHaveBeenCalled();
    expect(listLedgerEntrySources).not.toHaveBeenCalled();
  });

  test("merges post-closing sources by occurred time and paginates them", async () => {
    const service = await createService();

    const result = await service.listDifferenceSources(
      authContextWithPermissions([{ code: "finance.reports.read", scope: "all" }]),
      { month: "2026-06", page: 1, pageSize: 2 },
    );

    expect(result.list.map((record) => record.id)).toEqual([
      "correction-audit:audit-1",
      "ledger_entry:ledger-1",
    ]);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 2,
      total: 4,
      totalPages: 2,
    });
    expect(result.summary).toEqual({
      month: "2026-06",
      closing_status: "closed",
      baseline_at: "2026-06-30T12:00:00.000Z",
      has_snapshot_difference: true,
      total: 4,
      by_source_type: {
        correction_audit: 1,
        ledger_entry: 1,
        receivable_plan: 1,
        expense_request: 1,
      },
    });
    expect(listCorrectionAuditSources).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      month: "2026-06",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      baselineAt: "2026-06-30T12:00:00.000Z",
      projectId: undefined,
      candidateLimit: 2,
    });
  });

  test("filters by source type and project id", async () => {
    const service = await createService();

    await service.listDifferenceSources(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      {
        month: "2026-06",
        source_type: "receivable_plan",
        project_id: projectId,
        page: 1,
        pageSize: 20,
      },
    );

    expect(listReceivablePlanSources).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      month: "2026-06",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      baselineAt: "2026-06-30T12:00:00.000Z",
      projectId,
      candidateLimit: 20,
    });
    expect(listCorrectionAuditSources).not.toHaveBeenCalled();
    expect(listLedgerEntrySources).not.toHaveBeenCalled();
    expect(listExpenseRequestSources).not.toHaveBeenCalled();
  });

  test("rejects users without finance report permissions", async () => {
    const service = await createService();

    await expect(
      service.listDifferenceSources(
        authContextWithPermissions([{ code: "crm.view", scope: "all" }]),
        { month: "2026-06", page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findClosingPeriod).not.toHaveBeenCalled();
  });
});
