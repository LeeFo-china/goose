import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

const auth = {
  tenantId: "tenant-1",
  employeeId: "employee-1",
  authUserId: "user-1",
  permissions: [{ code: "finance.budget.view", scope: "all" }],
} as unknown as AuthContext;

function dependencies() {
  return {
    repository: {
      findProject: mock(async () => ({
        id: "project-1",
        tenant_id: "tenant-1",
        name: "项目",
      })),
      listActiveBudgets: mock(async () => [{
        id: "budget-1",
        tenant_id: "tenant-1",
        project_id: "project-1",
        cost_category_id: "category-1",
        budget_amount: 100,
        warning_threshold_percent: 100,
        remark: null,
        status: "active",
        created_at: null,
        updated_at: null,
        cost_category: {
          id: "category-1",
          code: "material",
          name: "材料",
          status: "active",
          sort_order: 1,
        },
      }]),
      listExpenseTotals: mock(async () => ({
        sourceRowCount: 0,
        totalExpenseAmount: 0,
        unallocatedExpenseAmount: 0,
        byCategory: new Map<string, number>(),
      })),
      listCommitmentTotals: mock(async () => ({
        sourceRowCount: 1,
        totalCommitmentAmount: 60,
        byCategory: new Map([["category-1", 60]]),
        categoryDetails: new Map([
          ["category-1", { code: "material", name: "材料" }],
        ]),
      })),
      listSupplierCostTotals: mock(async () => ({
        sourceRowCount: 1,
        totalSupplierCostAmount: 40,
        byCategory: new Map([["category-1", 40]]),
      })),
      listActiveCategoriesByIds: mock(async () => []),
      saveBudgets: mock(async () => []),
    },
    accessPolicyService: {
      assertTenantContext: mock(() => "tenant-1"),
      hasPermission: mock(() => true),
      canAccessProject: mock(async () => true),
    },
  };
}

describe("ProjectCostBudgetService supplier cost", () => {
  test("separates recognized supplier cost from active residual commitments", async () => {
    const deps = dependencies();
    const { ProjectCostBudgetService } = await import(
      "./project-cost-budgets"
    );
    const service = new ProjectCostBudgetService(deps as never);

    const result = await service.listProjectBudgets(auth, "project-1");

    expect(deps.repository.listSupplierCostTotals).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    expect(result.summary).toMatchObject({
      expense_amount: 0,
      actual_supplier_cost_amount: 40,
      commitment_amount: 60,
      remaining_amount: 60,
      available_amount: 0,
      usage_ratio: 0.4,
    });
    expect(result.list[0]).toMatchObject({
      expense_amount: 0,
      supplier_cost_amount: 40,
      commitment_amount: 60,
      active_commitment_amount: 60,
      remaining_amount: 60,
      available_amount: 0,
      usage_ratio: 0.4,
    });
  });

  test("keeps multiple supplier-cost categories without N+1 calls", async () => {
    const deps = dependencies();
    deps.repository.listSupplierCostTotals.mockImplementation(async () => ({
      sourceRowCount: 2,
      totalSupplierCostAmount: 50,
      byCategory: new Map([
        ["category-1", 40],
        ["category-2", 10],
      ]),
    }));
    const { ProjectCostBudgetService } = await import(
      "./project-cost-budgets"
    );
    const service = new ProjectCostBudgetService(deps as never);

    const result = await service.listProjectBudgets(auth, "project-1");

    expect(deps.repository.listSupplierCostTotals).toHaveBeenCalledTimes(1);
    expect(result.list).toHaveLength(2);
    expect(result.list[1]).toMatchObject({
      cost_category_id: "category-2",
      supplier_cost_amount: 10,
      active_commitment_amount: 0,
    });
  });
});
