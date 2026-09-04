import { describe, expect, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PROVIDER_ID = "11111111-1111-4111-8111-111111111111";
const OPENROUTER_PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const MODEL_ID = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "44444444-4444-4444-8444-444444444444";
const AUTH_USER_ID = "55555555-5555-4555-8555-555555555555";

function authContext(): AuthContext {
  return {
    authUserId: AUTH_USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    isPlatformStaff: true,
    isPlatformSuperAdmin: true,
    adminAuthVersion: 1,
    employeeName: "平台超管",
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
    permissions: [
      { code: "platform.ai_config.read", scope: "all" },
      { code: "platform.ai_config.manage", scope: "all" },
    ],
  };
}

function provider(input: Partial<{
  id: string;
  code: string;
  name: string;
  provider_type: string;
  status: "active" | "inactive";
}> = {}) {
  return {
    id: input.id ?? PROVIDER_ID,
    code: input.code ?? "openai_compatible",
    name: input.name ?? "兼容供应商",
    provider_type: input.provider_type ?? "openai_compatible",
    endpoint_url: "https://example.com/v1",
    api_key_setting_key: "AI_PROVIDER_KEY",
    status: input.status ?? "active",
    sort_order: 0,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
  };
}

function model(input: Partial<{
  id: string;
  provider_id: string;
  name: string;
  model_name: string;
  modality: "text" | "image" | "video" | "speech";
  status: "active" | "inactive";
}> = {}) {
  return {
    id: input.id ?? MODEL_ID,
    provider_id: input.provider_id ?? PROVIDER_ID,
    code: "manual.deepseek_chat",
    name: input.name ?? "DeepSeek Chat",
    model_name: input.model_name ?? "deepseek-chat",
    modality: input.modality ?? "text",
    input_modalities: ["text"],
    catalog_managed: false,
    probe_status: "unverified" as const,
    status: input.status ?? "active",
    sort_order: 0,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    provider: provider(),
  };
}

describe("AiConfigService route model options", () => {
  test("requires an active provider before listing route model options", async () => {
    const { AiConfigService } = await import("./index");
    let catalogCalled = false;
    const service = new AiConfigService({
      configRepository: {
        getProviderById: async () => provider({ status: "inactive" }),
        listRouteModels: async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
      },
      catalogRepository: {
        listLatestEligibleCatalogRouteOptions: async () => {
          catalogCalled = true;
          return { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
        },
      },
    });

    await expect(service.listRouteModelOptions(authContext(), PROVIDER_ID, {
      page: 1,
      pageSize: 20,
      modality: "text",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "AI_PROVIDER_INACTIVE",
    });
    expect(catalogCalled).toBe(false);
  });

  test("resolves manual route model only for openai compatible providers", async () => {
    const { AiConfigService } = await import("./index");
    const createdModel = model({ model_name: "deepseek-chat" });
    const service = new AiConfigService({
      configRepository: {
        getProviderById: async (id: string) => id === OPENROUTER_PROVIDER_ID
          ? provider({ id, provider_type: "openrouter", code: "openrouter" })
          : provider(),
        findModelByProviderAndCallName: async () => null,
        createManualModel: async () => createdModel,
      },
      catalogRepository: {
        getCatalogRouteModelEntry: async () => null,
      },
    });

    await expect(service.resolveRouteModelOption(authContext(), PROVIDER_ID, {
      source: "manual",
      model_name: "deepseek-chat",
      modality: "text",
    })).resolves.toMatchObject({ model_id: MODEL_ID });

    await expect(service.resolveRouteModelOption(authContext(), OPENROUTER_PROVIDER_ID, {
      source: "manual",
      model_name: "deepseek-chat",
      modality: "text",
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "AI_ROUTE_MODEL_MANUAL_UNSUPPORTED",
    });
  });

  test("rejects route save when primary and fallback are the same model", async () => {
    const { AiConfigService } = await import("./index");
    const service = new AiConfigService({
      configRepository: {
        getModelById: async () => model(),
        createSceneRoute: async () => {
          throw new Error("createSceneRoute should not be called");
        },
      },
    });

    await expect(service.createSceneRoute(authContext(), {
      scene_code: "decoration_qa",
      name: "装修问答",
      primary_model_id: MODEL_ID,
      fallback_model_id: MODEL_ID,
      quality_tier: "balanced",
      modality: "text",
      status: "active",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "AI_ROUTE_MODEL_DUPLICATED",
    });
  });
});
