import { readFileSync } from "node:fs";
import "reflect-metadata";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import Fastify from "fastify";
import { registerRoutes } from "@/utils/decorators/route";
import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const restores: Array<() => void> = [];
afterEach(() => { for (const restore of restores.splice(0)) restore(); });

function source() {
  return readFileSync(new URL("./index.ts", import.meta.url), "utf8");
}

describe("AiConfigController routes", () => {
  test("declares paginated catalog and OpenRouter command routes", () => {
    const code = source();
    for (const route of [
      '@Get("/platform/ai-config/providers")',
      '@Get("/platform/ai-config/models")',
      '@Get("/platform/ai-config/routes")',
      '@Get("/platform/ai-config/system-scenes")',
      '@Get("/platform/ai-config/scenes")',
      '@Patch("/platform/ai-config/scenes/:code")',
      '@Delete("/platform/ai-config/scenes/:code")',
      '@Post("/platform/ai-config/providers/:id/validate")',
      '@Get("/platform/ai-config/providers/:id/route-model-options")',
      '@Post("/platform/ai-config/providers/:id/route-model-options:resolve")',
      '@Get("/platform/ai-config/catalog-runs")',
      '@Get("/platform/ai-config/catalog-runs/:id/entries")',
      '@Post("/platform/ai-config/openrouter/models/sync-preview")',
      '@Post("/platform/ai-config/openrouter/models/apply")',
      '@Patch("/platform/ai-config/models/:id/capability")',
      '@Get("/platform/ai-config/openrouter/credits")',
      '@Get("/platform/ai-config/usage-summary")',
    ]) {
      expect(code).toContain(route);
    }
    expect(code).toContain("AiModelListQuerySchema.safeParse");
    expect(code).toContain("SystemAiSceneListQuerySchema.safeParse");
    expect(code).toContain("AiRouteModelOptionListQuerySchema.safeParse");
    expect(code).toContain("AiRouteModelOptionResolvePayloadSchema.safeParse");
    expect(code).toContain("OpenRouterCatalogApplyPayloadSchema.safeParse");
    expect(code).toContain("this.getAiConfigManageContext(request)");
  });
});

test("registered scene and validation endpoints enforce platform permissions and strict HTTP contracts", async () => {
  const controller = (await import("./index")).default;
  const { aiConfigService: service } = await import("@/services/ai-config");
  const { authorizationService } = await import("@/services/authorization");
  const { platformAuthorizationRepository } = await import("@/repositories/platform-authorization");
  const errorHandler = (await import("@/plugins/error-handler")).default;
  const auth = { authUserId: "user", employeeId: "staff", tenantId: null, isPlatformStaff: true, isPlatformAdmin: false,
    permissions: [{ code: "platform.ai_config.manage", scope: "all" as const }, { code: "platform.ai_config.read", scope: "all" as const }] };
  const authSpy = spyOn(authorizationService, "getRequiredAuthContext").mockResolvedValue(auth as never);
  const snapshotSpy = spyOn(platformAuthorizationRepository, "getSecuritySnapshot").mockResolvedValue({
    employee_id: "staff", tenant_id: null, status: "active", role_codes: ["platform_staff"], admin_auth_version: 1,
  });
  const page = { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
  const listSpy = spyOn(service, "listScenes").mockResolvedValue(page);
  const updateSpy = spyOn(service, "updateCustomScene").mockResolvedValue({ code: "scene_x", name: "新名称" } as never);
  const deleteSpy = spyOn(service, "deleteCustomScene").mockResolvedValue({ code: "scene_x", deleted: true });
  const validateSpy = spyOn(service, "validateProvider").mockResolvedValue({ status: "unsupported", checked_at: "now", method: "none", message: "unsupported" });
  const server = Fastify(); errorHandler(server);
  server.addHook("onRequest", async request => { request.user = { sub: "user", admin_auth_version: 1 }; });
  registerRoutes(server, controller);
  restores.push(...[authSpy, snapshotSpy, listSpy, updateSpy, deleteSpy, validateSpy].map(spy => () => spy.mockRestore()), () => { void server.close(); });
  for (const request of [
    { method: "GET" as const, url: "/platform/ai-config/scenes" },
    { method: "PATCH" as const, url: "/platform/ai-config/scenes/scene_x", payload: { name: "新名称", expected_version: 2 } },
    { method: "DELETE" as const, url: "/platform/ai-config/scenes/scene_x", payload: { expected_version: 2 } },
    { method: "POST" as const, url: "/platform/ai-config/providers/11111111-1111-4111-8111-111111111111/validate" },
  ]) {
    const response = await server.inject(request);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("data");
    authSpy.mockResolvedValue({ ...auth, permissions: [] } as never);
    expect((await server.inject(request)).statusCode).toBe(403);
    authSpy.mockResolvedValue(auth as never);
  }
  expect(listSpy).toHaveBeenCalledWith(expect.anything(), { page: 1, pageSize: 20 });
  expect(updateSpy).toHaveBeenCalledWith(expect.anything(), "scene_x", { name: "新名称", expected_version: 2 });
  expect(deleteSpy).toHaveBeenCalledWith(expect.anything(), "scene_x", { expected_version: 2 });
  expect((await server.inject({ method: "GET", url: "/platform/ai-config/scenes?pageSize=101" })).statusCode).toBe(400);
  expect((await server.inject({ method: "PATCH", url: "/platform/ai-config/scenes/scene_x", payload: { expected_version: 2, modality: "text" } })).statusCode).toBe(400);
  expect((await server.inject({ method: "DELETE", url: "/platform/ai-config/scenes/scene_x?expected_version=2" })).statusCode).toBe(400);
  deleteSpy.mockRejectedValue(Errors.business(409, "仍被引用", "AI_CUSTOM_SCENE_IN_USE"));
  expect((await server.inject({ method: "DELETE", url: "/platform/ai-config/scenes/scene_x", payload: { expected_version: 2 } })).json())
    .toMatchObject({ code: "AI_CUSTOM_SCENE_IN_USE" });
});
