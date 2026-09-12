import "reflect-metadata";
import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import Fastify from "fastify";
import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let controller: typeof import("./index").default;
let aiConfigService: typeof import("@/services/ai-config").aiConfigService;
let authorizationService: typeof import("@/services/authorization").authorizationService;
let platformAuthorizationRepository: typeof import("@/repositories/platform-authorization").platformAuthorizationRepository;
let systemSettingRepository: typeof import("@/repositories/system-settings").systemSettingRepository;
let systemSettingsService: typeof import("@/services/system-settings").systemSettingsService;
let errorHandler: typeof import("@/plugins/error-handler").default;
let requestLogging: typeof import("@/plugins/request-logging").default;
beforeAll(async () => {
  controller = (await import("./index")).default;
  ({aiConfigService} = await import("@/services/ai-config"));
  ({authorizationService} = await import("@/services/authorization"));
  ({platformAuthorizationRepository} = await import("@/repositories/platform-authorization"));
  ({systemSettingRepository} = await import("@/repositories/system-settings"));
  ({systemSettingsService} = await import("@/services/system-settings"));
  errorHandler = (await import("@/plugins/error-handler")).default;
  requestLogging = (await import("@/plugins/request-logging")).default;
});
const permissions = ["platform.ai_config.read", "platform.ai_config.manage", "platform.system_setting.read", "platform.system_setting.manage"];
const auth = {
  authUserId: "user", employeeId: "staff", tenantId: null, tenantName: null, tenantSlug: null,
  tenantStatus: null, isPlatformAdmin: false, isPlatformStaff: true, employeeName: "staff",
  employeeStatus: "active", departmentId: null, tenantDepartmentId: null, departmentCode: null,
  departmentName: null, postId: null, postName: null, avatar: null, roleCodes: ["platform_staff"], roles: [],
  permissions: permissions.map(code => ({code, scope: "all" as const})),
};
const restores: Array<() => void> = [];
afterEach(() => { for (const restore of restores.splice(0)) restore(); });

async function app() {
  const logs: string[] = [];
  const server = Fastify({logger: {stream: {write: (line: string) => {logs.push(line);}}}, disableRequestLogging: true});
  errorHandler(server);
  requestLogging(server);
  server.addHook("onRequest", async request => { request.user = {sub: "user", admin_auth_version: 1}; });
  server.get("/platform/ai-config/secret-settings", controller.listSecretSettings.bind(controller));
  server.patch("/platform/ai-config/secret-settings/:key", controller.replaceSecretSetting.bind(controller));
  server.get("/platform/ai-config/models", controller.listModels.bind(controller));
  restores.push(() => { void server.close(); });
  return {server, logs};
}

function authenticate(overrides: Partial<typeof auth> = {}) {
  const authSpy = spyOn(authorizationService, "getRequiredAuthContext").mockResolvedValue({...auth, ...overrides});
  const snapshotSpy = spyOn(platformAuthorizationRepository, "getSecuritySnapshot").mockResolvedValue({employee_id: "staff", tenant_id: null, status: "active", role_codes: ["platform_staff"], admin_auth_version: 1});
  restores.push(() => authSpy.mockRestore(), () => snapshotSpy.mockRestore());
}

test("secret endpoints authenticate and enforce both permissions before validation or persistence", async () => {
  const {server} = await app();
  const authSpy = spyOn(authorizationService, "getRequiredAuthContext").mockRejectedValue(Errors.unauthorized());
  const metadataSpy = spyOn(systemSettingRepository, "listPlatformAiSecretMetadata").mockResolvedValue([]);
  const writeSpy = spyOn(systemSettingsService, "updateSetting").mockResolvedValue({});
  restores.push(() => authSpy.mockRestore(), () => metadataSpy.mockRestore(), () => writeSpy.mockRestore());
  expect((await server.inject({method: "GET", url: "/platform/ai-config/secret-settings"})).statusCode).toBe(401);
  expect((await server.inject({method: "PATCH", url: "/platform/ai-config/secret-settings/unknown", payload: {value: null}})).statusCode).toBe(401);
  authSpy.mockRestore();
  authenticate({permissions: auth.permissions.filter(permission => permission.code !== "platform.system_setting.manage")});
  expect((await server.inject({method: "PATCH", url: "/platform/ai-config/secret-settings/unknown", payload: {value: null}})).statusCode).toBe(403);
  expect(metadataSpy).not.toHaveBeenCalled();
  expect(writeSpy).not.toHaveBeenCalled();
});

test("safe responses and logs exclude input even for unknown keys, extra fields and malformed JSON", async () => {
  authenticate();
  const {server, logs} = await app();
  const synthetic = ["synthetic", "secret", "input"].join("-");
  const metadataSpy = spyOn(systemSettingRepository, "listPlatformAiSecretMetadata").mockResolvedValue([]);
  const writeSpy = spyOn(systemSettingsService, "updateSetting").mockResolvedValue({value_text: synthetic});
  restores.push(() => metadataSpy.mockRestore(), () => writeSpy.mockRestore());
  const responses = [
    await server.inject({method: "PATCH", url: "/platform/ai-config/secret-settings/AI_API_KEY", payload: {value: synthetic}}),
    await server.inject({method: "PATCH", url: `/platform/ai-config/secret-settings/${synthetic}?${synthetic}=1`, payload: {value: null}}),
    await server.inject({method: "PATCH", url: "/platform/ai-config/secret-settings/AI_API_KEY", payload: {value: synthetic, [synthetic]: true}}),
    await server.inject({method: "PATCH", url: "/platform/ai-config/secret-settings/AI_API_KEY", headers: {"content-type": "application/json"}, payload: `{"value": ${synthetic}}`}),
  ];
  expect(responses.map(response => response.statusCode)).toEqual([200, 400, 400, 400]);
  expect(responses[0]?.json()).toMatchObject({data: {key: "AI_API_KEY", saved: true}});
  for (const response of responses) {
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).not.toContain(synthetic);
  }
  expect(logs.join("\n")).not.toContain(synthetic);
  expect(writeSpy).toHaveBeenCalledTimes(1);
  const read = await server.inject({method: "GET", url: "/platform/ai-config/secret-settings"});
  expect(read.headers["cache-control"]).toBe("private, no-store");
  expect(read.json().data.list).toHaveLength(4);
});

test("model endpoint redacts nested historical provider values at HTTP boundary", async () => {
  authenticate();
  const {server} = await app();
  const synthetic = ["synthetic", "historical", "input"].join("-");
  const model = {
    id: "model", provider_id: "provider", code: "model", name: "model", model_name: "model",
    status: "active" as const, sort_order: 0, created_at: "now", updated_at: "now",
    provider: {id: "provider", code: "provider", name: "provider", provider_type: "openai_compatible", endpoint_url: null, api_key_setting_key: synthetic, status: "active" as const, sort_order: 0, created_at: "now", updated_at: "now"},
  };
  const listSpy = spyOn(aiConfigService, "listModels").mockResolvedValue({list: [model], pagination: {page: 1, pageSize: 20, total: 1, totalPages: 1}});
  restores.push(() => listSpy.mockRestore());
  const response = await server.inject({method: "GET", url: "/platform/ai-config/models"});
  expect(response.statusCode).toBe(200);
  expect(response.body).not.toContain(synthetic);
  expect(response.json().data.list[0].provider).toMatchObject({api_key_setting_key: null, api_key_setting_invalid: true});
});
