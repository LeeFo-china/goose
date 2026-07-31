import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

const auth = {
  tenantId: "tenant-1",
  employeeId: "employee-1",
  authUserId: "user-1",
  permissions: [{ code: "finance.view", scope: "all" }],
} as unknown as AuthContext;

const project = (id: string) => ({
  id,
  name: id,
  status: "constructing",
  signed_amount: 100,
  budget: 100,
});

function dependencies(projectIds = ["project-1"]) {
  const projects = projectIds.map(project);
  return {
    repository: {
      listProjects: mock(async () => ({
        list: projects,
        pagination: {
          page: 1,
          pageSize: 20,
          total: projects.length,
          totalPages: 1,
        },
      })),
      findProject: mock(async () => ({ ...projects[0], tenant_id: "tenant-1" })),
      searchProjectIdsByRisk: mock(async () => ({
        projectIds,
        pagination: {
          page: 1,
          pageSize: 20,
          total: projects.length,
          totalPages: 1,
        },
      })),
      listProjectsByIds: mock(async () => projects),
      listProjectsForAnalytics: mock(async () => ({
        list: projects,
        total: projects.length,
        limit: 100,
      })),
      listLedgerTotals: mock(async () => new Map(projectIds.map((id) => [
        id,
        {
          income_amount: 50,
          expense_amount: 10,
          unallocated_expense_amount: 0,
          ledger_entry_count: 3,
          expense_by_category: new Map(),
        },
      ]))),
      listSupplierTotals: mock(async () => new Map(projectIds.map((id) => [
        id,
        {
          supplier_cost_amount: 40,
          supplier_cost_by_category: new Map([["category-1", 40]]),
          supplier_payable_open_amount: 80,
          supplier_cash_paid_amount: 20,
        },
      ]))),
      listUnallocatedExpenseItems: mock(async () => new Map()),
      listLedgerTrend: mock(async () => []),
      listReceivableTotals: mock(async () => new Map(projectIds.map((id) => [
        id,
        {
          receivable_amount: 50,
          receivable_paid_amount: 50,
          receivable_remaining_amount: 0,
          overdue_amount: 0,
          overdue_count: 0,
        },
      ]))),
      listBudgetTotals: mock(async () => new Map(projectIds.map((id) => [
        id,
        {
          budget_amount: 100,
          category_budgets: new Map([
            ["category-1", {
              budget_amount: 50,
              warning_threshold_percent: 100,
            }],
          ]),
        },
      ]))),
    },
    accessPolicyService: {
      assertTenantContext: mock(() => "tenant-1"),
      hasPermission: mock(() => true),
      canAccessProject: mock(async () => true),
    },
  };
}

describe("FinanceProjectSummaryService supplier totals", () => {
  test("counts supplier cost in profit without subtracting supplier cash twice", async () => {
    const deps = dependencies();
    const { FinanceProjectSummaryService } = await import(
      "./finance-project-summary"
    );
    const service = new FinanceProjectSummaryService(deps as never);
    const result = await service.listProjectSummaries(auth, {
      page: 1,
      pageSize: 20,
      include_analytics: false,
    });

    expect(deps.repository.listSupplierTotals).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectIds: ["project-1"],
    });
    expect(result.list[0]).toMatchObject({
      expense_paid_amount: 10,
      supplier_cost_amount: 40,
      supplier_payable_open_amount: 80,
      supplier_cash_paid_amount: 20,
      actual_profit_amount: 0,
      projected_profit_amount: 50,
      net_cash_flow_amount: 20,
      budget_remaining_amount: 50,
      budget_usage_ratio: 0.5,
    });
    expect(result.summary).toMatchObject({
      supplier_cost_amount: 40,
      supplier_payable_open_amount: 80,
      supplier_cash_paid_amount: 20,
      actual_profit_amount: 0,
      net_cash_flow_amount: 20,
    });
  });

  test("loads all project supplier facts once instead of per-project N+1", async () => {
    const deps = dependencies(["project-1", "project-2"]);
    const { FinanceProjectSummaryService } = await import(
      "./finance-project-summary"
    );
    const service = new FinanceProjectSummaryService(deps as never);

    const result = await service.listProjectSummaries(auth, {
      page: 1,
      pageSize: 20,
      include_analytics: false,
    });

    expect(result.list).toHaveLength(2);
    expect(deps.repository.listSupplierTotals).toHaveBeenCalledTimes(1);
    expect(deps.repository.listSupplierTotals).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectIds: ["project-1", "project-2"],
    });
  });

  test("includes supplier category cost in category-over-budget risk", async () => {
    const deps = dependencies();
    const { FinanceProjectSummaryService } = await import(
      "./finance-project-summary"
    );
    deps.repository.listSupplierTotals.mockImplementationOnce(async () =>
      new Map([["project-1", {
        supplier_cost_amount: 60,
        supplier_cost_by_category: new Map([["category-1", 60]]),
        supplier_payable_open_amount: 60,
        supplier_cash_paid_amount: 0,
      }]])
    );
    const service = new FinanceProjectSummaryService(deps as never);

    const result = await service.listProjectSummaries(auth, {
      page: 1,
      pageSize: 20,
      include_analytics: false,
    });

    expect(result.list[0]?.risk_flags).toContain("category_over_budget");
  });
});
