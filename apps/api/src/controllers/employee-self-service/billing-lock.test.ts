import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { EmployeeServiceAccessSummary } from "@gooes/domain";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

const authUserId = "auth-user-1";
const tenantId = "tenant-1";
const employeeId = "employee-1";

const authContext = {
  authUserId,
  employeeId,
  tenantId,
  tenantName: "固始晴天装饰",
  tenantSlug: "qingtian",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "出纳员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["tenant_admin"],
  roles: [],
  permissions: [
    { code: "dashboard.read", scope: "all" },
    { code: "task_center.read", scope: "all" },
  ],
} satisfies AuthContext;

const getRequiredAuthContext = mock(
  async (): Promise<AuthContext> => authContext,
);
const assertTenantContext = mock(() => tenantId);
const assertPermission = mock(() => undefined);
const hasPermission = mock((
  _authContext: AuthContext,
  permissionCode: string,
) => permissionCode === "dashboard.read" || permissionCode === "task_center.read");
const getCachedUserProfileEntryByAuthUserId = mock(() => null);
const getUserProfileByAuthUserId = mock(async () => ({
  nickname: "出纳员",
  avatar_path: null,
  profile_completed_at: "2026-07-04T00:00:00.000Z",
}));
const resolveForEmployee = mock(async () => ({
  scene: "employee_home",
  version: 1,
  rules_version: "test-rules",
  matched_rule: null,
}));
const getStats = mock(async () => null);
const getSummary = mock(async () => null);
const resolveServiceAccess = mock(async () => workspaceAccess());

mock.module("@/services/authorization", () => ({
  authorizationService: {
    getRequiredAuthContext,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext,
    assertPermission,
    hasPermission,
    getScope: mock(() => "all"),
  },
}));

mock.module("@/services/customer-self-service", () => ({
  customerSelfServiceService: {
    getCachedUserProfileEntryByAuthUserId,
    getUserProfileByAuthUserId,
  },
}));

mock.module("@/services/files/file-url-resolver", () => ({
  resolveStoredFileUrl: mock(() => null),
}));

mock.module("@/services/employee-personalization", () => ({
  employeePersonalizationService: {
    getRulesVersionForTenant: mock(() => "test-rules"),
    resolveForEmployee,
    getEmptyPayload: mock((scene: string) => ({
      scene,
      version: 0,
      rules_version: "test-rules",
      matched_rule: null,
    })),
  },
}));

mock.module("@/services/home-dashboard", () => ({
  homeDashboardService: {
    getStats,
  },
}));

mock.module("@/services/task-center", () => ({
  taskCenterService: {
    getSummary,
  },
}));

mock.module("@/services/employee-service-access", () => ({
  employeeServiceAccessService: { resolve: resolveServiceAccess },
}));

mock.module("@/services/projects", () => ({
  projectSer: {
    listProjects: mock(async () => ({ data: [], pagination: null })),
  },
}));

mock.module("@/services/customer-core", () => ({
  customerCoreService: {
    listCustomers: mock(async () => ({ data: [], pagination: null })),
  },
}));

beforeEach(() => {
  getRequiredAuthContext.mockClear();
  assertTenantContext.mockClear();
  assertPermission.mockClear();
  hasPermission.mockClear();
  getCachedUserProfileEntryByAuthUserId.mockClear();
  getUserProfileByAuthUserId.mockClear();
  resolveForEmployee.mockClear();
  getStats.mockClear();
  getSummary.mockClear();
  resolveServiceAccess.mockClear();
  resolveServiceAccess.mockImplementation(async () => workspaceAccess());
});

function buildRequest(): FastifyRequest {
  return {
    method: "GET",
    routeOptions: {
      config: { tenantServiceAccess: "session" },
    },
    query: {},
    user: {
      sub: authUserId,
      tenant_id: tenantId,
      employee_id: employeeId,
    },
    id: "req-test",
    log: {
      info: mock(() => undefined),
      warn: mock(() => undefined),
      error: mock(() => undefined),
    },
  } as unknown as FastifyRequest;
}

