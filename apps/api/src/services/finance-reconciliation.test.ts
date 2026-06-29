import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { CreateFinanceReconciliationActionInput } from "@/repositories/finance-reconciliation-actions";
import type { AuthContext } from "@/services/authorization";
import { reconciliationActionHistoryResponse } from "@/services/finance-reconciliation-action-history.test-fixtures";
import {
  reconciliationCandidateRows,
  reconciliationProjectSummaryTotals,
} from "@/services/finance-reconciliation.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listCandidateRows = mock(async () => reconciliationCandidateRows);
const getProjectSummaryTotals = mock(async () => reconciliationProjectSummaryTotals);
const listLatestActions = mock(async () => new Map());
const listActions = mock(async () => reconciliationActionHistoryResponse);
const createAction = mock(async (input: CreateFinanceReconciliationActionInput) => ({
  id: "action-1",
  tenant_id: input.tenantId,
  exception_fingerprint: input.exceptionFingerprint,
  exception_code: input.exceptionCode,
  subject_type: input.subjectType,
  subject_id: input.subjectId,
  project_id: input.projectId,
  action: input.action,
  remark: input.remark,
  actor_employee_id: input.actorEmployeeId,
  actor_employee_name: "财务",
  created_at: "2026-06-30T08:00:00.000Z",
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
  canAccessProject: mock(async () => true),
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
      getProjectSummaryTotals,
    },
    actionsRepository: {
      listLatestActions,
      listActions,
      createAction,
    },
    accessPolicyService: accessPolicy,
  });
}

