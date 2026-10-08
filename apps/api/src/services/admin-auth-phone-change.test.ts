import { afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import type { AdminAuthEmployeeRecord } from "@/repositories/admin-auth";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.JWT_SECRET = "tenant-phone-test-secret";
process.env.AUTH_PHONE_LOGIN_WITHOUT_CODE = "false";

const initial = {
  id: "employee-a", tenant_id: "tenant-a" as string | null, user_id: "user-a" as string | null,
  status: "active", phone: "18800000001", version: 3, admin_auth_version: 2,
};
let snapshot = { ...initial };
let snapshotReads = 0;
let mutateAfterFinalRead = false;
const client = createClient(process.env.SUPABASE_URL, "dummy-service-key", {
  global: { fetch: Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const query = new URL(String(input)).searchParams;
    const matches = ["id", "user_id", "phone", "tenant_id", "status", "version", "admin_auth_version"]
      .every((key) => {
        const filter = query.get(key);
        const value = snapshot[key as keyof typeof snapshot];
        return !filter || (filter === "is.null" ? value === null : filter === `eq.${value}`);
      });
    if (!matches) return Response.json([]);
    if (init?.method === "PATCH") {
      const update = JSON.parse(String(init.body)) as { user_id: string };
      snapshot.user_id = update.user_id;
      if (snapshot.tenant_id !== null) snapshot.version += 1;
      return Response.json([snapshot]);
    }
    snapshotReads += 1;
    const response = Response.json([snapshot]);
    if (mutateAfterFinalRead && snapshotReads === 2) snapshot.admin_auth_version += 1;
    return response;
  }, { preconnect() {} }) },
});
let adminAuthRepository: typeof import("@/repositories/admin-auth").adminAuthRepository;
let authorizationService: typeof import("@/services/authorization").authorizationService;
let userIdentityService: typeof import("@/services/user-identities").userIdentityService;
let adminAuthService: typeof import("./admin-auth").adminAuthService;
let verifyTokenDetailed: typeof import("@/utils/jwt").verifyTokenDetailed;
let repository: typeof import("@/repositories/employee-admin-sessions").employeeAdminSessionsRepository;
let testRepository: typeof repository;
beforeAll(async () => {
  adminAuthRepository = (await import("@/repositories/admin-auth")).adminAuthRepository;
  authorizationService = (await import("@/services/authorization")).authorizationService;
  userIdentityService = (await import("@/services/user-identities")).userIdentityService;
  adminAuthService = (await import("./admin-auth")).adminAuthService;
  verifyTokenDetailed = (await import("@/utils/jwt")).verifyTokenDetailed;
  const sessions = await import("@/repositories/employee-admin-sessions");
  repository = sessions.employeeAdminSessionsRepository;
  testRepository = new sessions.EmployeeAdminSessionsRepository(client);
});
const context: AuthContext = {
  authUserId: "user-a", employeeId: "employee-a", tenantId: "tenant-a",
  tenantName: "Synthetic tenant", tenantSlug: "test", tenantStatus: "active",
  isPlatformAdmin: false, isPlatformStaff: false, isPlatformSuperAdmin: false,
  adminAuthVersion: 1, employeeName: "Synthetic employee", employeeStatus: "active",
  departmentId: null, tenantDepartmentId: null, departmentCode: null, departmentName: null,
  postId: null, postName: null, avatar: null, roleCodes: ["system_admin"], roles: [], permissions: [],
};
function employeeRecord(): AdminAuthEmployeeRecord {
  return { ...snapshot, name: "Synthetic employee", tenant_department_id: null,
    post_id: null, avatar: null, tenant: null, tenant_department: null, post: null };
}
const spies: Array<{ mockRestore(): void }> = [];
function prepare() {
  spies.push(
    spyOn(repository, "findByAuthUserId").mockImplementation((id) => testRepository.findByAuthUserId(id)),
    spyOn(repository, "findByEmployeeId").mockImplementation((id) => testRepository.findByEmployeeId(id)),
    spyOn(repository, "bindFirstLogin").mockImplementation((initial, id) => testRepository.bindFirstLogin(initial, id)),
  );
  const find = spyOn(adminAuthRepository, "findEmployeeByPhone").mockImplementation(async () => [employeeRecord()]);
  const verify = spyOn(adminAuthRepository, "findValidVerificationCode").mockResolvedValue({
    id: "code-a", phone: initial.phone, scene: "admin_login", code: "123456",
    status: "pending", expired_at: "2099-01-01", verified_at: null, created_at: "2026-01-01", request_ip: null,
  });
  const create = spyOn(adminAuthRepository, "createAdminAuthUser").mockResolvedValue("new-user");
  const bind = spyOn(adminAuthRepository, "bindEmployeeAuthUser").mockImplementation(async ({ authUserId }) => {
    snapshot.user_id = authUserId;
    if (snapshot.tenant_id !== null) snapshot.version += 1;
  });
  const mark = spyOn(adminAuthRepository, "markVerificationCodeVerified").mockResolvedValue(undefined);
  const update = spyOn(adminAuthRepository, "updateLastLogin").mockResolvedValue(undefined);
  const employeeContext = spyOn(authorizationService, "getAuthContextByEmployeeId").mockResolvedValue(context);
  const userContext = spyOn(authorizationService, "getAuthContextByAuthUserId").mockResolvedValue(context);
  const tenant = spyOn(authorizationService, "assertTenantAvailable").mockReturnValue(undefined);
  const sync = spyOn(userIdentityService, "syncBusinessMembershipBestEffort").mockResolvedValue(undefined);
  spies.push(find, verify, create, bind, mark, update, employeeContext, userContext, tenant, sync);
  return { find, verify, create, bind, mark, update, userContext };
}
beforeEach(() => { snapshot = { ...initial }; snapshotReads = 0; mutateAfterFinalRead = false; });
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
const login = () => adminAuthService.login({ phone: initial.phone, code: "123456" });

