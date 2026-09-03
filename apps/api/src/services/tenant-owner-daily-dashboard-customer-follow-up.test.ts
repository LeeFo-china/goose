import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: TENANT_ID,
  tenantName: "固始晴天装饰工程有限公司",
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "张三",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "dashboard.read", scope: "all" }],
} satisfies AuthContext;

function createAccessPolicyService() {
  return {
    assertTenantContext: mock(() => TENANT_ID),
    assertPermission: mock(() => "all"),
  };
}

function createRepository(overrides: Record<string, unknown> = {}) {
  return {
    listOwnerActions: mock(async () => ({ total: 0, items: [] })),
    getFinanceSnapshot: mock(async () => ({
      today_income_amount: "0.00",
      today_expense_amount: "0.00",
      today_net_cash_amount: "0.00",
      receivable_due_today_amount: "0.00",
      receivable_due_7d_amount: "0.00",
      overdue_receivable_amount: "0.00",
      pending_supplier_payable_amount: "0.00",
    })),
    getProjectSnapshot: mock(async () => ({
      active_project_count: 0,
      advanced_today_count: 0,
      started_today_count: 0,
      completed_today_count: 0,
      delayed_project_count: 0,
      no_log_today_count: 0,
      pending_acceptance_count: 0,
    })),
    listRiskProjects: mock(async () => ({ total: 0, items: [] })),
    getConstructionActivity: mock(async () => ({
      log_count: 0,
      project_coverage_count: 0,
      photo_count: 0,
      latest_logs: [],
      missing_logs: [],
    })),
    getCustomerFollowUp: mock(async () => ({
      total: 1,
      due_today_count: 1,
      overdue_count: 0,
      completed_today_count: 0,
      new_customer_count: 0,
      items: [{
        customer_id: "customer-1",
        customer_name: "客户 1",
        owner_employee_name: "王五",
        status_label: "跟进中",
        last_follow_up_at: null,
        next_follow_up_at: "2026-08-26T02:00:00.000Z",
        reason: "今日应跟进",
        target: {
          path: "/packageCustomers/pages/detail/index",
          query: { id: "customer-1" },
        },
      }],
    })),
    listGanttProjects: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    ...overrides,
  };
}

async function createService(repository = createRepository()) {
  const { TenantOwnerDailyDashboardService } = await import(
    "./tenant-owner-daily-dashboard"
  );
  return new TenantOwnerDailyDashboardService({
    repository,
    workflowProgressReader: {
      listProjectProgress: mock(async () => new Map()),
    },
    accessPolicyService: createAccessPolicyService(),
  });
}

describe("TenantOwnerDailyDashboardService customer follow up", () => {
  test("adds customer follow up snapshot to the daily dashboard", async () => {
    const repository = createRepository();
    const service = await createService(repository);

    const result = await service.getDailyDashboard(
      authContext,
      { date: "2026-08-26", timezone: "Asia/Shanghai" },
    );

    expect(repository.getCustomerFollowUp).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      startAt: "2026-08-25T16:00:00.000Z",
      endAt: "2026-08-26T16:00:00.000Z",
      limit: 5,
    });
    expect(result.customer_follow_up.items[0]).toMatchObject({
      customer_id: "customer-1",
      customer_name: "客户 1",
      reason: "今日应跟进",
    });
  });

  test("keeps the dashboard available when customer follow up fails", async () => {
    const service = await createService(createRepository({
      getCustomerFollowUp: mock(async () => {
        throw Object.assign(new Error("follow up failed"), {
          statusCode: 500,
          code: "DB_ERROR",
        });
      }),
    }));

    const result = await service.getDailyDashboard(
      authContext,
      { date: "2026-08-26", timezone: "Asia/Shanghai" },
    );

    expect(result.customer_follow_up).toEqual({
      total: 0,
      due_today_count: 0,
      overdue_count: 0,
      completed_today_count: 0,
      new_customer_count: 0,
      items: [],
    });
    expect(result.partial_errors).toContainEqual({
      module: "customer_follow_up",
      code: "DB_ERROR",
      message: "客户跟进数据暂不可用",
    });
  });
});
