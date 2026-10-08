import "reflect-metadata";
import { afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.JWT_SECRET = "tenant-phone-test-secret";

const employee = {
  id: "employee-a", tenant_id: "tenant-a" as string | null, user_id: "user-a",
  status: "active", phone: "18800000001", version: 3, admin_auth_version: 2,
};
let rows = [employee];
let reads = 0;
let databaseFails = false;
const client = createClient(process.env.SUPABASE_URL, "dummy-service-key", {
  global: { fetch: Object.assign(async () => {
    reads += 1;
    return Response.json(databaseFails ? { message: "unavailable" } : rows, {
      status: databaseFails ? 500 : 200,
    });
  }, { preconnect() {} }) },
});
let authPlugin: typeof import("./legacy-plugin").default;
let signToken: typeof import("@/utils/jwt").signToken;
let userIdentityService: typeof import("@/services/user-identities").userIdentityService;
let repository: typeof import("@/repositories/employee-admin-sessions").employeeAdminSessionsRepository;
let testRepository: typeof repository;
const spies: Array<{ mockRestore(): void }> = [];
const context: AuthContext = {
  authUserId: "user-a", employeeId: "employee-a", tenantId: "tenant-a",
  tenantName: "Synthetic tenant", tenantSlug: "test", tenantStatus: "active",
  isPlatformAdmin: false, isPlatformStaff: false, isPlatformSuperAdmin: false,
  adminAuthVersion: 1, employeeName: "Synthetic employee", employeeStatus: "active",
  departmentId: null, tenantDepartmentId: null, departmentCode: null, departmentName: null,
  postId: null, postName: null, avatar: null, roleCodes: ["system_admin"], roles: [], permissions: [],
};
beforeAll(async () => {
  const sessions = await import("@/repositories/employee-admin-sessions");
  repository = sessions.employeeAdminSessionsRepository;
  testRepository = new sessions.EmployeeAdminSessionsRepository(client);
  authPlugin = (await import("./legacy-plugin")).default;
  signToken = (await import("@/utils/jwt")).signToken;
  userIdentityService = (await import("@/services/user-identities")).userIdentityService;
});
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const spy of spies.splice(0)) spy.mockRestore();
});
beforeEach(() => {
  rows = [{ ...employee }]; reads = 0; databaseFails = false;
  spies.push(spyOn(repository, "findByAuthUserId").mockImplementation((id) => testRepository.findByAuthUserId(id)));
});

async function businessApp() {
  const app = Fastify({ logger: false });
  apps.push(app);
  let reached = 0;
  authPlugin(app);
  app.get("/projects", async () => { reached += 1; return { reached }; });
  return { app, reached: () => reached };
}

