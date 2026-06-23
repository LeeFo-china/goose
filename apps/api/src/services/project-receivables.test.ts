import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const listReceivables = mock(async () => ({
  list: [],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },
}));
const summarizeProject = mock(async () => ({
  contract_amount: 100000,
  receivable_amount: 30000,
  paid_amount: 10000,
  remaining_amount: 20000,
  overdue_amount: 0,
  overdue_count: 0,
}));
const findProjectTenant = mock(async () => ({
  id: "project-1",
  tenant_id: "tenant-1",
}));
const canAccessProject = mock(async () => true);

mock.module("@/repositories/project-receivable-plans", () => ({
  projectReceivablePlanRepository: {
    list: listReceivables,
    summarizeProject,
    findProjectTenant,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((authContext: AuthContext) => authContext.tenantId),
    hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
      authContext.permissions.some((permission) => permission.code === permissionCode)
    ),
    canAccessProject,
  },
}));

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

function createService() {
  const accessPolicyService = {
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
    canAccessProject,
  };

  return import("./project-receivables").then(({ ProjectReceivablesService }) =>
    new ProjectReceivablesService({
      planRepository: {
        list: listReceivables,
        summarizeProject,
        findProjectTenant,
      },
      accessPolicyService,
    })
  );
}

describe("projectReceivablesService", () => {
  beforeEach(() => {
    listReceivables.mockClear();
    summarizeProject.mockClear();
    findProjectTenant.mockClear();
    canAccessProject.mockClear();
    canAccessProject.mockImplementation(async () => true);
  });

  test("lists receivables for finance receivable viewers", async () => {
    const service = await createService();

    const result = await service.listReceivables(
      authContextWithPermissions([
        { code: "finance.receivable.view", scope: "all" },
      ]),
      { page: 1, pageSize: 20, overdue_only: true },
    );

    expect(result.pagination.total).toBe(0);
    expect(listReceivables).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      query: { page: 1, pageSize: 20, overdue_only: true },
      tenantToday: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  test("rejects receivable list without finance permission", async () => {
    const service = await createService();

    await expect(
      service.listReceivables(
        authContextWithPermissions([{ code: "project.read", scope: "all" }]),
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  test("returns project receivables and summary for readable project", async () => {
    const service = await createService();

    const result = await service.listProjectReceivables(
      authContextWithPermissions([{ code: "project.read", scope: "all" }]),
      "project-1",
      { page: 1, pageSize: 20 },
    );

    expect(result.summary.remaining_amount).toBe(20000);
    expect(canAccessProject).toHaveBeenCalledWith(
      expect.any(Object),
      "project-1",
      "project.read",
    );
    expect(listReceivables).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      query: { page: 1, pageSize: 20, project_id: "project-1" },
      tenantToday: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    expect(summarizeProject).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      tenantToday: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });
});