describe("financeReconciliationService", () => {
  beforeEach(() => {
    listCandidateRows.mockClear();
    getProjectSummaryTotals.mockClear();
    listLatestActions.mockClear();
    listActions.mockClear();
    createAction.mockClear();
    listLatestActions.mockImplementation(async () => new Map());
    accessPolicy.assertTenantContext.mockClear();
    accessPolicy.hasPermission.mockClear();
    accessPolicy.canAccessProject.mockClear();
    accessPolicy.canAccessProject.mockImplementation(async () => true);
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
        exception_fingerprint: "payment_without_ledger:payment-without-ledger",
        subject_type: "payment",
        subject_id: "payment-without-ledger",
        project_id: "project-3",
        project_name: "未入账项目",
        exception_code: "payment_without_ledger",
        level: "danger",
        amount: 10000,
        action: expect.objectContaining({
          key: "open_project_payment_ledger",
          target: "/finance/ledger?project_id=project-3&direction=in&entry_type=project_payment",
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
        action: expect.objectContaining({
          key: "open_receivable_overdue",
          target:
            "/finance/receivables?project_id=project-1&status=overdue&receivable_plan_id=plan-overdue",
        }),
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

  test("merges latest action state before status and actor filters", async () => {
    listLatestActions.mockImplementationOnce(async () =>
      new Map([
        [
          "payment_unallocated:payment-unallocated",
          {
            id: "action-resolved",
            tenant_id: "tenant-1",
            exception_fingerprint: "payment_unallocated:payment-unallocated",
            exception_code: "payment_unallocated",
            subject_type: "payment",
            subject_id: "payment-unallocated",
            project_id: "project-4",
            action: "resolve",
            remark: "已补核销",
            actor_employee_id: "employee-2",
            actor_employee_name: "小龙女",
            created_at: "2026-06-30T08:00:00.000Z",
          },
        ],
      ])
    );
    const service = await createService();

    const result = await service.listExceptions(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      {
        page: 1,
        pageSize: 20,
        date_from: "2026-06-01",
        date_to: "2026-06-30",
        status: "resolved",
        actor_employee_id: "employee-2",
      },
    );

    expect(result.pagination.total).toBe(1);
    expect(result.summary).toEqual({
      total: 1,
      danger: 0,
      warning: 1,
      info: 0,
    });
    expect(result.list).toEqual([
      expect.objectContaining({
        id: "payment-unallocated",
        exception_fingerprint: "payment_unallocated:payment-unallocated",
        status: "resolved",
        last_action: "resolve",
        last_action_remark: "已补核销",
        last_actor_employee_id: "employee-2",
        last_actor_employee_name: "小龙女",
      }),
    ]);
    expect(listLatestActions).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      fingerprints: expect.arrayContaining([
        "payment_unallocated:payment-unallocated",
      ]),
    });
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

  test("creates an exception action for the current computed exception", async () => {
    const service = await createService();

    const result = await service.createExceptionAction(
      authContextWithPermissions([
        { code: "finance.view", scope: "all" },
        { code: "finance.reconciliation.manage", scope: "all" },
      ]),
      "payment_without_ledger:payment-without-ledger",
      {
        action: "acknowledge",
        remark: "已通知出纳补录台账",
      },
    );

    expect(result).toEqual(expect.objectContaining({
      exception_fingerprint: "payment_without_ledger:payment-without-ledger",
      action: "acknowledge",
      remark: "已通知出纳补录台账",
      actor_employee_id: "employee-1",
    }));
    expect(createAction).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      exceptionFingerprint: "payment_without_ledger:payment-without-ledger",
      exceptionCode: "payment_without_ledger",
      subjectType: "payment",
      subjectId: "payment-without-ledger",
      projectId: "project-3",
      action: "acknowledge",
      remark: "已通知出纳补录台账",
      actorEmployeeId: "employee-1",
    });
  });

  test("lists exception action history with pagination", async () => {
    const service = await createService();

    const result = await service.listExceptionActions(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      "payment_without_ledger:payment-without-ledger",
      {
        page: 1,
        pageSize: 20,
      },
    );

    expect(result.pagination.total).toBe(2);
    expect(result.list.map((item) => item.action)).toEqual([
      "resolve",
      "acknowledge",
    ]);
    expect(listActions).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      exceptionFingerprint: "payment_without_ledger:payment-without-ledger",
      page: 1,
      pageSize: 20,
    });
  });

  test("rejects exception action history without finance permissions", async () => {
    const service = await createService();

    await expect(
      service.listExceptionActions(
        authContextWithPermissions([{ code: "project.read", scope: "all" }]),
        "payment_without_ledger:payment-without-ledger",
        {
          page: 1,
          pageSize: 20,
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(listActions).not.toHaveBeenCalled();
  });

  test("rejects exception actions without manage permission", async () => {
    const service = await createService();

    await expect(
      service.createExceptionAction(
        authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
        "payment_without_ledger:payment-without-ledger",
        {
          action: "acknowledge",
          remark: "已通知出纳补录台账",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(createAction).not.toHaveBeenCalled();
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

  test("returns project reconciliation summary with exception counts", async () => {
    const service = await createService();

    const result = await service.getProjectSummary(
      authContextWithPermissions([{ code: "project.read", scope: "all" }]),
      "project-1",
    );

    expect(result).toEqual({
      project_id: "project-1",
      receivable_amount: 30000,
      received_amount: 28000,
      allocated_amount: 25000,
      ledger_income_amount: 28000,
      expense_paid_amount: 12000,
      ledger_expense_amount: 12000,
      exception_count: 6,
      danger_count: 3,
      warning_count: 3,
      open_exception_count: 6,
      acknowledged_exception_count: 0,
      ignored_exception_count: 0,
      resolved_exception_count: 0,
      latest_exception_at: "2026-06-30T00:00:00.000Z",
      latest_action_at: null,
      latest_action_remark: null,
      latest_actor_employee_name: null,
    });
    expect(accessPolicy.canAccessProject).toHaveBeenCalledWith(
      expect.any(Object),
      "project-1",
      "project.read",
    );
    expect(getProjectSummaryTotals).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
    });
    expect(listCandidateRows).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        projectId: "project-1",
      }),
    );
  });

  test("returns project reconciliation summary with latest action state", async () => {
    listLatestActions.mockImplementationOnce(async () =>
      new Map([
        [
          "ledger_without_payment:ledger-without-payment",
          {
            id: "action-2",
            tenant_id: "tenant-1",
            exception_fingerprint: "ledger_without_payment:ledger-without-payment",
            exception_code: "ledger_without_payment",
            subject_type: "ledger",
            subject_id: "ledger-without-payment",
            project_id: "project-7",
            action: "ignore",
            remark: "历史手工流水保留",
            actor_employee_id: "employee-1",
            actor_employee_name: "财务",
            created_at: "2026-06-29T11:00:00.000Z",
          },
        ],
      ])
    );
    const service = await createService();

    const result = await service.getProjectSummary(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      "project-1",
    );

    expect(result.open_exception_count).toBe(5);
    expect(result.ignored_exception_count).toBe(1);
    expect(result.latest_action_at).toBe("2026-06-29T11:00:00.000Z");
    expect(result.latest_action_remark).toBe("历史手工流水保留");
    expect(result.latest_actor_employee_name).toBe("财务");
  });
});
