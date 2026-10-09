import { afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
import type { TenantActivitySummary } from "@gooes/domain";

const tenantId = "10000000-0000-4000-8000-000000000001";
const tenant = { id: tenantId, name: "Activity fixture" };
const summary: TenantActivitySummary = {
  status: "collecting", collection_started_at: "2026-10-09T08:00:00Z",
  window_start: "2026-10-02T16:00:00Z", window_end: "2026-10-09T09:00:00Z",
  observed_days: 1, last_active_at: "2026-10-09T08:00:00Z", active_employee_count: 1,
  admin_active_employee_count: 1, mini_active_employee_count: 0, active_days: 1,
  admin_login_count: 2, mini_login_count: 0,
  business_actions: { customer_created: 0, follow_up_created: 0, project_created: 0,
    construction_log_created: 0, acceptance_handled: 0 },
};
const context: AuthContext = {
  authUserId: tenantId, employeeId: tenantId, tenantId: null, tenantName: null,
  tenantSlug: null, tenantStatus: null, isPlatformAdmin: true, isPlatformStaff: true,
  isPlatformSuperAdmin: true, employeeName: null, employeeStatus: "active", departmentId: null,
  departmentCode: null, departmentName: null, tenantDepartmentId: null, postId: null, postName: null, avatar: null,
  roleCodes: ["platform_admin"], roles: [], permissions: [],
};
const pagination = { page: 2, pageSize: 20, total: 21, totalPages: 2 };
const list = mock(async () => ({ list: [tenant], pagination }));
const listSummaries = mock(async (_ids: string[]): Promise<Map<string, TenantActivitySummary>> => new Map([[tenantId, summary]]));
const assertPermission = mock(() => {});
mock.module("@/repositories/platform-tenants", () => ({ platformTenantRepository: {
  list, findById: async () => tenant, getUsageStats: async () => new Map(),
  getLatestTemplateApplication: async () => null, findTenantAdminEmployees: async () => [],
  listTenantRoles: async () => [], findEmployeesByIds: async () => new Map(),
  findRolesByIds: async () => new Map(),
} }));
mock.module("@/repositories/tenant-activity", () => ({ tenantActivityRepository: { listSummaries } }));
mock.module("@/repositories/tenant-service-access-batch", () => ({ tenantServiceAccessBatchRepository: {
  getByTenantIds: async (ids: string[]) => new Map(ids.map((id) => [id, { latestTrial: null }])),
} }));
mock.module("@/services/platform-service-trial-rollout", () => ({ platformServiceTrialRollout: { isAccessEnabled: async () => false } }));
mock.module("@/services/tenant-service-access", () => ({ tenantServiceAccessService: { resolveFactsForRoute: () => ({ mode: "paid" }) } }));
mock.module("@/services/platform-authorization", () => ({ platformAuthorizationService: { assertPermission } }));
mock.module("@/services/authorization", () => ({ authorizationService: {} }));
mock.module("@/services/platform-audit-logs", () => ({ platformAuditLogService: {} }));
let platformTenantService: (typeof import("./platform-tenants"))["platformTenantService"];
beforeAll(async () => { ({ platformTenantService } = await import("./platform-tenants")); });
let warn: ReturnType<typeof spyOn<typeof console, "warn">>;
beforeEach(() => {
  listSummaries.mockReset();
  listSummaries.mockImplementation(async () => new Map([[tenantId, summary]]));
  list.mockImplementation(async () => ({ list: [tenant], pagination }));
  assertPermission.mockReset();
  warn = spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("platform tenant activity read integration", () => {
  test("attaches one batch without changing pagination or service access", async () => {
    const result = await platformTenantService.list({ page: 2, pageSize: 20 }, context);
    expect(result.list[0]?.activity).toEqual(summary);
    expect(result.pagination).toEqual(pagination);
    expect(result.list[0]?.service_access.mode).toBe("paid");
    expect(listSummaries).toHaveBeenCalledTimes(1);
    expect(listSummaries).toHaveBeenCalledWith([tenantId]);
    expect(warn).not.toHaveBeenCalled();
  });
  test("detail uses the same summary contract", async () => {
    const result = await platformTenantService.getDetail(tenantId, context);
    expect(result.activity).toEqual(summary);
    expect(result.roles).toEqual([]);
    expect(listSummaries).toHaveBeenCalledTimes(1);
    expect(listSummaries).toHaveBeenCalledWith([tenantId]);
  });
  test("empty page never calls the activity RPC", async () => {
    list.mockImplementation(async () => ({ list: [], pagination }));
    expect((await platformTenantService.list({ page: 2, pageSize: 20 }, context)).list).toEqual([]);
    expect(listSummaries).not.toHaveBeenCalled();
  });
  test.each(["list", "detail"])("%s remains available on failure with null metrics and a safe warning", async (method) => {
    listSummaries.mockRejectedValue(Errors.dbError("private token or database detail"));
    const activity = method === "list"
      ? (await platformTenantService.list({ page: 2, pageSize: 20 }, context)).list[0]?.activity
      : (await platformTenantService.getDetail(tenantId, context)).activity;
    expect(activity).toMatchObject({ status: "unavailable", collection_started_at: null,
      observed_days: 0, active_employee_count: null, active_days: null, business_actions: null });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith({ event: "tenant_activity_summary_unavailable", tenant_count: 1 });
  });
  test("permission failures still reject and never read activity", async () => {
    assertPermission.mockImplementation(() => { throw Errors.forbidden(); });
    await expect(platformTenantService.list({ page: 1, pageSize: 20 }, context)).rejects.toMatchObject({ statusCode: 403 });
    expect(listSummaries).not.toHaveBeenCalled();
  });
});
