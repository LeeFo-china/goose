import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listCandidateRows = mock(async () => ({
  receivables: [
    {
      id: "plan-overdue",
      project_id: "project-1",
      project_name: "逾期项目",
      title: "中期款",
      amount: 10000,
      paid_amount: 0,
      due_date: "2026-06-01",
      status: "pending",
      allocation_amount: 0,
    },
    {
      id: "plan-paid-mismatch",
      project_id: "project-2",
      project_name: "核销不一致项目",
      title: "尾款",
      amount: 10000,
      paid_amount: 7000,
      due_date: "2026-06-30",
      status: "partially_paid",
      allocation_amount: 5000,
    },
  ],
  payments: [
    {
      id: "payment-without-ledger",
      project_id: "project-3",
      project_name: "未入账项目",
      amount: 10000,
      status: "confirmed",
      pay_date: "2026-06-20T10:00:00.000Z",
      created_at: "2026-06-20T10:00:00.000Z",
      allocation_amount: 10000,
      ledger_amount: 0,
    },
    {
      id: "payment-unallocated",
      project_id: "project-4",
      project_name: "未完全核销项目",
      amount: 10000,
      status: "confirmed",
      pay_date: "2026-06-21T10:00:00.000Z",
      created_at: "2026-06-21T10:00:00.000Z",
      allocation_amount: 6000,
      ledger_amount: 10000,
    },
    {
      id: "payment-over-allocated",
      project_id: "project-5",
      project_name: "超额核销项目",
      amount: 10000,
      status: "confirmed",
      pay_date: "2026-06-22T10:00:00.000Z",
      created_at: "2026-06-22T10:00:00.000Z",
      allocation_amount: 12000,
      ledger_amount: 10000,
    },
    {
      id: "payment-clean",
      project_id: "project-6",
      project_name: "正常项目",
      amount: 10000,
      status: "confirmed",
      pay_date: "2026-06-23T10:00:00.000Z",
      created_at: "2026-06-23T10:00:00.000Z",
      allocation_amount: 10000,
      ledger_amount: 10000,
    },
  ],
  ledgers: [
    {
      id: "ledger-without-payment",
      project_id: "project-7",
      project_name: "手工流水项目",
      amount: 3000,
      occurred_at: "2026-06-24T10:00:00.000Z",
      payment_id: null,
    },
    {
      id: "ledger-clean",
      project_id: "project-6",
      project_name: "正常项目",
      amount: 10000,
      occurred_at: "2026-06-23T10:00:00.000Z",
      payment_id: "payment-clean",
    },
  ],
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
  const { FinanceReconciliationService } = await import(
    "./finance-reconciliation"
  );
  return new FinanceReconciliationService({
    repository: {
      listCandidateRows,
    },
    accessPolicyService: accessPolicy,
  });
}

describe("financeReconciliationService", () => {
  beforeEach(() => {
    listCandidateRows.mockClear();
    accessPolicy.assertTenantContext.mockClear();
    accessPolicy.hasPermission.mockClear();
  });

  test("lists receivable, payment, allocation, and ledger exceptions", async () => {
    const service = await createService();

    const result = await service.listExceptions(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      {
        page: 1,
        pageSize: 20,
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      },
    );

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 6,
      totalPages: 1,
    });
    expect(result.summary).toEqual({
      total: 6,
      danger: 3,
      warning: 3,
      info: 0,
    });
    expect(result.list.map((item) => item.exception_code).sort()).toEqual([
      "allocation_amount_mismatch",
      "ledger_without_payment",
      "payment_unallocated",
      "payment_without_ledger",
      "receivable_overdue",
      "receivable_paid_amount_mismatch",
    ]);
    expect(result.list).toContainEqual(
      expect.objectContaining({
        id: "payment-without-ledger",
        project_id: "project-3",
        project_name: "未入账项目",
        exception_code: "payment_without_ledger",
        level: "danger",
        amount: 10000,
        action: expect.objectContaining({
          key: "open_payment",
          target: "/finance/receivables?project_id=project-3",
        }),
      }),
    );
    expect(result.list).toContainEqual(
      expect.objectContaining({
        id: "plan-overdue",
        exception_code: "receivable_overdue",
        level: "warning",
        amount: 10000,
        occurred_at: "2026-06-01T00:00:00.000Z",
      }),
    );
    expect(listCandidateRows).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        dateFrom: "2026-06-01",
        dateTo: "2026-06-30",
      }),
    );
  });

  test("filters exception code before pagination", async () => {
    const service = await createService();

    const result = await service.listExceptions(
      authContextWithPermissions([{ code: "finance.receivable.view", scope: "all" }]),
      {
        page: 1,
        pageSize: 1,
        date_from: "2026-06-01",
        date_to: "2026-06-30",
        exception_code: "payment_unallocated",
      },
    );

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 1,
      totalPages: 1,
    });
    expect(result.summary).toEqual({
      total: 1,
      danger: 0,
      warning: 1,
      info: 0,
    });
    expect(result.list).toEqual([
      expect.objectContaining({
        id: "payment-unallocated",
        exception_code: "payment_unallocated",
        amount: 4000,
      }),
    ]);
  });

  test("rejects users without finance permissions", async () => {
    const service = await createService();

    await expect(
      service.listExceptions(
        authContextWithPermissions([{ code: "project.read", scope: "all" }]),
        {
          page: 1,
          pageSize: 20,
          date_from: "2026-06-01",
          date_to: "2026-06-30",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(listCandidateRows).not.toHaveBeenCalled();
  });

  test("rejects date ranges longer than 366 days", async () => {
    const service = await createService();

    await expect(
      service.listExceptions(
        authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
        {
          page: 1,
          pageSize: 20,
          date_from: "2025-01-01",
          date_to: "2026-06-30",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(listCandidateRows).not.toHaveBeenCalled();
  });
});
