import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listLedgerRows = mock(async () => [
  {
    id: "ledger-income-1",
    project_id: "project-1",
    amount: 10000,
    direction: "in",
    entry_type: "project_payment",
    occurred_at: "2026-06-10T10:00:00.000Z",
    metadata: { payment_type: "deposit" },
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
  },
  {
    id: "ledger-expense-1",
    project_id: "project-1",
    amount: 3000,
    direction: "out",
    entry_type: "expense_settlement",
    occurred_at: "2026-06-11T10:00:00.000Z",
    metadata: {},
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: "category-1",
    cost_category_name: "人工",
  },
  {
    id: "ledger-income-2",
    project_id: "project-2",
    amount: 5000,
    direction: "in",
    entry_type: "project_payment",
    occurred_at: "2026-06-12T10:00:00.000Z",
    metadata: { payment_type: "stage_2" },
    project_name: "B 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
  },
  {
    id: "supplier-payment-1",
    project_id: "project-1",
    amount: 100,
    direction: "out",
    entry_type: "supplier_payment",
    occurred_at: "2026-06-13T10:00:00.000Z",
    metadata: {},
    project_name: "A 项目",
    project_status: "constructing",
    cost_category_id: null,
    cost_category_name: null,
  },
]);
const listSupplierCostRows = mock(async () => [{
  id: "supplier-cost-1",
  project_id: "project-1",
  amount: 100,
  occurred_at: "2026-06-13T09:00:00.000Z",
  project_name: "A 项目",
  project_status: "constructing",
  cost_category_id: "category-1",
  cost_category_name: "人工",
}]);
const listReceivableRows = mock(async () => [
  {
    id: "receivable-1",
    project_id: "project-1",
    project_name: "A 项目",
    project_status: "constructing",
    amount: 12000,
    paid_amount: 10000,
    due_date: "2026-06-05",
    status: "partially_paid",
    payment_type: "deposit",
  },
  {
    id: "receivable-2",
    project_id: "project-2",
    project_name: "B 项目",
    project_status: "constructing",
    amount: 6000,
    paid_amount: 5000,
    due_date: "2026-06-30",
    status: "partially_paid",
    payment_type: "stage_2",
  },
]);

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
  const { FinanceOperatingReportService } = await import(
    "./finance-operating-report"
  );
  return new FinanceOperatingReportService({
    repository: {
      listLedgerRows,
      listSupplierCostRows,
      listReceivableRows,
    },
    accessPolicyService: accessPolicy,
  });
}

describe("financeOperatingReportService", () => {
  beforeEach(() => {
    listLedgerRows.mockClear();
    listSupplierCostRows.mockClear();
    listReceivableRows.mockClear();
    accessPolicy.assertTenantContext.mockClear();
    accessPolicy.hasPermission.mockClear();
  });

  test("returns operating report grouped by project", async () => {
    const service = await createService();

    const result = await service.getOperatingReport(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      {
        date_from: "2026-06-01",
        date_to: "2026-06-30",
        group_by: "project",
      },
    );

    expect(result.summary).toEqual({
      received_amount: 15000,
      expense_amount: 3100,
      actual_profit_amount: 11900,
      receivable_remaining_amount: 3000,
      overdue_amount: 2000,
      unallocated_expense_amount: 0,
    });
    expect(result.groups).toEqual([
      expect.objectContaining({
        key: "project-1",
        label: "A 项目",
        received_amount: 10000,
        expense_amount: 3100,
        actual_profit_amount: 6900,
        overdue_amount: 2000,
      }),
      expect.objectContaining({
        key: "project-2",
        label: "B 项目",
        received_amount: 5000,
        expense_amount: 0,
        actual_profit_amount: 5000,
        overdue_amount: 0,
      }),
    ]);
    expect(listLedgerRows).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      projectId: undefined,
      projectStatus: undefined,
      sourceLimit: 10000,
    });
    expect(listSupplierCostRows).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      dateFrom: "2026-06-01",
      dateTo: "2026-06-30",
      projectId: undefined,
      projectStatus: undefined,
      sourceLimit: 10000,
    });
  });

  test("reports supplier cost before payment in project groups", async () => {
    listLedgerRows.mockImplementationOnce(async () => []);
    listReceivableRows.mockImplementationOnce(async () => []);
    const service = await createService();

    const result = await service.getOperatingReport(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      {
        date_from: "2026-06-01",
        date_to: "2026-06-30",
        group_by: "project",
      },
    );

    expect(result.summary.expense_amount).toBe(100);
    expect(result.summary.actual_profit_amount).toBe(-100);
    expect(result.summary.unallocated_expense_amount).toBe(0);
    expect(result.groups[0]).toMatchObject({
      key: "project-1",
      expense_amount: 100,
    });
  });

  test("rejects report ranges longer than 366 days", async () => {
    const service = await createService();

    await expect(
      service.getOperatingReport(
        authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
        {
          date_from: "2025-01-01",
          date_to: "2026-06-30",
          group_by: "month",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(listLedgerRows).not.toHaveBeenCalled();
  });
});
