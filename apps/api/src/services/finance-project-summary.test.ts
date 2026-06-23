import { beforeEach, describe, expect, mock, test } from "bun:test";
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
  }],
]));
const listReceivableTotals = mock(async () => new Map([
  ["project-1", {
    receivable_amount: 80000,
    receivable_paid_amount: 50000,
    receivable_remaining_amount: 30000,
    overdue_amount: 10000,
    overdue_count: 1,
  }],
]));
const canAccessProject = mock(async () => true);

mock.module("@/repositories/finance-project-summary", () => ({
  financeProjectSummaryRepository: {
    listProjects,
    findProject,
    listLedgerTotals,
    listReceivableTotals,
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
      overdue_amount: 10000,
      overdue_count: 1,
    });
    expect(first.actual_gross_margin).toBe(0.76);
    expect(first.projected_gross_margin).toBe(0.88);
    expect(result.summary).toMatchObject({
      project_count: 1,
      contract_amount: 100000,
      received_amount: 50000,
      expense_paid_amount: 12000,
      actual_profit_amount: 38000,
    });
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
