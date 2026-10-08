import "reflect-metadata";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import Fastify, { type FastifyInstance } from "fastify";
import { PhoneIdentityBindings, type PhoneIdentityBindingsDependencies } from "./bindings";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.JWT_SECRET = "tenant-phone-test-secret";

const original = {
  id: "employee-a", tenant_id: "tenant-a", user_id: null as string | null,
  phone: "18800000001", status: "active", version: 3,
  tenant: { id: "tenant-a", status: "active" },
};
let current = { ...original };
let clearedOtherBindings = 0;
const client = createClient(process.env.SUPABASE_URL, "dummy-key", {
  global: { fetch: Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.searchParams.get("id")?.startsWith("neq.")) {
      clearedOtherBindings += 1;
      return Response.json([]);
    }
    const matches = ["id", "phone", "version", "user_id", "tenant_id", "status"].every((key) => {
      const filter = url.searchParams.get(key);
      const value = current[key as keyof typeof current];
      return !filter || (filter === "is.null" ? value === null : filter === `eq.${value}`);
    });
    if (matches && init?.method === "PATCH") {
      const patch = JSON.parse(String(init.body)) as { user_id: string };
      if (patch.user_id !== current.user_id) current.version += 1;
      current.user_id = patch.user_id;
    }
    const single = new Headers(init?.headers).get("accept")?.includes("object");
    return Response.json(single ? (matches ? { ...current } : null) : (matches ? [{ ...current }] : []));
  }, { preconnect() {} }) },
});
let bindSelectedEmployeeRole: typeof import("@/services/wechat-auth-legacy/employee").bindSelectedEmployeeRole;
let employeeRepository: typeof import("@/repositories/wechat-employee-identities").wechatEmployeeIdentityRepository;
let userIdentityService: typeof import("@/services/user-identities").userIdentityService;
let rebindService: typeof import("@/services/wechat-rebind-requests").wechatRebindRequestService;
let signToken: typeof import("@/utils/jwt").signToken;
let restoreClient = () => {};
const spies: Array<{ mockRestore(): void }> = [];
const apps: FastifyInstance[] = [];
beforeAll(async () => {
  const { SupabaseDB } = await import("@/utils/supabase");
  const spy = spyOn(SupabaseDB, "getAdminClient").mockReturnValue(client);
  restoreClient = () => spy.mockRestore();
  employeeRepository = (await import("@/repositories/wechat-employee-identities")).wechatEmployeeIdentityRepository;
  ({ bindSelectedEmployeeRole } = await import("@/services/wechat-auth-legacy/employee"));
  ({ userIdentityService } = await import("@/services/user-identities"));
  rebindService = (await import("@/services/wechat-rebind-requests")).wechatRebindRequestService;
  ({ signToken } = await import("@/utils/jwt"));
});
beforeEach(() => { current = { ...original }; clearedOtherBindings = 0; });
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const spy of spies.splice(0)) spy.mockRestore();
});
afterAll(() => restoreClient());

async function fixture() {
  const find = spyOn(employeeRepository, "getEmployeeLoginCandidateById").mockImplementation(async () => ({ ...current }));
  const membership = spyOn(userIdentityService, "hasActiveBusinessMembership").mockResolvedValue(false);
  const syncMembership = spyOn(userIdentityService, "syncBusinessMembershipBestEffort").mockResolvedValue(undefined);
  const syncOauth = spyOn(userIdentityService, "syncOauthIdentityBestEffort").mockResolvedValue(undefined);
  const rebind = spyOn(rebindService, "assertEmployeeCanBind").mockResolvedValue(undefined);
  spies.push(find, membership, syncMembership, syncOauth, rebind);
  const signEmployeeAuth: PhoneIdentityBindingsDependencies["signEmployeeAuth"] = mock(async (input) => ({
    token: signToken({ sub: input.authUserId, login_channel: "wechat", openid: "old-phone-holder-openid",
      employee_id: input.employee.id, tenant_id: input.employee.tenant_id, roles: ["employee"] }),
  }));
  const bindings = new PhoneIdentityBindings({
    findEmployee: ({ employeeId }) => employeeRepository.getEmployeeLoginCandidateById(employeeId),
    bindEmployee: async (input) => {
      if (!input.request) return "missing-request";
      return bindSelectedEmployeeRole.call({ findOpenIdByAuthUserId: async () => null },
        input.request, input.authUserId, input.employee.phone ?? "", input.openid, input.employee);
    },
    signEmployeeAuth,
    findCustomer: async () => null, bindCustomer: async () => "unused", signCustomerAuth: () => ({}),
    findPlatformAdmin: async () => null, bindPlatformAdmin: async ({ employee }) => employee, signPlatformAdminAuth: () => ({}),
    findPartnerMember: async () => null, bindPartnerMember: async ({ member }) => member, signPartnerAuth: () => ({}),
  });
  const app = Fastify({ logger: false });
  apps.push(app);
  app.post("/select", (request) => bindings.authenticate({
    targetMode: "tenant_employee", tenantId: "tenant-a", employeeId: "employee-a",
    customerId: null, partnerMemberId: null, authUserId: "old-phone-holder",
    openid: "old-phone-holder-openid", phone: original.phone, request,
  }));
  return { app, membership, syncMembership, syncOauth, signEmployeeAuth };
}

