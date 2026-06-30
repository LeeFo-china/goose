import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const monthlyOverview = {
  scope: {
    month: "2026-06",
    date_from: "2026-06-01",
    date_to: "2026-06-30",
    source_limit: 10000,
    truncated: false,
  },
  summary: {
    income_amount: 20000,
    expense_amount: 9500,
    gross_profit_amount: 10500,
    gross_profit_rate: 0.525,
    receivable_amount: 30000,
    received_amount: 20000,
    receivable_remaining_amount: 10000,
    overdue_receivable_amount: 5000,
    reconciliation_exception_count: 2,
    unallocated_expense_amount: 1500,
  },
  closing: {
    id: null,
    status: "not_started" as const,
    closed_at: null,
    reopened_at: null,
    notes: null,
    snapshot_summary: null,
  },
};

const getMonthlyOverview = mock(async () => monthlyOverview);

const findByMonth = mock(async () => null);
const listPeriods = mock(async () => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
}));
const upsertDraft = mock(async (input) => ({
  id: "closing-1",
  tenant_id: input.tenantId,
  period_month: input.periodMonth,
  status: "draft" as const,
  closed_at: null,
  closed_by_employee_id: null,
  reopened_at: null,
  reopened_by_employee_id: null,
  reopen_reason: null,
  snapshot_json: input.snapshotJson,
  notes: input.notes,
  created_at: "2026-06-30T10:00:00.000Z",
  updated_at: "2026-06-30T10:00:00.000Z",
}));
const findById = mock(async () => ({
  id: "closing-1",
  tenant_id: "tenant-1",
  period_month: "2026-06",
  status: "draft" as const,
  closed_at: null,
  closed_by_employee_id: null,
  reopened_at: null,
  reopened_by_employee_id: null,
  reopen_reason: null,
  snapshot_json: monthlyOverview,
  notes: "草稿",
  created_at: "2026-06-30T10:00:00.000Z",
  updated_at: "2026-06-30T10:00:00.000Z",
}));
const closePeriod = mock(async (input) => ({
  id: input.id,
  tenant_id: input.tenantId,
  period_month: "2026-06",
  status: "closed" as const,
  closed_at: "2026-06-30T12:00:00.000Z",
  closed_by_employee_id: input.closedByEmployeeId,
  reopened_at: null,
  reopened_by_employee_id: null,
  reopen_reason: null,
  snapshot_json: input.snapshotJson,
  notes: input.notes,
  created_at: "2026-06-30T10:00:00.000Z",
  updated_at: "2026-06-30T12:00:00.000Z",
}));
const reopenPeriod = mock(async (input) => ({
  id: input.id,
  tenant_id: input.tenantId,
  period_month: "2026-06",
  status: "reopened" as const,
  closed_at: "2026-06-30T12:00:00.000Z",
  closed_by_employee_id: "employee-1",
  reopened_at: "2026-06-30T13:00:00.000Z",
  reopened_by_employee_id: input.reopenedByEmployeeId,
  reopen_reason: input.reason,
  snapshot_json: monthlyOverview,
  notes: "草稿",
  created_at: "2026-06-30T10:00:00.000Z",
  updated_at: "2026-06-30T13:00:00.000Z",
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
  const { FinanceClosingPeriodService } = await import(
    "./finance-closing-periods"
  );
  return new FinanceClosingPeriodService({
    repository: {
      list: listPeriods,
      findByMonth,
      upsertDraft,
      findById,
      close: closePeriod,
      reopen: reopenPeriod,
    },
    monthlyOverviewService: {
      getMonthlyOverview,
    },
    accessPolicyService: accessPolicy,
  });
}

describe("FinanceClosingPeriodService", () => {
  beforeEach(() => {
    getMonthlyOverview.mockClear();
    listPeriods.mockClear();
    findByMonth.mockClear();
    upsertDraft.mockClear();
    findById.mockClear();
    closePeriod.mockClear();
    reopenPeriod.mockClear();
    accessPolicy.assertTenantContext.mockClear();
    accessPolicy.hasPermission.mockClear();
  });

  test("creates a draft snapshot from monthly overview", async () => {
    const service = await createService();

    const result = await service.createDraftSnapshot(
      authContextWithPermissions([
        { code: "finance.closing.manage", scope: "all" },
      ]),
      { month: "2026-06", notes: "草稿" },
    );

    expect(result.status).toBe("draft");
    expect(upsertDraft).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      periodMonth: "2026-06",
      snapshotJson: {
        scope: monthlyOverview.scope,
        summary: monthlyOverview.summary,
      },
      notes: "草稿",
    });
  });

  test("closes a period with a fresh monthly overview snapshot", async () => {
    const service = await createService();

    const result = await service.closePeriod(
      authContextWithPermissions([
        { code: "finance.closing.manage", scope: "all" },
      ]),
      "closing-1",
      { notes: "确认结账" },
    );

    expect(result.status).toBe("closed");
    expect(closePeriod).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      id: "closing-1",
      closedByEmployeeId: "employee-1",
      snapshotJson: {
        scope: monthlyOverview.scope,
        summary: monthlyOverview.summary,
      },
      notes: "确认结账",
    });
  });

  test("requires reason when reopening a closing period", async () => {
    const service = await createService();

    await expect(
      service.reopenPeriod(
        authContextWithPermissions([
          { code: "finance.closing.manage", scope: "all" },
        ]),
        "closing-1",
        { reason: "" },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(reopenPeriod).not.toHaveBeenCalled();
  });

  test("rejects closing writes without manage permission", async () => {
    const service = await createService();

    await expect(
      service.createDraftSnapshot(
        authContextWithPermissions([
          { code: "finance.closing.read", scope: "all" },
        ]),
        { month: "2026-06" },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(upsertDraft).not.toHaveBeenCalled();
  });
});
