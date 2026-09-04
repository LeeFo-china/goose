import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PROVIDER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const MODEL_ID = "55555555-5555-4555-8555-555555555555";

function auth(): AuthContext {
  return {
    authUserId: "66666666-6666-4666-8666-666666666666",
    employeeId: EMPLOYEE_ID,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    isPlatformStaff: true,
    isPlatformSuperAdmin: true,
    adminAuthVersion: 1,
    employeeName: "平台运营",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [{ code: "platform.ai_config.manage", scope: "all" }],
  };
}

describe("OpenRouterModelSyncService catalog eligibility guard", () => {
  test("saves blocked catalog entries with explicit apply eligibility state", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const repository = {
      getProvider: mock(async () => ({
        id: PROVIDER_ID,
        provider_type: "openrouter",
        status: "active",
        api_key_setting_key: "OPENROUTER_API_KEY",
      })),
      listCatalogManagedModels: mock(async () => []),
      saveOpenRouterCatalogPreview: mock(async () => ({ run_id: MODEL_ID })),
      applyOpenRouterCatalog: mock(async () => ({ run_id: MODEL_ID, applied_count: 1 })),
      saveCapabilityOverride: mock(async () => ({ model_id: MODEL_ID, version: 4 })),
      getOpenRouterUsageSummary: mock(async () => ({ requests_24h: 0, estimated_cost_usd_24h: 0 })),
    };
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: {
        getSecretString: mock(async () => "secret-openrouter-key"),
        getString: mock(async (_key: string, fallback: string) => fallback),
      } as never,
      fetchImpl: mock(async (url: string) => {
        const parsedUrl = new URL(url);
        const textCatalog = {
          data: [{
            id: "openrouter/text-no-context",
            name: "Text No Context",
            architecture: { output_modalities: ["text"] },
            pricing: { prompt: "0.1" },
            supported_parameters: ["stream"],
          }],
          links: {},
          total_count: 1,
        };
        const payloads: Record<string, unknown> = {
          "/api/v1/models": textCatalog,
          "/api/v1/images/models": { data: [] },
          "/api/v1/videos/models": { data: [] },
          "/api/v1/models?output_modalities=speech": { data: [], links: {}, total_count: 0 },
        };
        return {
          ok: true,
          status: 200,
          json: async () => payloads[`${parsedUrl.pathname}${parsedUrl.search}`],
        };
      }) as never,
    });

    await service.createPreview(auth(), { provider_id: PROVIDER_ID });

    expect(repository.saveOpenRouterCatalogPreview).toHaveBeenCalledWith(expect.objectContaining({
      entries: [expect.objectContaining({
        external_model_id: "openrouter/text-no-context",
        apply_status: "blocked",
        apply_block_code: "CAPABILITY_METADATA_INCOMPLETE",
      })],
    }));
  });
});
