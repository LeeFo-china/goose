import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const findProject = mock(async () => ({
  id: "project-1",
  tenant_id: "tenant-1",
  name: "测试项目",
}));

const listActiveBudgets = mock(async () => [
  {
    id: "budget-1",
    tenant_id: "tenant-1",
    project_id: "project-1",
    cost_category_id: "category-1",
    budget_amount: 30000,
    warning_threshold_percent: 100,
    remark: "人工预算",
    status: "active",
    created_at: "2026-06-24T10:00:00.000Z",
    updated_at: "2026-06-24T10:00:00.000Z",
    cost_category: {
      id: "category-1",
      code: "labor",
      name: "人工",
      status: "active",
      sort_order: 10,
    },
  },
  {
    id: "budget-2",
    tenant_id: "tenant-1",
    project_id: "project-1",
    cost_category_id: "category-2",
    budget_amount: 50000,
    warning_threshold_percent: 100,
    remark: "主材预算",
    status: "active",
    created_at: "2026-06-24T10:00:00.000Z",
    updated_at: "2026-06-24T10:00:00.000Z",
    cost_category: {
      id: "category-2",
      code: "main_material",
      name: "主材",
      status: "active",
      sort_order: 20,
    },
  },
]);

const listExpenseTotals = mock(async () => ({
  totalExpenseAmount: 36000,
  unallocatedExpenseAmount: 1000,
  byCategory: new Map([
    ["category-1", 12000],
    ["category-2", 23000],
  ]),
}));

const listActiveCategoriesByIds = mock(async () => [
  { id: "category-1", code: "labor", name: "人工", status: "active" },
]);

const saveBudgets = mock(async () => [
  {
    id: "budget-1",
    tenant_id: "tenant-1",
    project_id: "project-1",
    cost_category_id: "category-1",
    budget_amount: 30000,
    warning_threshold_percent: 100,
    remark: "人工预算",
    status: "active",
    created_at: "2026-06-24T10:00:00.000Z",
    updated_at: "2026-06-24T10:10:00.000Z",
    cost_category: {
      id: "category-1",
      code: "labor",
      name: "人工",
      status: "active",
      sort_order: 10,
    },
  },
]);

const canAccessProject = mock(async () => true);

mock.module("@/repositories/project-cost-budgets", () => ({
  projectCostBudgetRepository: {
    findProject,
    listActiveBudgets,
    listExpenseTotals,
    listActiveCategoriesByIds,
    saveBudgets,
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

describe("projectCostBudgetService", () => {
  beforeEach(() => {
    findProject.mockClear();
    listActiveBudgets.mockClear();
    listExpenseTotals.mockClear();
    listActiveCategoriesByIds.mockClear();
    saveBudgets.mockClear();
    canAccessProject.mockClear();
    findProject.mockImplementation(async () => ({
      id: "project-1",
      tenant_id: "tenant-1",
      name: "测试项目",
    }));
    canAccessProject.mockImplementation(async () => true);
  });

  test("returns project budget summary with category expense totals", async () => {
    const { projectCostBudgetService } = await import("./project-cost-budgets");

    const result = await projectCostBudgetService.listProjectBudgets(
      authContextWithPermissions([{ code: "finance.budget.view", scope: "all" }]),
      "project-1",
    );

    expect(findProject).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    expect(listActiveBudgets).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    expect(listExpenseTotals).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    expect(result.summary).toMatchObject({
      budget_configured: true,
      budget_amount: 80000,
      expense_amount: 36000,
      remaining_amount: 44000,
      usage_ratio: 0.45,
      unallocated_expense_amount: 1000,
    });
    expect(result.list[0]).toMatchObject({
      category_code: "labor",
      category_name: "人工",
      budget_amount: 30000,
      expense_amount: 12000,
      remaining_amount: 18000,
      usage_ratio: 0.4,
      risk_level: "normal",
    });
  });

  test("allows project readers to view budgets without finance permission", async () => {
    const { projectCostBudgetService } = await import("./project-cost-budgets");

    await projectCostBudgetService.listProjectBudgets(
      authContextWithPermissions([{ code: "project.read", scope: "all" }]),
      "project-1",
    );

    expect(canAccessProject).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: "employee-1" }),
      "project-1",
      "project.read",
    );
  });

  test("upserts project budgets for finance budget managers", async () => {
    const { projectCostBudgetService } = await import("./project-cost-budgets");

    const result = await projectCostBudgetService.saveProjectBudgets(
      authContextWithPermissions([
        { code: "finance.budget.manage", scope: "all" },
      ]),
      "project-1",
      {
        items: [
          {
            cost_category_id: "category-1",
            budget_amount: 30000,
            warning_threshold_percent: 100,
            remark: "人工预算",
          },
        ],
      },
    );

    expect(listActiveCategoriesByIds).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      categoryIds: ["category-1"],
    });
    expect(saveBudgets).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      employeeId: "employee-1",
      items: [
        {
          cost_category_id: "category-1",
          budget_amount: 30000,
          warning_threshold_percent: 100,
          remark: "人工预算",
        },
      ],
    });
    expect(result.list).toHaveLength(1);
    expect(result.summary).toMatchObject({
      budget_configured: true,
      budget_amount: 30000,
    });
  });

  test("rejects budget updates without manage permission", async () => {
    const { projectCostBudgetService } = await import("./project-cost-budgets");

    await expect(
      projectCostBudgetService.saveProjectBudgets(
        authContextWithPermissions([
          { code: "finance.budget.view", scope: "all" },
        ]),
        "project-1",
        {
          items: [
            {
              cost_category_id: "category-1",
              budget_amount: 30000,
              warning_threshold_percent: 100,
            },
          ],
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(saveBudgets).not.toHaveBeenCalled();
  });
});
