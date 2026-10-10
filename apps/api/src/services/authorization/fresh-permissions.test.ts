import { afterEach, expect, mock, spyOn, test } from "bun:test";
import type { EmployeePermissionContextRecord } from "@/repositories/permissions";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role";
afterEach(() => mock.restore());

test("fresh permission checks bypass a warm cache after role revocation and department transfer", async () => {
  const { permissionRepository } = await import("@/repositories/permissions");
  const { AuthorizationService } = await import("./legacy-service");
  const record: EmployeePermissionContextRecord = {
    employee: { id: "employee", user_id: "user", tenant_id: "tenant", status: "active",
      tenant_department_id: "department-a", post_id: null, name: "员工", phone: null, avatar: null,
      tenant_department: null, post: null, tenant: null },
    roles: [], rolePermissions: [{ code: "project.read", scope: "department" }], overrides: [],
  };
  const query = spyOn(permissionRepository, "getEmployeePermissionContextByAuthUserId").mockResolvedValue(record);
  const resolveForRoute = mock(async () => ({ mode: "paid" as const, accessLevel: "read_write" as const,
    allowed: true, errorCode: null, reason: null, startsAt: null, endsAt: null }));
  const service = new AuthorizationService({ tenantServiceAccessService: { resolveForRoute } });
  expect((await service.getRequiredAuthContext("user")).permissions).toHaveLength(1);
  query.mockResolvedValue({ ...record, employee: { ...record.employee!, tenant_department_id: "department-b" }, rolePermissions: [] });
  expect((await service.getRequiredAuthContext("user")).permissions).toHaveLength(1);
  const options = { freshPermissions: true, tenantServiceAccess: "write" as const, requiredCapability: "core.projects" as const };
  const fresh = await service.getRequiredAuthContext("user", options);
  expect(fresh.permissions).toHaveLength(0);
  expect(fresh.tenantDepartmentId).toBe("department-b");
  expect(query).toHaveBeenCalledTimes(2);
  expect(resolveForRoute).toHaveBeenLastCalledWith({ tenantId: "tenant", routeAccess: "write", requiredCapability: "core.projects" });
});
