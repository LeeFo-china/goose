import { describe, expect, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const auth = { tenantId: null, employeeId: "staff", isPlatformStaff: true,
  permissions: [{ code: "platform.ai_config.manage", scope: "all" }] } as AuthContext;
const provider = { id: "provider", code: "prv_opaque", name: "OpenRouter", provider_type: "openrouter",
  endpoint_url: "https://openrouter.ai/api/v1", api_key_setting_key: "OPENROUTER_API_KEY",
  status: "active" as const, sort_order: 0, created_at: "now", updated_at: "now" };
const settings = { getSecretString: async () => "secret-key", getString: async (_key: string, fallback = "") => fallback };

describe("read-only provider validation", () => {
  test("requests exactly the bounded first catalog page without repository writes", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const service = new OpenRouterModelSyncService({ repository: {} as never, settings, fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ data: [{ id: "vendor/model" }], links: { next: "https://never-follow.invalid" }, total_count: 500 }) };
    } });
    expect(await service.checkCatalogConnectivity(auth, provider)).toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://openrouter.ai/api/v1/models?offset=0&limit=1");
    expect(requests[0]?.init).toMatchObject({ method: "GET", signal: expect.any(AbortSignal) });
  });

  test("maps transport, timeout, auth and malformed responses to sanitized stable errors", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    for (const mode of ["transport", "timeout", "auth", "invalid", "oversized"] as const) {
      const service = new OpenRouterModelSyncService({ repository: {} as never, settings, fetchImpl: async () => {
        if (mode === "transport" || mode === "timeout") throw new TypeError("secret-key upstream failure");
        return { ok: mode !== "auth", status: mode === "auth" ? 401 : 200,
          json: async () => mode === "oversized" ? { data: [{ id: "x" }, { id: "y" }], links: {}, total_count: 2 } : { private: "secret-key" } };
      } });
      await expect(service.checkCatalogConnectivity(auth, provider)).rejects.toMatchObject({
        statusCode: 502, details: undefined,
        code: mode === "invalid" || mode === "oversized" ? "AI_OPENROUTER_CATALOG_INVALID" : "AI_OPENROUTER_CATALOG_FAILED",
      });
    }
  });

  test("compatible validation is unsupported without external calls; OpenRouter delegates one safe check", async () => {
    const { AiConfigService } = await import("./index");
    let checks = 0; let kind = "openai_compatible";
    const service = new AiConfigService({ configRepository: { getProviderById: async () => ({ ...provider, provider_type: kind }) },
      catalogConnectivity: { checkCatalogConnectivity: async () => { checks++; } } });
    expect(await service.validateProvider(auth, provider.id)).toMatchObject({ status: "unsupported", method: "none", checked_at: expect.any(String), message: expect.any(String) });
    expect(checks).toBe(0);
    kind = "openrouter";
    expect(await service.validateProvider(auth, provider.id)).toEqual({ status: "verified", method: "openrouter_catalog", checked_at: expect.any(String) });
    expect(checks).toBe(1);
    await expect(service.validateProvider({ ...auth, permissions: [] }, provider.id)).rejects.toMatchObject({ statusCode: 403 });
    expect(checks).toBe(1);
  });

  test("preserves safe connectivity errors for retry instead of returning a successful validation", async () => {
    const { AiConfigService } = await import("./index");
    const error = Errors.business(502, "目录读取失败", "AI_OPENROUTER_CATALOG_FAILED");
    const service = new AiConfigService({ configRepository: { getProviderById: async () => provider },
      catalogConnectivity: { checkCatalogConnectivity: async () => { throw error; } } });
    await expect(service.validateProvider(auth, provider.id)).rejects.toBe(error);
  });
});