describe("tenant admin request revocation", () => {
  for (const version of [1, undefined]) {
    test(`rejects version ${version} before reaching a business handler`, async () => {
      const { app, reached } = await businessApp();
      const token = signToken({ sub: "user-a", login_channel: "admin_web", admin_auth_version: version });
      const response = await app.inject({ url: "/projects", headers: { authorization: `Bearer ${token}` } });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe("ADMIN_SESSION_REVOKED");
      expect(reached()).toBe(0);
    });
  }

  test("reads once per request and observes a changed database version", async () => {
    const { app, reached } = await businessApp();
    const headers = { authorization: `Bearer ${signToken({ sub: "user-a", login_channel: "admin_web", admin_auth_version: 2 })}` };
    expect((await app.inject({ url: "/projects", headers })).statusCode).toBe(200);
    rows = [{ ...employee, admin_auth_version: 3 }];
    expect((await app.inject({ url: "/projects", headers })).statusCode).toBe(401);
    expect(reached()).toBe(1);
    expect(reads).toBe(2);
  });

  test("rejects duplicate mappings instead of choosing an employee", async () => {
    rows.push({ ...employee, id: "employee-b", tenant_id: "tenant-b" });
    const { app, reached } = await businessApp();
    const response = await app.inject({ url: "/projects", headers: {
      authorization: `Bearer ${signToken({ sub: "user-a", login_channel: "admin_web", admin_auth_version: 2 })}`,
    } });
    expect(response.statusCode).toBe(401);
    expect(reached()).toBe(0);
  });

  test("database failure fails closed before the handler", async () => {
    databaseFails = true;
    const { app, reached } = await businessApp();
    const response = await app.inject({ url: "/projects", headers: {
      authorization: `Bearer ${signToken({ sub: "user-a", login_channel: "admin_web", admin_auth_version: 2 })}`,
    } });
    expect(response.statusCode).toBe(500);
    expect(reached()).toBe(0);
  });

  test("preserves WeChat employee and same-phone customer binding checks", async () => {
    const binding = spyOn(userIdentityService, "verifyWechatIdentityBinding").mockResolvedValue({
      oauth_matched: true, employee_user_matched: true,
      customer_membership_matched: true, employee_membership_matched: true,
    });
    try {
      const { app, reached } = await businessApp();
      for (const identity of [
        { employee_id: "employee-a", login_channel: "wechat" },
        { customer_id: "customer-a", login_channel: "wechat" },
        // The existing customer session signer does not emit login_channel.
        { customer_id: "customer-a" },
      ] as const) {
        const response = await app.inject({ url: "/projects", headers: {
          authorization: `Bearer ${signToken({ sub: "user-a", openid: crypto.randomUUID(), ...identity })}`,
        } });
        expect(response.statusCode).toBe(200);
      }
      expect(reached()).toBe(3);
      expect(binding).toHaveBeenCalledTimes(3);
      expect(reads).toBe(0);
    } finally { binding.mockRestore(); }
  });

  test("rejects raw Supabase tokens even when GoTrue shares the API JWT secret", async () => {
    const { app, reached } = await businessApp();
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ sub: "user-a", role: "authenticated", phone: employee.phone, exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
    for (const secret of ["separate-supabase-secret", "tenant-phone-test-secret"]) {
      const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
      const response = await app.inject({ url: "/projects", headers: { authorization: `Bearer ${header}.${payload}.${signature}` } });
      expect(response.statusCode).toBe(401);
    }
    expect(reached()).toBe(0);
    expect(reads).toBe(0);
  });

  test("rejects channel-less tokens before the actual tenant controller guard", async () => {
    const { TenantBaseController } = await import("@/controllers/TenantBaseController");
    const { authorizationService } = await import("@/services/authorization");
    const { tenantServiceAccessService } = await import("@/services/tenant-service-access");
    spies.push(spyOn(authorizationService, "getAuthContextByAuthUserId").mockResolvedValue(context));
    spies.push(spyOn(tenantServiceAccessService, "resolveForRoute").mockResolvedValue({
      allowed: true, mode: "paid", accessLevel: "read_write",
      errorCode: null, reason: null, startsAt: null, endsAt: null,
    }));
    class EmployeeRoute extends TenantBaseController {
      async employee(request: FastifyRequest) {
        return this.getRequiredTenantContext(request);
      }
    }
    const controller = new EmployeeRoute("employees");
    const app = Fastify({ logger: false });
    apps.push(app);
    authPlugin(app);
    let reached = 0;
    app.get("/employees", (request) => { reached += 1; return controller.employee(request); });
    const response = await app.inject({ url: "/employees", headers: {
      authorization: `Bearer ${signToken({ sub: "user-a", token_type: "auth" })}`,
    } });
    expect(response.statusCode).toBe(401);
    expect(reached).toBe(0);
    expect(reads).toBe(0);
  });

  test("raw tokens cannot reach identity discovery, exchange or selection entrypoints", async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    authPlugin(app);
    let reached = 0;
    const routes = [
      ["GET", "/admin/auth/me"], ["GET", "/auth/identities"],
      ["POST", "/auth/switch"], ["POST", "/auth/verify-role"],
      ["POST", "/auth/phone-login/verify"], ["POST", "/auth/phone-login/select"],
      ["POST", "/customer/auth/select-tenant"],
    ] as const;
    for (const [method, url] of routes) {
      app.route({ method, url, handler: async () => { reached += 1; return {}; } });
    }
    for (const [method, url] of routes) {
      const response = await app.inject({ method, url, headers: {
        authorization: `Bearer ${signToken({ sub: "user-a" })}`,
      } });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe("TOKEN_INVALID");
    }
    expect(reached).toBe(0);
  });

  test("claiming WeChat without an openid does not bypass admin revocation", async () => {
    const { app, reached } = await businessApp();
    for (const openid of [undefined, "", "   "]) {
      const response = await app.inject({ url: "/projects", headers: {
        authorization: `Bearer ${signToken({ sub: "user-a", login_channel: "wechat", openid, employee_id: employee.id })}`,
      } });
      expect(response.statusCode).toBe(401);
    }
    expect(reached()).toBe(0);
  });

  test("legacy customer selection with openid must pass the real binding checker", async () => {
    const { userIdentityRepository } = await import("@/repositories/user-identities");
    const binding = spyOn(userIdentityRepository, "verifyWechatIdentityBinding");
    spies.push(binding);
    const app = Fastify({ logger: false });
    apps.push(app);
    authPlugin(app);
    let reached = 0;
    app.post("/customer/auth/select-tenant", async () => { reached += 1; return {}; });
    for (const allowed of [true, false]) {
      binding.mockResolvedValue({ oauth_matched: allowed, employee_user_matched: true,
        customer_membership_matched: true, employee_membership_matched: true });
      const response = await app.inject({ method: "POST", url: "/customer/auth/select-tenant", headers: {
        authorization: `Bearer ${signToken({ sub: "user-a", openid: crypto.randomUUID(), roles: ["customer"] })}`,
      } });
      expect(response.statusCode).toBe(allowed ? 200 : 401);
    }
    expect(reached).toBe(1);
    expect(binding).toHaveBeenCalledTimes(2);
    expect(reads).toBe(0);
  });

  test("keeps live platform superadmin role checks after validating the session", async () => {
    const { PlatformBaseController } = await import("@/controllers/PlatformBaseController");
    const { authorizationService } = await import("@/services/authorization");
    const { platformAuthorizationRepository } = await import("@/repositories/platform-authorization");
    rows = [{ ...employee, tenant_id: null }];
    spies.push(spyOn(authorizationService, "getAuthContextByAuthUserId").mockResolvedValue({
      ...context, tenantId: null, isPlatformAdmin: true, isPlatformStaff: true, isPlatformSuperAdmin: true,
    }));
    const platformRoles = spyOn(platformAuthorizationRepository, "getSecuritySnapshot");
    spies.push(platformRoles);
    class PlatformRoute extends PlatformBaseController {
      async superadmin(request: FastifyRequest) {
        return this.getRequiredPlatformSuperAdminContext(request);
      }
    }
    const controller = new PlatformRoute("platform");
    const app = Fastify({ logger: false });
    apps.push(app);
    authPlugin(app);
    let reached = 0;
    app.get("/platform/tenants", async (request) => {
      await controller.superadmin(request);
      reached += 1;
      return { reached };
    });
    const headers = { authorization: `Bearer ${signToken({ sub: "user-a", login_channel: "admin_web", admin_auth_version: 2 })}` };
    for (const [roles, status] of [[['platform_admin'], 200], [['platform_staff'], 403], [[], 403]] as const) {
      platformRoles.mockResolvedValue({ employee_id: "employee-a", tenant_id: null,
        status: "active", admin_auth_version: 2, role_codes: [...roles] });
      expect((await app.inject({ url: "/platform/tenants", headers })).statusCode).toBe(status);
    }
    expect(reached).toBe(1);
    expect(reads).toBe(3);
  });
});
