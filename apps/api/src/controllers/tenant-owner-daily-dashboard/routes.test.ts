import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const getDailyDashboard = mock(async () => ({
  business_date: "2026-08-26",
  timezone: "Asia/Shanghai",
  generated_at: "2026-08-26T08:00:00.000Z",
  owner_actions: { total: 0, items: [] },
  finance: {
    today_income_amount: "0.00",
    today_expense_amount: "0.00",
    today_net_cash_amount: "0.00",
    receivable_due_today_amount: "0.00",
    receivable_due_7d_amount: "0.00",
    overdue_receivable_amount: "0.00",
    pending_supplier_payable_amount: "0.00",
  },
  projects: {
    active_project_count: 0,
    advanced_today_count: 0,
    started_today_count: 0,
    completed_today_count: 0,
    delayed_project_count: 0,
    no_log_today_count: 0,
    pending_acceptance_count: 0,
  },
  risk_projects: { total: 0, items: [] },
  construction_activity: {
    log_count: 0,
    project_coverage_count: 0,
    photo_count: 0,
    latest_logs: [],
    missing_logs: [],
  },
  partial_errors: [],
}));

const listProjectGantt = mock(async () => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  partial_errors: [],
}));

mock.module("@/services/tenant-owner-daily-dashboard", () => ({
  tenantOwnerDailyDashboardService: {
    getDailyDashboard,
    listProjectGantt,
  },
}));

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenantName: null,
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

async function getController() {
  const { default: controller } = await import(".");
  (controller as unknown as {
    getRequiredTenantContext: () => Promise<AuthContext>;
  }).getRequiredTenantContext = mock(async () => authContext);
  return controller;
}

function createRequest(query: unknown) {
  return {
    id: "request-1",
    query,
    log: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
    },
  };
}

describe("TenantOwnerDailyDashboardController routes", () => {
  beforeEach(() => {
    getDailyDashboard.mockClear();
    listProjectGantt.mockClear();
  });

  test("registers daily dashboard and gantt routes", async () => {
    const controller = await getController();
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
    };

    controller.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "GET", path: "/tenant-owner/daily-dashboard" },
      { method: "GET", path: "/tenant-owner/daily-dashboard/projects/gantt" },
    ]);
  });

  test("passes parsed daily dashboard query to service", async () => {
    const controller = await getController();
    const response = await controller.getDailyDashboard(
      createRequest({
        date: "2026-08-26",
        timezone: "Asia/Shanghai",
      }) as never,
      {} as never,
    );

    expect(getDailyDashboard).toHaveBeenCalledWith(authContext, {
      date: "2026-08-26",
      timezone: "Asia/Shanghai",
    });
    expect(response).toEqual({
      data: expect.objectContaining({
        business_date: "2026-08-26",
      }),
      message: "success",
    });
  });

  test("passes parsed gantt filters to service", async () => {
    const controller = await getController();
    const response = await controller.listProjectGantt(
      createRequest({
        page: "2",
        pageSize: "20",
        keyword: " 星河湾 ",
        window_start: "2026-09-01",
        window_end: "2026-09-30",
        timezone: "Asia/Shanghai",
        risk: "blocked",
      }) as never,
      {} as never,
    );

    expect(listProjectGantt).toHaveBeenCalledWith(authContext, {
      page: 2,
      pageSize: 20,
      keyword: "星河湾",
      window_start: "2026-09-01",
      window_end: "2026-09-30",
      timezone: "Asia/Shanghai",
      risk: "blocked",
    });
    expect(response).toEqual({
      data: expect.objectContaining({
        pagination: expect.objectContaining({ page: 1 }),
      }),
      message: "success",
    });
  });

  test("rejects gantt pageSize over 100 before service call", async () => {
    const controller = await getController();

    await expect(
      controller.listProjectGantt(
        createRequest({ page: "1", pageSize: "101" }) as never,
        {} as never,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(listProjectGantt).not.toHaveBeenCalled();
  });
});