describe("admin login phone-change race", () => {
  test("signs the fresh phone-verified version, ignoring cached authorization version", async () => {
    prepare();
    const result = await login();
    expect(verifyTokenDetailed(result.token).payload?.admin_auth_version).toBe(2);
    expect(snapshotReads).toBe(2);
  });

  test("rejects a phone change while SMS verification is paused", async () => {
    const { verify, update, userContext } = prepare();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    verify.mockImplementation(async () => {
      entered.resolve();
      await resume.promise;
      return { id: "code-a", phone: initial.phone, scene: "admin_login", code: "123456", status: "pending", expired_at: "2099-01-01", verified_at: null, created_at: "2026-01-01", request_ip: null };
    });
    const result = login();
    const outcome = result.then(() => null, (error: unknown) => error);
    await entered.promise;
    snapshot = { ...snapshot, phone: "18800000002", version: 4, admin_auth_version: 3 };
    userContext.mockResolvedValue({ ...context, adminAuthVersion: 3 });
    resume.resolve();
    expect(await outcome).toMatchObject({ statusCode: 401, code: "ADMIN_SESSION_REVOKED" });
    expect(update).not.toHaveBeenCalled();
  });

  for (const change of [
    { id: "employee-b" }, { user_id: "other-user" }, { tenant_id: "tenant-b" },
    { version: 4 }, { admin_auth_version: 3 }, { status: "inactive" },
  ]) {
    test(`rejects concurrent identity change ${JSON.stringify(change)}`, async () => {
      const { userContext, update } = prepare();
      userContext.mockImplementation(async () => { snapshot = { ...snapshot, ...change }; return context; });
      await expect(login()).rejects.toMatchObject({ statusCode: 401, code: "ADMIN_SESSION_REVOKED" });
      expect(update).not.toHaveBeenCalled();
    });
  }

  test("permits expected first-login user binding without changing the verified version", async () => {
    snapshot.user_id = null;
    const { create, bind, userContext } = prepare();
    userContext.mockResolvedValue({ ...context, authUserId: "new-user" });
    const result = await login();
    expect(create).toHaveBeenCalledTimes(1);
    expect(bind).not.toHaveBeenCalled();
    expect<string | null>(snapshot.user_id).toBe("new-user");
    expect(verifyTokenDetailed(result.token).payload).toMatchObject({ sub: "new-user", admin_auth_version: 2 });
  });

  test("first-login binding does not mask a concurrent phone change", async () => {
    snapshot.user_id = null;
    const { create } = prepare();
    create.mockImplementation(async () => {
      snapshot = { ...snapshot, phone: "18800000002", version: 4, admin_auth_version: 3 };
      return "new-user";
    });
    await expect(login()).rejects.toMatchObject({ statusCode: 401, code: "ADMIN_SESSION_REVOKED" });
  });

  test("platform first login preserves row version while binding its new auth user", async () => {
    snapshot = { ...initial, tenant_id: null, user_id: null };
    const { userContext } = prepare();
    userContext.mockResolvedValue({ ...context, tenantId: null, authUserId: "new-user", isPlatformStaff: true });
    const result = await login();
    expect(verifyTokenDetailed(result.token).payload).toMatchObject({ sub: "new-user", admin_auth_version: 2 });
    expect(snapshot.version).toBe(initial.version);
  });

  for (const change of [{ user_id: "concurrent-user" }, { phone: "18800000002", admin_auth_version: 3 }]) {
    test(`failed first login does not transfer identity after ${JSON.stringify(change)}`, async () => {
      snapshot.user_id = null;
      const { create } = prepare();
      create.mockImplementation(async () => {
        snapshot = { ...snapshot, ...change, version: snapshot.version + 1 };
        return "new-user";
      });
      await expect(login()).rejects.toMatchObject({ statusCode: 401, code: "ADMIN_SESSION_REVOKED" });
      expect<string | null>(snapshot.user_id).toBe(change.user_id ?? null);
    });
  }

  test("a change after the final read can only yield the old, revocable version", async () => {
    prepare();
    mutateAfterFinalRead = true;
    const result = await login();
    expect(verifyTokenDetailed(result.token).payload?.admin_auth_version).toBe(2);
    expect(snapshot.admin_auth_version).toBe(3);
  });
});
