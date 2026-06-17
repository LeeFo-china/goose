import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const listEmployeeIdsByDepartmentId = mock(async () => [
  "manager-employee",
  "sales-employee",
]);
const listTenantSystemAdminEmployeeIds = mock(async () => [
  "system-admin-employee",
]);

mock.module("@/repositories/permissions", () => ({
  permissionRepository: {
    listEmployeeIdsByDepartmentId,
    listTenantSystemAdminEmployeeIds,
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
