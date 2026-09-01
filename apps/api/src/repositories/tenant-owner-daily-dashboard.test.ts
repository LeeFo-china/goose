import { beforeEach, describe, expect, mock, test } from "bun:test";

const rpc = mock(async (): Promise<{ data: unknown; error: unknown }> => ({
  data: [{
    project_id: "11111111-1111-4111-8111-111111111111",
    project_name: "星河湾精装项目",
    customer_name: "张先生",
    address_summary: "星河湾 1 栋",
    owner_employee_name: "李工",
    project_status: "constructing",
    updated_at: "2026-09-01T08:00:00.000Z",
    total_count: 21,
  }],
  error: null,
}));

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ rpc }),
  },
}));

describe("TenantOwnerDailyDashboardRepository gantt", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpc.mockImplementation(async () => ({
      data: [{
        project_id: "11111111-1111-4111-8111-111111111111",
        project_name: "星河湾精装项目",
        customer_name: "张先生",
        address_summary: "星河湾 1 栋",
        owner_employee_name: "李工",
        project_status: "constructing",
        updated_at: "2026-09-01T08:00:00.000Z",
        total_count: 21,
      }],
      error: null,
    }));
  });

  test("forwards full-dataset filters and maps the existing response", async () => {
    const { tenantOwnerDailyDashboardRepository } = await import(
      "./tenant-owner-daily-dashboard"
    );

    const result = await tenantOwnerDailyDashboardRepository.listGanttProjects({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      page: 2,
      pageSize: 20,
      keyword: "星河湾",
      windowStart: "2026-09-01",
      windowEnd: "2026-09-30",
      timezone: "Asia/Shanghai",
      risk: "delayed",
    });

    expect(rpc).toHaveBeenCalledWith("list_tenant_owner_project_gantt", {
      p_tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      p_page: 2,
      p_page_size: 20,
      p_keyword: "星河湾",
      p_window_start: "2026-09-01",
      p_window_end: "2026-09-30",
      p_timezone: "Asia/Shanghai",
      p_risk: "delayed",
    });
    expect(result).toEqual({
      list: [{
        id: "11111111-1111-4111-8111-111111111111",
        name: "星河湾精装项目",
        customer_name: "张先生",
        address_summary: "星河湾 1 栋",
        owner_employee_name: "李工",
        status: "constructing",
      }],
      pagination: {
        page: 2,
        pageSize: 20,
        total: 21,
        totalPages: 2,
      },
    });
  });

  test("preserves the filtered total when the requested page is empty", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: [{
        project_id: null,
        project_name: null,
        customer_name: null,
        address_summary: null,
        owner_employee_name: null,
        project_status: null,
        updated_at: null,
        total_count: 3,
      }],
      error: null,
    }));
    const { tenantOwnerDailyDashboardRepository } = await import(
      "./tenant-owner-daily-dashboard"
    );

    const result = await tenantOwnerDailyDashboardRepository.listGanttProjects({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      page: 3,
      pageSize: 2,
      timezone: "Asia/Shanghai",
    });

    expect(result.list).toEqual([]);
    expect(result.pagination).toEqual({
      page: 3,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
  });

  test("wraps RPC failures with the shared database error", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { message: "rpc failed" },
    }));
    const { tenantOwnerDailyDashboardRepository } = await import(
      "./tenant-owner-daily-dashboard"
    );

    await expect(tenantOwnerDailyDashboardRepository.listGanttProjects({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      page: 1,
      pageSize: 20,
      timezone: "Asia/Shanghai",
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });

});