describe("phone identity binding versus concurrent administrator phone change", () => {
  for (const initialUser of [null, "canonical-employee-user"]) {
    test(`rejects a phone change after loading employee with user ${initialUser} before identity side effects`, async () => {
      current.user_id = initialUser;
      const { app, membership, syncMembership, syncOauth, signEmployeeAuth } = await fixture();
      const entered = Promise.withResolvers<void>();
      const resume = Promise.withResolvers<void>();
      membership.mockImplementation(async () => { entered.resolve(); await resume.promise; return false; });
      const response = app.inject({ method: "POST", url: "/select" });
      await entered.promise;
      current = { ...current, phone: "18800000002", version: current.version + 1 };
      resume.resolve();
      expect((await response).statusCode).toBe(409);
      expect(current.user_id).toBe(initialUser);
      expect(clearedOtherBindings).toBe(0);
      expect(syncMembership).not.toHaveBeenCalled();
      expect(syncOauth).not.toHaveBeenCalled();
      expect(signEmployeeAuth).not.toHaveBeenCalled();
    });
  }

  test("rejects a changed binding or version even when the phone remains equal", async () => {
    const { app, membership, syncMembership, syncOauth, signEmployeeAuth } = await fixture();
    membership.mockImplementation(async () => {
      current = { ...current, user_id: "concurrent-user", version: current.version + 1 };
      return false;
    });
    expect((await app.inject({ method: "POST", url: "/select" })).statusCode).toBe(409);
    expect(current.user_id).toBe("concurrent-user");
    expect(clearedOtherBindings).toBe(0);
    expect(syncMembership).not.toHaveBeenCalled();
    expect(syncOauth).not.toHaveBeenCalled();
    expect(signEmployeeAuth).not.toHaveBeenCalled();
  });

  test("binds the unchanged unbound employee and signs the legitimate WeChat session", async () => {
    const { app, signEmployeeAuth } = await fixture();
    expect((await app.inject({ method: "POST", url: "/select" })).statusCode).toBe(200);
    expect(current.user_id).toBe("old-phone-holder");
    expect(signEmployeeAuth).toHaveBeenCalledTimes(1);
  });

  test("rejects a version-only change before first binding", async () => {
    const { app, membership, syncMembership, signEmployeeAuth } = await fixture();
    membership.mockImplementation(async () => { current.version += 1; return false; });
    expect((await app.inject({ method: "POST", url: "/select" })).statusCode).toBe(409);
    expect(current.user_id).toBeNull();
    expect(clearedOtherBindings).toBe(0);
    expect(syncMembership).not.toHaveBeenCalled();
    expect(signEmployeeAuth).not.toHaveBeenCalled();
  });

  test("an active membership does not bypass the phone comparison", async () => {
    current.user_id = "old-phone-holder";
    const { app, membership, syncMembership, signEmployeeAuth } = await fixture();
    membership.mockImplementation(async () => {
      current = { ...current, phone: "18800000002", version: current.version + 1 };
      return true;
    });
    expect((await app.inject({ method: "POST", url: "/select" })).statusCode).toBe(409);
    expect(current.user_id).toBe("old-phone-holder");
    expect(syncMembership).not.toHaveBeenCalled();
    expect(signEmployeeAuth).not.toHaveBeenCalled();
  });

  test("preserves an existing WeChat employee identity", async () => {
    current.user_id = "old-phone-holder";
    const { app, membership, syncOauth, signEmployeeAuth } = await fixture();
    membership.mockResolvedValue(true);
    expect((await app.inject({ method: "POST", url: "/select" })).statusCode).toBe(200);
    expect(current.user_id).toBe("old-phone-holder");
    expect(current.version).toBe(original.version);
    expect(syncOauth).not.toHaveBeenCalled();
    expect(signEmployeeAuth).toHaveBeenCalledTimes(1);
  });
});
