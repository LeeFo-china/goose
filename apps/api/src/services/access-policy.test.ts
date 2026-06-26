import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const listEmployeeIdsByDepartmentId = mock(async () => [
  "manager-employee",
  "sales-employee",
]);
const listTenantSystemAdminEmployeeIds = mock(async () => [
  "system-admin-employee",
]);
const canAccessProjectByScope = mock(async () => null as boolean | null);
const listVisibleProjectIds = mock(async () => ["project-1"]);
const findProjectTenantById = mock(async () => ({
  id: "project-1",
  tenant_id: "tenant-1",
}));

mock.module("@/repositories/permissions", () => ({
  permissionRepository: {
    listEmployeeIdsByDepartmentId,
    listTenantSystemAdminEmployeeIds,
    canAccessProjectByScope,
    listVisibleProjectIds,
    findProjectTenantById,
  },
}));

function buildAuthContext(input: {
  employeeId: string;
  tenantDepartmentId: string | null;
  permissions: AuthContext["permissions"];
}): AuthContext {
  return {
    authUserId: "auth-user",
    employeeId: input.employeeId,
    tenantId: "tenant-1",
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: null,
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: input.tenantDepartmentId,
    departmentCode: "MARKETING",
    departmentName: "市场部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: input.permissions,
  };
}

describe("accessPolicyService customer visibility", () => {
  test("allows department managers to access system-admin owned tenant customers", async () => {
    const { accessPolicyService } = await import("./access-policy");
    const authContext = buildAuthContext({
      employeeId: "manager-employee",
      tenantDepartmentId: "marketing-department",
      permissions: [{ code: "customer.read", scope: "department" }],
    });

    await expect(
      accessPolicyService.canAccessCustomer(authContext, {
        owner_id: "system-admin-employee",
        tenant_id: "tenant-1",
      }),
    ).resolves.toBe(true);
    await expect(
      accessPolicyService.getVisibleCustomerOwnerIds(authContext, "customer.read"),
    ).resolves.toEqual([
      "manager-employee",
      "sales-employee",
      "system-admin-employee",
    ]);
  });

  test("keeps salesperson self scope limited to their own customers", async () => {
    const { accessPolicyService } = await import("./access-policy");
    const authContext = buildAuthContext({
      employeeId: "sales-employee",
      tenantDepartmentId: "marketing-department",
      permissions: [{ code: "customer.read", scope: "self" }],
    });

    await expect(
      accessPolicyService.canAccessCustomer(authContext, {
        owner_id: "system-admin-employee",
        tenant_id: "tenant-1",
      }),
    ).resolves.toBe(false);
    await expect(
      accessPolicyService.canAccessCustomer(authContext, {
        owner_id: "sales-employee",
        tenant_id: "tenant-1",
      }),
    ).resolves.toBe(true);
  });
});

describe("accessPolicyService project access", () => {
  beforeEach(() => {
    canAccessProjectByScope.mockClear();
    listVisibleProjectIds.mockClear();
    findProjectTenantById.mockClear();
  });

  test("checks tenant ownership directly for all-scope project access", async () => {
    const { accessPolicyService } = await import("./access-policy");
    const authContext = buildAuthContext({
      employeeId: "admin-employee",
      tenantDepartmentId: "admin-department",
      permissions: [{ code: "project.read", scope: "all" }],
    });

    await expect(
      accessPolicyService.canAccessProject(authContext, "project-1", "project.read"),
    ).resolves.toBe(true);

    expect(findProjectTenantById).toHaveBeenCalledWith("project-1");
    expect(canAccessProjectByScope).not.toHaveBeenCalled();
    expect(listVisibleProjectIds).not.toHaveBeenCalled();
  });

  test("uses direct project scope check without listing visible project ids", async () => {
    const { accessPolicyService } = await import("./access-policy");
    const authContext = buildAuthContext({
      employeeId: "sales-employee",
      tenantDepartmentId: "marketing-department",
      permissions: [{ code: "project.read", scope: "self" }],
    });
    canAccessProjectByScope.mockResolvedValueOnce(true);

    await expect(
      accessPolicyService.canAccessProject(authContext, "project-1", "project.read"),
    ).resolves.toBe(true);

    expect(canAccessProjectByScope).toHaveBeenCalledWith({
      projectId: "project-1",
      tenantId: "tenant-1",
      scope: "self",
      employeeId: "sales-employee",
      tenantDepartmentId: "marketing-department",
    });
    expect(listVisibleProjectIds).not.toHaveBeenCalled();
  });

  test("falls back to visible project ids when direct project scope check is unavailable", async () => {
    const { accessPolicyService } = await import("./access-policy");
    const authContext = buildAuthContext({
      employeeId: "sales-employee",
      tenantDepartmentId: "marketing-department",
      permissions: [{ code: "project.read", scope: "self" }],
    });
    canAccessProjectByScope.mockResolvedValueOnce(null);

    await expect(
      accessPolicyService.canAccessProject(authContext, "project-1", "project.read"),
    ).resolves.toBe(true);

    expect(listVisibleProjectIds).toHaveBeenCalledWith({
      scope: "self",
      employeeId: "sales-employee",
      tenantDepartmentId: "marketing-department",
      tenantId: "tenant-1",
    });
  });
});
