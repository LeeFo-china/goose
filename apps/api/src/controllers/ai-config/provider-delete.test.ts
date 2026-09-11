import "reflect-metadata";
import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import Fastify from "fastify";
import { Errors } from "@/errors/error-factory";
import { registerRoutes } from "@/utils/decorators/route";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let controller: typeof import("./index").default;
let service: typeof import("@/services/ai-config").aiConfigService;
let authorization: typeof import("@/services/authorization").authorizationService;
let platformRepository: typeof import("@/repositories/platform-authorization").platformAuthorizationRepository;
let errorHandler: typeof import("@/plugins/error-handler").default;
beforeAll(async () => {
  controller = (await import("./index")).default;
  service = (await import("@/services/ai-config")).aiConfigService;
  authorization = (await import("@/services/authorization")).authorizationService;
  platformRepository = (await import("@/repositories/platform-authorization")).platformAuthorizationRepository;
  errorHandler = (await import("@/plugins/error-handler")).default;
});
const ID = "11111111-1111-4111-8111-111111111111";
const auth = {
  authUserId: "user", employeeId: "staff", tenantId: null as string | null, tenantName: null, tenantSlug: null,
  tenantStatus: null, isPlatformAdmin: false, isPlatformStaff: true, employeeName: "staff",
  employeeStatus: "active", departmentId: null, tenantDepartmentId: null, departmentCode: null,
  departmentName: null, postId: null, postName: null, avatar: null, roleCodes: ["platform_staff"], roles: [],
  permissions: [{ code: "platform.ai_config.manage", scope: "all" as const }],
};
const restores: Array<() => void> = [];
afterEach(() => { for (const restore of restores.splice(0)) restore(); });

async function setup() {
  const server = Fastify();
  errorHandler(server);
  server.addHook("onRequest", async request => { request.user = { sub: "user", admin_auth_version: 1 }; });
  registerRoutes(server, controller);
  const authSpy = spyOn(authorization, "getRequiredAuthContext").mockResolvedValue(auth);
  const snapshotSpy = spyOn(platformRepository, "getSecuritySnapshot").mockResolvedValue({
    employee_id: "staff", tenant_id: null, status: "active", role_codes: ["platform_staff"], admin_auth_version: 1,
  });
  restores.push(() => authSpy.mockRestore(), () => snapshotSpy.mockRestore(), () => { void server.close(); });
  return { server, authSpy, snapshotSpy };
}

test("registered DELETE authenticates and authorizes before validating parameters", async () => {
  const { server, authSpy, snapshotSpy } = await setup();
  authSpy.mockRejectedValue(Errors.unauthorized());
  const request = { method: "DELETE" as const, url: "/platform/ai-config/providers/invalid?unexpected=1", payload: {} };
  expect((await server.inject(request)).statusCode).toBe(401);
  for (const deniedAuth of [
    { ...auth, tenantId: "tenant", isPlatformStaff: false },
    { ...auth, permissions: [{ code: "platform.ai_config.read", scope: "all" as const }] },
  ]) {
    authSpy.mockResolvedValue(deniedAuth);
    snapshotSpy.mockResolvedValue({ employee_id: "staff", tenant_id: deniedAuth.tenantId, status: "active",
      role_codes: ["platform_staff"], admin_auth_version: 1 });
    expect((await server.inject(request)).statusCode).toBe(403);
  }
});

test("DELETE accepts only UUID, empty query and a positive integer version body", async () => {
  const { server } = await setup();
  const deleteSpy = spyOn(service, "deleteProvider").mockResolvedValue({ id: ID, deleted: true });
  restores.push(() => deleteSpy.mockRestore());
  for (const payload of [undefined, {}, { expected_version: null }, { expected_version: 0 },
    { expected_version: -1 }, { expected_version: 1.5 }, { expected_version: "3" },
    { expected_version: true }, { expected_version: 3, force: true }]) {
    expect((await server.inject({ method: "DELETE", url: `/platform/ai-config/providers/${ID}`, payload })).statusCode).toBe(400);
  }
  for (const url of ["/platform/ai-config/providers/invalid", `/platform/ai-config/providers/${ID}?force=true`]) {
    expect((await server.inject({ method: "DELETE", url, payload: { expected_version: 3 } })).statusCode).toBe(400);
  }
  expect(deleteSpy).not.toHaveBeenCalled();
  const result = await server.inject({ method: "DELETE", url: `/platform/ai-config/providers/${ID}`, payload: { expected_version: 3 } });
  expect(result.statusCode).toBe(200);
  expect(result.json().data).toEqual({ id: ID, deleted: true });
  expect(deleteSpy).toHaveBeenCalledWith(expect.objectContaining({ employeeId: "staff" }), ID, { expected_version: 3 });
});

test("DELETE returns stable conflict codes from the service", async () => {
  const { server } = await setup();
  const deleteSpy = spyOn(service, "deleteProvider");
  restores.push(() => deleteSpy.mockRestore());
  for (const code of ["AI_PROVIDER_IN_USE", "AI_CONFIG_VERSION_STALE"]) {
    deleteSpy.mockRejectedValue(Errors.business(409, "固定错误提示", code));
    const response = await server.inject({ method: "DELETE", url: `/platform/ai-config/providers/${ID}`, payload: { expected_version: 3 } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code });
  }
});
