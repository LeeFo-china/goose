import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const baseProject = { id: "project-1", status: "constructing", signed_amount: 100000, budget: 90000 };

const listProjects = mock(async () => ({
  list: [{ ...baseProject, name: "阶段三经营项目" }],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
}));
const findProject = mock(async () => ({
  ...baseProject,
  tenant_id: "tenant-1",
  name: "阶段三经营项目",
}));
const searchProjectIdsByRisk = mock(async () => ({
  projectIds: ["project-1"],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
}));
const listProjectsByIds = mock(async () => [{ ...baseProject, name: "阶段五风险项目" }]);
const listProjectsForAnalytics = mock(async () => ({
  list: [{ ...baseProject, name: "阶段五风险项目" }],
  total: 1,
  limit: 100,
}));
const listLedgerTotals = mock(async () => new Map([
  ["project-1", {
    income_amount: 50000,
    expense_amount: 12000,
    unallocated_expense_amount: 0,
    ledger_entry_count: 3,
    expense_by_category: new Map([
      ["category-1", 12000],
    ]),
  }],
]));
const listUnallocatedExpenseItems = mock(async () => new Map());
const listLedgerTrend = mock(async () => [{
  date: "2026-06-01",
  income_amount: 50000,
  expense_amount: 12000,
}]);
const listReceivableTotals = mock(async () => new Map([
  ["project-1", {
    receivable_amount: 80000,
    receivable_paid_amount: 50000,
    receivable_remaining_amount: 30000,
    overdue_amount: 0,
    overdue_count: 0,
  }],
]));
const listBudgetTotals = mock(async () => new Map([
  ["project-1", {
    budget_amount: 80000,
    category_budgets: new Map([
      ["category-1", {
        budget_amount: 30000,
        warning_threshold_percent: 100,
      }],
      ["category-2", {
        budget_amount: 50000,
        warning_threshold_percent: 100,
      }],
    ]),
  }],
]));
const canAccessProject = mock(async () => true);

mock.module("@/repositories/finance-project-summary", () => ({
  financeProjectSummaryRepository: {
    listProjects,
    findProject,
    searchProjectIdsByRisk,
    listProjectsByIds,
    listProjectsForAnalytics,
    listLedgerTotals,
    listUnallocatedExpenseItems,
    listLedgerTrend,
    listReceivableTotals,
    listBudgetTotals,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((authContext: AuthContext) => authContext.tenantId),
    hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
      authContext.permissions.some((permission) => permission.code === permissionCode)
    ),
    canAccessProject,
  },
}));

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

