import { beforeEach, describe, expect, mock, test } from "bun:test";
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
    getStats: mock(async () => null),
  },
}));

mock.module("@/services/task-center", () => ({
  taskCenterService: {
    getSummary: mock(async () => null),
  },
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
});

function buildRequest(): FastifyRequest {
  return {
    method: "GET",
    routeOptions: {
      config: { tenantServiceAccess: "read" },
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
      tenantServiceAccess: "read",
    });
    expect(assertTenantContext).toHaveBeenCalledWith(authContext);
    expect(response.data.context).toEqual(authContext);
    expect(response.data.profile).toMatchObject({
      auth_user_id: authUserId,
      nickname: "出纳员",
      profile_completed: true,
    });
  });
});