describe("EmployeeSelfServiceController billing lock access", () => {
  test("allows employee bootstrap while tenant billing is locked", async () => {
    const { default: controller } = await import(".");
    const request = buildRequest();

    const response = await controller.getEmployeeBootstrap(request, {} as never);

    expect(getRequiredAuthContext).toHaveBeenCalledWith(authUserId, {
      tenantServiceAccess: "session",
      requiredCapability: null,
    });
    expect(assertTenantContext).toHaveBeenCalledWith(authContext);
    expect(response.data.context).toEqual(authContext);
    expect(response.data.profile).toMatchObject({
      auth_user_id: authUserId,
      nickname: "出纳员",
      profile_completed: true,
    });
    expect(response.data.service_access).toEqual(workspaceAccess());
  });

  test("returns blocked service status without loading employee home data", async () => {
    resolveServiceAccess.mockImplementation(async () => blockedAccess());
    const { default: controller } = await import(".");
    const request = buildRequest();
    request.user = {
      ...request.user,
      sub: "auth-user-blocked",
    };

    const response = await controller.getEmployeeBootstrap(request, {} as never);

    expect(response.data.service_access).toEqual(blockedAccess());
    expect(response.data.home_stats).toBeNull();
    expect(response.data.task_summary).toBeNull();
    expect(response.data.home_mode).toBe("defer");
    expect(response.data.tasks_mode).toBe("defer");
    expect(assertPermission).not.toHaveBeenCalled();
    expect(getStats).not.toHaveBeenCalled();
    expect(getSummary).not.toHaveBeenCalled();
    expect(resolveForEmployee).not.toHaveBeenCalled();
  });

  test("rechecks service access before reusing cached home data", async () => {
    let accessAttempt = 0;
    resolveServiceAccess.mockImplementation(async () =>
      accessAttempt++ === 0 ? workspaceAccess() : blockedAccess());
    const { default: controller } = await import(".");
    const request = buildRequest();
    request.query = { home_mode: "inline", tasks_mode: "inline" };
    request.user = { ...request.user, sub: "auth-user-transition" };

    const first = await controller.getEmployeeBootstrap(request, {} as never);
    const second = await controller.getEmployeeBootstrap(request, {} as never);

    expect(first.data.service_access.access_status).toBe("workspace_available");
    expect(second.data.service_access.access_status).toBe("pending_review");
    expect(resolveServiceAccess).toHaveBeenCalledTimes(2);
    expect(getStats).toHaveBeenCalledTimes(1);
    expect(getSummary).toHaveBeenCalledTimes(1);
  });
});

function workspaceAccess(): EmployeeServiceAccessSummary {
  return {
    can_enter_workspace: true,
    readonly: false,
    access_mode: "paid" as const,
    access_level: "read_write" as const,
    access_status: "workspace_available" as const,
    trial_id: null,
    trial_status: null,
    starts_at: "2026-08-01T00:00:00.000Z",
    ends_at: "2027-08-01T00:00:00.000Z",
    title: "服务已可用",
    message: "当前企业服务可正常使用。",
    primary_action: {
      key: "enter_workspace" as const,
      label: "进入工作台",
      path: "/pages/index/index",
    },
    secondary_action: null,
    evaluated_at: "2026-08-12T08:00:00.000Z",
  };
}

function blockedAccess(): EmployeeServiceAccessSummary {
  return {
    can_enter_workspace: false,
    readonly: false,
    access_mode: "service_blocked" as const,
    access_level: "none" as const,
    access_status: "pending_review" as const,
    trial_id: "20000000-0000-4000-8000-000000000001",
    trial_status: "pending_review" as const,
    starts_at: null,
    ends_at: null,
    title: "试用申请审核中",
    message: "平台正在审核试用申请。",
    primary_action: {
      key: "view_trial" as const,
      label: "查看试用",
      path: "/packageEmployees/pages/platformServiceTrialDetail/index",
    },
    secondary_action: null,
    evaluated_at: "2026-08-12T08:00:00.000Z",
  };
}