describe("financeProjectSummaryService", () => {
  beforeEach(() => {
    listProjects.mockClear();
    findProject.mockClear();
    searchProjectIdsByRisk.mockClear();
    listProjectsByIds.mockClear();
    listProjectsForAnalytics.mockClear();
    listLedgerTotals.mockClear();
    listLedgerTrend.mockClear();
    listReceivableTotals.mockClear();
    listBudgetTotals.mockClear();
    listUnallocatedExpenseItems.mockClear();
    canAccessProject.mockClear();
    canAccessProject.mockImplementation(async () => true);
  });

  test("lists project operating summaries for finance viewers", async () => {
    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryService.listProjectSummaries(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );

    const first = result.list[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("expected first project summary");

    expect(first).toMatchObject({
      project_id: "project-1",
      contract_amount: 100000,
      receivable_amount: 80000,
      received_amount: 50000,
      receivable_remaining_amount: 30000,
      expense_paid_amount: 12000,
      actual_profit_amount: 38000,
      projected_profit_amount: 88000,
      overdue_amount: 0,
      overdue_count: 0,
      budget_configured: true,
      budget_cost_amount: 80000,
      budget_remaining_amount: 68000,
      budget_usage_ratio: 0.15,
      projected_budget_profit_amount: 20000,
      profit_variance_amount: 18000,
      projected_budget_gross_margin: 0.2,
      risk_level: "normal",
      risk_flags: [],
    });
    expect(first.actual_gross_margin).toBe(0.76);
    expect(first.projected_gross_margin).toBe(0.88);
    expect(listBudgetTotals).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
    });
    expect(result.summary).toMatchObject({
      project_count: 1,
      contract_amount: 100000,
      received_amount: 50000,
      expense_paid_amount: 12000,
      actual_profit_amount: 38000,
      budget_cost_amount: 80000,
      projected_budget_profit_amount: 20000,
      risk_count: 0,
    });
    expect(result.analytics).toBeDefined();
    if (!result.analytics) throw new Error("expected finance analytics");
    expect(result.analytics.scope).toMatchObject({
      project_count: 1,
      project_limit: 100,
      truncated: false,
      trend_days: 30,
    });
    expect(result.analytics.trends).toEqual([
      {
        date: "2026-06-01",
        income_amount: 50000,
        expense_amount: 12000,
        net_cash_flow_amount: 38000,
      },
    ]);
  });

  test("returns finance analytics rankings independent of current page rows", async () => {
    listProjects.mockImplementationOnce(async () => ({
      list: [],
      pagination: {
        page: 2,
        pageSize: 20,
        total: 21,
        totalPages: 2,
      },
    }));
    listProjectsForAnalytics.mockImplementationOnce(async () => ({
      list: [
        {
          id: "project-1",
          name: "未归集项目",
          status: "constructing",
          signed_amount: 100000,
          budget: 90000,
        },
      ],
      total: 21,
      limit: 100,
    }));
    listLedgerTotals.mockImplementationOnce(async () => new Map());
    listLedgerTotals.mockImplementationOnce(async () => new Map([
      ["project-1", {
        income_amount: 20000,
        expense_amount: 10000,
        unallocated_expense_amount: 1800,
        ledger_entry_count: 2,
        expense_by_category: new Map(),
      }],
    ]));
    listBudgetTotals.mockImplementationOnce(async () => new Map());
    listBudgetTotals.mockImplementationOnce(async () => new Map());

    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryService.listProjectSummaries(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 2, pageSize: 20 },
    );

    expect(result.list).toEqual([]);
    expect(result.analytics).toBeDefined();
    if (!result.analytics) throw new Error("expected finance analytics");
    expect(listProjectsForAnalytics).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      query: { page: 2, pageSize: 20 },
      limit: 100,
    });
    expect(result.analytics.rankings.unallocated_expense[0]).toMatchObject({
      project_id: "project-1",
      project_name: "未归集项目",
      value: 1800,
      target: "/finance/ledger?project_id=project-1&direction=out&unallocated_only=true",
    });
  });

  test("uses risk search path when risk filters are provided", async () => {
    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryService.listProjectSummaries(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20, risk_level: "warning" },
    );

    expect(searchProjectIdsByRisk).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      query: { page: 1, pageSize: 20, risk_level: "warning" },
    });
    expect(listProjects).not.toHaveBeenCalled();
    expect(listProjectsByIds).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
    });
    expect(result.pagination.total).toBe(1);
  });

  test("returns unallocated expense risk reason", async () => {
    listLedgerTotals.mockImplementationOnce(async () => new Map([
      ["project-1", {
        income_amount: 50000,
        expense_amount: 12000,
        unallocated_expense_amount: 1200,
        ledger_entry_count: 3,
        expense_by_category: new Map([
          ["category-1", 10800],
        ]),
      }],
    ]));

    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryService.listProjectSummaries(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );

    expect(result.list[0]?.unallocated_expense_amount).toBe(1200);
    expect(result.list[0]?.risk_flags).toContain("unallocated_expense");
    expect(result.list[0]?.risk_reasons).toContainEqual(
      expect.objectContaining({
        code: "unallocated_expense",
        action: expect.objectContaining({ key: "open_unallocated_ledger" }),
      }),
    );
  });

  test("returns unallocated expense item previews", async () => {
    listLedgerTotals.mockImplementationOnce(async () => new Map([
      ["project-1", {
        income_amount: 50000,
        expense_amount: 12000,
        unallocated_expense_amount: 1200,
        ledger_entry_count: 3,
        expense_by_category: new Map(),
      }],
    ]));
    listUnallocatedExpenseItems.mockImplementationOnce(async () => new Map([
      ["project-1", [
        {
          id: "ledger-1",
          amount: 1200,
          occurred_at: "2026-06-25T10:00:00.000Z",
          summary: "材料费用",
          request_title: "木工材料采购",
          expense_category: "材料",
          applicant_name: "令狐冲",
          applicant_phone: "18800000001",
          request_time: "2026-06-25T09:30:00.000Z",
          request_no: "EXP-20260625-001",
        },
      ]],
    ]));

    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryService.listProjectSummaries(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );

    expect(listUnallocatedExpenseItems).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
      limitPerProject: 3,
    });
    expect(result.list[0]?.unallocated_expense_items[0]).toMatchObject({
      request_title: "木工材料采购",
      expense_category: "材料",
      applicant_name: "令狐冲",
      request_time: "2026-06-25T09:30:00.000Z",
    });
  });

  test("marks over-budget projects as danger", async () => {
    listLedgerTotals.mockImplementationOnce(async () => new Map([
      ["project-1", {
        income_amount: 50000,
        expense_amount: 90000,
        unallocated_expense_amount: 0,
        ledger_entry_count: 4,
        expense_by_category: new Map([
          ["category-1", 40000],
          ["category-2", 50000],
        ]),
      }],
    ]));

    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryService.listProjectSummaries(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );
    const overBudget = result.list[0];
    expect(overBudget).toBeDefined();
    if (!overBudget) throw new Error("expected project summary");

    expect(overBudget.risk_level).toBe("danger");
    expect(overBudget.risk_flags).toContain("project_over_budget");
    expect(overBudget.risk_flags).toContain("category_over_budget");
  });

  test("marks missing budgets as info", async () => {
    listBudgetTotals.mockImplementationOnce(async () => new Map());

    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryService.listProjectSummaries(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );
    const item = result.list[0];
    expect(item).toBeDefined();
    if (!item) throw new Error("expected project summary");

    expect(item.budget_configured).toBe(false);
    expect(item.risk_level).toBe("info");
    expect(item.risk_flags).toContain("budget_missing");
  });

  test("marks low projected margin and overdue receivables as warning", async () => {
    listReceivableTotals.mockImplementationOnce(async () => new Map([
      ["project-1", {
        receivable_amount: 80000,
        receivable_paid_amount: 50000,
        receivable_remaining_amount: 30000,
        overdue_amount: 10000,
        overdue_count: 1,
      }],
    ]));
    listBudgetTotals.mockImplementationOnce(async () => new Map([
      ["project-1", {
        budget_amount: 90000,
        category_budgets: new Map([
          ["category-1", {
            budget_amount: 90000,
            warning_threshold_percent: 100,
          }],
        ]),
      }],
    ]));

    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryService.listProjectSummaries(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );
    const item = result.list[0];
    expect(item).toBeDefined();
    if (!item) throw new Error("expected project summary");

    expect(item.projected_budget_gross_margin).toBe(0.1);
    expect(item.risk_level).toBe("warning");
    expect(item.risk_flags).toContain("low_projected_margin");
    expect(item.risk_flags).toContain("receivable_overdue");
  });

  test("returns one project summary for readable project users", async () => {
    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    const result = await financeProjectSummaryService.getProjectSummary(
      authContextWithPermissions([{ code: "project.read", scope: "all" }]),
      "project-1",
    );

    expect(canAccessProject).toHaveBeenCalledWith(
      expect.any(Object),
      "project-1",
      "project.read",
    );
    expect(result).toBeDefined();
    if (!result) throw new Error("expected project summary");
    expect(result.project_id).toBe("project-1");
    expect(result.net_cash_flow_amount).toBe(38000);
  });

  test("rejects project summary list without finance permission", async () => {
    const { financeProjectSummaryService } =
      await import("./finance-project-summary");

    await expect(
      financeProjectSummaryService.listProjectSummaries(
        authContextWithPermissions([{ code: "project.read", scope: "all" }]),
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });
});
