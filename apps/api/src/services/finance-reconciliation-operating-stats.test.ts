import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { CreateFinanceReconciliationActionInput } from "@/repositories/finance-reconciliation-actions";
import type { AuthContext } from "@/services/authorization";
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
const listActions = mock(async () => ({ list: [], pagination: {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
} }));
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

describe("financeReconciliationOperatingStats", () => {
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

  test("returns operating stats for the current exception scope", async () => {
    const service = await createService();

    const result = await service.getOperatingStats(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      {
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      },
    );

    expect(result.scope).toEqual({
      date_from: "2026-06-01",
      date_to: "2026-06-30",
      stale_days: [3, 7],
    });
    expect(result.summary).toEqual({
      total: 6,
      danger: 3,
      warning: 3,
      info: 0,
      open: 6,
      acknowledged: 0,
      ignored: 0,
      resolved: 0,
      total_amount: 31000,
      stale_open_over_3_days: 5,
      stale_open_over_7_days: 4,
      latest_exception_at: "2026-06-30T00:00:00.000Z",
      latest_action_at: null,
    });
    expect(result.by_exception_code.map((item) => item.key).sort()).toEqual([
      "allocation_amount_mismatch",
      "ledger_without_payment",
      "payment_unallocated",
      "payment_without_ledger",
      "receivable_overdue",
      "receivable_paid_amount_mismatch",
    ]);
    expect(result.by_status).toEqual([
      { key: "open", label: "未处理", count: 6 },
      { key: "acknowledged", label: "已确认", count: 0 },
      { key: "ignored", label: "已忽略", count: 0 },
      { key: "resolved", label: "人工闭环", count: 0 },
    ]);
    expect(result.recent_actions).toEqual([]);
  });

  test("returns latest action distribution and recent actions", async () => {
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
        [
          "ledger_without_payment:ledger-without-payment",
          {
            id: "action-ignored",
            tenant_id: "tenant-1",
            exception_fingerprint: "ledger_without_payment:ledger-without-payment",
            exception_code: "ledger_without_payment",
            subject_type: "ledger",
            subject_id: "ledger-without-payment",
            project_id: "project-7",
            action: "ignore",
            remark: "历史流水保留",
            actor_employee_id: "employee-1",
            actor_employee_name: "财务",
            created_at: "2026-06-29T11:00:00.000Z",
          },
        ],
      ])
    );
    const service = await createService();

    const result = await service.getOperatingStats(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      {
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      },
    );

    expect(result.summary.open).toBe(4);
    expect(result.summary.ignored).toBe(1);
    expect(result.summary.resolved).toBe(1);
    expect(result.summary.latest_action_at).toBe("2026-06-30T08:00:00.000Z");
    expect(result.by_status).toEqual([
      { key: "open", label: "未处理", count: 4 },
      { key: "acknowledged", label: "已确认", count: 0 },
      { key: "ignored", label: "已忽略", count: 1 },
      { key: "resolved", label: "人工闭环", count: 1 },
    ]);
    expect(result.recent_actions).toEqual([
      expect.objectContaining({
        exception_fingerprint: "payment_unallocated:payment-unallocated",
        status: "resolved",
        action: "resolve",
        actor_employee_name: "小龙女",
        acted_at: "2026-06-30T08:00:00.000Z",
        remark: "已补核销",
      }),
      expect.objectContaining({
        exception_fingerprint: "ledger_without_payment:ledger-without-payment",
        status: "ignored",
        action: "ignore",
        actor_employee_name: "财务",
        acted_at: "2026-06-29T11:00:00.000Z",
        remark: "历史流水保留",
      }),
    ]);
  });

  test("rejects operating stats without finance permissions", async () => {
    const service = await createService();

    await expect(
      service.getOperatingStats(
        authContextWithPermissions([{ code: "project.read", scope: "all" }]),
        {
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
});
