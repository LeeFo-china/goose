import { expect, mock, test } from "bun:test";
import { spyOn } from "bun:test";
import type { AuthContext } from "./authorization";
import type { JwtPayload } from "@/utils/jwt";
import type { TenantServiceAccessDecision } from "./tenant-service-access";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
const actor: JwtPayload = { sub: "user", tenant_id: "tenant", customer_id: "customer", roles: ["customer"], login_channel: "wechat", openid: "bound" };
const log = { id: "log", tenant_id: "tenant", project_id: "project" };
async function setup() {
  const { ProjectLogCommunicationAccess } = await import("./project-log-communication-access");
  const repository = { findCustomer: mock(async () => ({ id: "customer", name: "业主" })), hasMembership: mock(async () => true), canReadProjectScope: mock(async () => true) };
  const projects = { findOwnedProjectAccess: mock(async (): Promise<{
      id: string;
      tenant_id: string | null;
    } | null> => ({ id: "project", tenant_id: "tenant" })) };
  const employees = { findActiveEmployee: mock(async () => ({ id: "employee", name: "员工" })) };
  const authorization = { getRequiredAuthContext: mock(async () => ({ authUserId: "user", employeeId: "employee", tenantId: "tenant", employeeStatus: "active" }) as AuthContext) };
  const policy = { hasPermission: mock(() => true), getScope: mock(() => "all" as const), canWriteProjectLog: mock(async () => true) };
  const tenant = { resolveForRoute: mock(async (_input: {
      routeAccess: string;
    }): Promise<TenantServiceAccessDecision> => ({ mode: "paid", accessLevel: "read_write", allowed: true, errorCode: null, reason: null, startsAt: null, endsAt: null })) };
  const access = new ProjectLogCommunicationAccess({ repository, projects, employees, authorization, policy, tenant });
  return { access, repository, projects, employees, authorization, policy, tenant };
}
test("customer requires current membership and owned project, never employee fallback", async () => {
  const f = await setup();
  expect(await f.access.resolve({ actor, log, write: true })).toMatchObject({ type: "customer", author: { id: "customer" }, canWrite: true });
  expect(f.authorization.getRequiredAuthContext).not.toHaveBeenCalled();
  f.projects.findOwnedProjectAccess.mockResolvedValue(null);
  await expect(f.access.resolve({ actor, log, write: false })).rejects.toMatchObject({ statusCode: 403 });
  expect(f.authorization.getRequiredAuthContext).not.toHaveBeenCalled();
});
test("revoked membership and ambiguous identity cannot read", async () => {
  const f = await setup();
  f.repository.hasMembership.mockResolvedValue(false);
  await expect(f.access.resolve({ actor, log, write: false })).rejects.toMatchObject({ statusCode: 403 });
  for (const invalid of [{ ...actor, roles: ["visitor"] }, { ...actor, employee_id: "employee" }, { ...actor, roles: ["employee", "customer"], employee_id: "employee" }, { ...actor, tenant_id: "other" }]) {
    await expect((await setup()).access.resolve({ actor: invalid, log, write: false })).rejects.toMatchObject({ statusCode: 403 });
  }
});
test("grace read returns can_write false, write has stable tenant error", async () => {
  const f = await setup();
  f.tenant.resolveForRoute.mockImplementation(async ({ routeAccess }) => ({ mode: "grace", accessLevel: "read_only", allowed: routeAccess === "read", errorCode: routeAccess === "read" ? null : "TENANT_SERVICE_READ_ONLY", reason: "只读", startsAt: null, endsAt: null }));
  expect(await f.access.resolve({ actor, log, write: false })).toMatchObject({ canWrite: false });
  await expect(f.access.resolve({ actor, log, write: true })).rejects.toMatchObject({ code: "TENANT_SERVICE_READ_ONLY" });
});
test("employee uses fresh permissions and scoped write permission", async () => {
  const f = await setup();
  f.policy.canWriteProjectLog.mockResolvedValue(false);
  const employee = { ...actor, customer_id: undefined, employee_id: "employee", roles: ["employee"] };
  expect(await f.access.resolve({ actor: employee, log, write: false })).toMatchObject({ type: "employee", canWrite: false });
  expect(f.authorization.getRequiredAuthContext).toHaveBeenCalledWith("user", expect.objectContaining({ freshPermissions: true, tenantServiceAccess: "read" }));
  await expect(f.access.resolve({ actor: employee, log, write: true })).rejects.toMatchObject({ statusCode: 403 });
  f.repository.canReadProjectScope.mockResolvedValue(false);
  await expect(f.access.resolve({ actor: employee, log, write: false })).rejects.toMatchObject({ statusCode: 403 });
});
test("real policy with read-only permission must not throw during list", async () => {
  const f = await setup();
  const { accessPolicyService } = await import("./access-policy");
  const { ProjectLogCommunicationAccess } = await import("./project-log-communication-access");
  f.authorization.getRequiredAuthContext.mockResolvedValue({ authUserId: "user", employeeId: "employee", tenantId: "tenant", employeeStatus: "active", permissions: [{ code: "project.read", scope: "all" }] } as AuthContext);
  const read = spyOn(accessPolicyService, "canAccessProject").mockResolvedValue(true);
  const { permissionRepository } = await import("@/repositories/permissions");
  const project = spyOn(permissionRepository, "findProjectTenantById").mockResolvedValue({ id: "project", tenant_id: "tenant" });
  try {
    const access = new ProjectLogCommunicationAccess({ ...f, policy: accessPolicyService });
    expect(await access.resolve({ actor: { ...actor, customer_id: undefined, employee_id: "employee", roles: ["employee"] }, log, write: false })).toMatchObject({ canWrite: false });
  }
  finally {
    read.mockRestore();
    project.mockRestore();
  }
});
test("project membership is read freshly on every call, without visible-id cache", async () => {
  const f = await setup();
  const employee = { ...actor, customer_id: undefined, employee_id: "employee", roles: ["employee"] };
  await f.access.resolve({ actor: employee, log, write: false });
  f.repository.canReadProjectScope.mockResolvedValue(false);
  await expect(f.access.resolve({ actor: employee, log, write: false })).rejects.toMatchObject({ statusCode: 403 });
  expect(f.repository.canReadProjectScope).toHaveBeenCalledTimes(2);
});
test("legacy customer token may carry account-wide roles but stays customer-scoped", async () => {
  const f = await setup();
  const legacy = { ...actor, login_channel: undefined, roles: ["employee", "customer"] };
  expect(await f.access.resolve({ actor: legacy, log, write: true })).toMatchObject({ type: "customer" });
  expect(f.authorization.getRequiredAuthContext).not.toHaveBeenCalled();
  f.projects.findOwnedProjectAccess.mockResolvedValue(null);
  await expect(f.access.resolve({ actor: legacy, log, write: false })).rejects.toMatchObject({ statusCode: 403 });
});
