import { beforeEach, describe, expect, mock, test } from "bun:test";
import { FinanceProjectSummaryListQuerySchema } from "@/schema/finance";
import type { AuthContext } from "@/services/authorization";

const listProjects = mock(async () => ({
  list: [
    {
      id: "project-1",
      name: "阶段三经营项目",
      status: "constructing",
      signed_amount: 100000,
      budget: 90000,
    },
  ],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  },
}));
const findProject = mock(async () => ({
  id: "project-1",
  tenant_id: "tenant-1",
  name: "阶段三经营项目",
  status: "constructing",
  signed_amount: 100000,
  budget: 90000,
}));
const listLedgerTotals = mock(async () => new Map([
  ["project-1", {
    income_amount: 50000,
    expense_amount: 12000,
    ledger_entry_count: 3,
    expense_by_category: new Map([
      ["category-1", 12000],
    ]),
  }],
]));
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
    listLedgerTotals,
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
    listLedgerTotals.mockClear();
    listReceivableTotals.mockClear();
    listBudgetTotals.mockClear();
    canAccessProject.mockClear();
    canAccessProject.mockImplementation(async () => true);
  });

  test("parses finance project risk filter query", () => {
    const parsed = FinanceProjectSummaryListQuerySchema.parse({
      page: "2",
      pageSize: "50",
      risk_level: "warning",
      risk_flag: "unallocated_expense",
      budget_configured: "false",
      has_unallocated_expense: "true",
      overdue: "true",
      min_budget_usage_ratio: "0.8",
      max_projected_budget_gross_margin: "0.2",
    });

    expect(parsed).toMatchObject({
      page: 2,
      pageSize: 50,
      risk_level: "warning",
      risk_flag: "unallocated_expense",
      budget_configured: false,
      has_unallocated_expense: true,
      overdue: true,
      min_budget_usage_ratio: 0.8,
      max_projected_budget_gross_margin: 0.2,
    });
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
  });

  test("marks over-budget projects as danger", async () => {
    listLedgerTotals.mockImplementationOnce(async () => new Map([
      ["project-1", {
        income_amount: 50000,
        expense_amount: 90000,
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
