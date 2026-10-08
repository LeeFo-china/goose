import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import type { EmployeePermissionContextRecord } from "@/repositories/permissions";
import { AuthContextCache } from "./context-cache";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";

let AuthorizationService: typeof import("../legacy-service").AuthorizationService;
let repository: typeof import("@/repositories/permissions").permissionRepository;
let buildContext: typeof import("./context-builder").buildAuthContext;
let spies: Array<{ mockRestore(): void }> = [];
beforeAll(async () => {
  ({ AuthorizationService } = await import("../legacy-service"));
  ({ permissionRepository: repository } = await import("@/repositories/permissions"));
  ({ buildAuthContext: buildContext } = await import("./context-builder"));
});
afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

function record(id: string, version = 1): EmployeePermissionContextRecord {
  return {
    employee: {
      id, user_id: `user-${id}`, tenant_id: "tenant", status: "active",
      admin_auth_version: version, name: id, phone: null, avatar: null,
      tenant_department_id: null, post_id: null, tenant_department: null,
      post: null, tenant: null,
    },
    roles: [], rolePermissions: [{ code: "employee.read", scope: "self" }], overrides: [],
  };
}

function deferredRecord() {
  let resolve!: (value: EmployeePermissionContextRecord) => void;
  const promise = new Promise<EmployeePermissionContextRecord>((done) => { resolve = done; });
  return { promise, resolve };
}

test("employee invalidation removes both indexes and aliases, preserving other employees", () => {
  const cache = new AuthContextCache();
  const target = buildContext(record("target"), "user-target");
  const other = buildContext(record("other"), "user-other");
  cache.setCacheContext(target);
  cache.setCacheValue("old-user-target", { ...target, authUserId: "old-user-target" });
  cache.setCacheContext(other);

  cache.invalidateAuthContext({ employeeId: "target" });

  expect(cache.getByEmployeeId("target")).toBeNull();
  expect(cache.getByAuthUserId("user-target")).toBeNull();
  expect(cache.getByAuthUserId("old-user-target")).toBeNull();
  expect(cache.getByEmployeeId("other")).toBe(other);
  expect(cache.getByAuthUserId("user-other")).toBe(other);
});

test("employee invalidation removes matching auth-user in-flight entries only", async () => {
  const cache = new AuthContextCache();
  const target = buildContext(record("target"), "user-target");
  const other = buildContext(record("other"), "user-other");
  const targetPromise = Promise.resolve(target);
  const otherPromise = Promise.resolve(other);
  cache.setCacheContext(target);
  cache.setCacheContext(other);
  cache.setAuthUserInFlight("user-target", targetPromise);
  cache.setEmployeeInFlight("target", targetPromise);
  cache.setAuthUserInFlight("user-other", otherPromise);
  cache.setEmployeeInFlight("other", otherPromise);

  cache.invalidateAuthContext({ employeeId: "target" });

  expect(cache.getAuthUserInFlight("user-target")).toBeUndefined();
  expect(cache.getEmployeeInFlight("target")).toBeUndefined();
  expect(cache.getAuthUserInFlight("user-other")).toBe(otherPromise);
  expect(cache.getEmployeeInFlight("other")).toBe(otherPromise);
  await Promise.all([targetPromise, otherPromise]);
});

for (const loader of ["auth-user", "employee", "prewarm"] as const) {
  test(`late ${loader} query cannot repopulate invalidated employee cache`, async () => {
    const service = new AuthorizationService();
    const pending = deferredRecord();
    const authRead = spyOn(repository, "getEmployeePermissionContextByAuthUserId")
      .mockResolvedValue(record("target", 2));
    const employeeRead = spyOn(repository, "getEmployeePermissionContextByEmployeeId")
      .mockResolvedValue(record("target", 2));
    spies.push(authRead, employeeRead);
    if (loader === "auth-user") authRead.mockImplementationOnce(() => pending.promise);
    else employeeRead.mockImplementationOnce(() => pending.promise);

    const oldLoad = loader === "auth-user"
      ? service.getAuthContextByAuthUserId("user-target")
      : loader === "employee"
        ? service.getAuthContextByEmployeeId("target")
        : service.prewarmEmployeeAuthContext({ authUserId: "user-target", employeeId: "target" });
    service.invalidateAuthContext({ employeeId: "target" });
    pending.resolve(record("target", 1));
    await oldLoad;

    const fresh = await service.getAuthContextByAuthUserId("user-target");
    expect(fresh.adminAuthVersion).toBe(2);
    expect(await service.getAuthContextByEmployeeId("target")).toBe(fresh);
    expect(await service.prewarmEmployeeAuthContext({ authUserId: "user-target", employeeId: "target" })).toBe(fresh);
  });
}

test("late old load cannot overwrite a newer cache fill; unrelated cached employee survives", async () => {
  const service = new AuthorizationService();
  const pending = deferredRecord();
  const authRead = spyOn(repository, "getEmployeePermissionContextByAuthUserId")
    .mockImplementation(async (id) => record(id === "user-other" ? "other" : "target", 2));
  const employeeRead = spyOn(repository, "getEmployeePermissionContextByEmployeeId")
    .mockImplementationOnce(() => pending.promise);
  spies.push(authRead, employeeRead);
  const other = await service.getAuthContextByAuthUserId("user-other");
  const oldLoad = service.getAuthContextByEmployeeId("target");
  service.invalidateAuthContext({ employeeId: "target" });
  const fresh = await service.getAuthContextByAuthUserId("user-target");
  pending.resolve(record("target", 1));
  await oldLoad;

  expect(await service.getAuthContextByAuthUserId("user-target")).toBe(fresh);
  expect(await service.getAuthContextByEmployeeId("target")).toBe(fresh);
  expect(await service.getAuthContextByAuthUserId("user-other")).toBe(other);
  expect(await service.getAuthContextByEmployeeId("other")).toBe(other);
  expect(authRead).toHaveBeenCalledTimes(2);
});
