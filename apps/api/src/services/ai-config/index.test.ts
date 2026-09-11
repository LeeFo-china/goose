import { describe, expect, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PROVIDER_ID = "11111111-1111-4111-8111-111111111111";
const OPENROUTER_PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const MODEL_ID = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "44444444-4444-4444-8444-444444444444";
const AUTH_USER_ID = "55555555-5555-4555-8555-555555555555";
const auditRecord = {
  id: "audit", action: "platform_config_update", actor_employee_id: EMPLOYEE_ID, actor_user_id: AUTH_USER_ID,
  target_tenant_id: null, resource_type: "ai_provider", resource_id: PROVIDER_ID, resource_label: "Test provider",
  status: "success", summary: "删除 AI 供应商", metadata: {}, created_at: "2026-09-11T00:00:00.000Z",
};

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


describe("AiConfigService restricted provider delete", () => {
  test("returns minimal deletion result and audits only provider identity after deletion", async () => {
    const { AiConfigService } = await import("./index");
    const calls: unknown[] = [];
    const service = new AiConfigService({
      configRepository: { deleteProvider: async (id, input) => {
        calls.push({ id, input });
        return { id, name: "Test provider" };
      } },
      auditRepository: { create: async (input) => { calls.push(input); return auditRecord; } },
    });
    expect(await service.deleteProvider(authContext(), PROVIDER_ID, { expected_version: 3 }))
      .toEqual({ id: PROVIDER_ID, deleted: true });
    expect(calls).toEqual([
      { id: PROVIDER_ID, input: { expected_version: 3 } },
      { action: "platform_config_update", actorEmployeeId: EMPLOYEE_ID, actorUserId: AUTH_USER_ID,
        resourceType: "ai_provider", resourceId: PROVIDER_ID, resourceLabel: "Test provider", summary: "删除 AI 供应商" },
    ]);
  });

  test("denies tenant identities and staff without manage permission before persistence", async () => {
    const { AiConfigService } = await import("./index");
    let writes = 0;
    const service = new AiConfigService({ configRepository: { deleteProvider: async () => {
      writes += 1;
      return { id: PROVIDER_ID, name: "Test provider" };
    } } });
    for (const auth of [
      { ...authContext(), tenantId: "tenant" },
      { ...authContext(), isPlatformAdmin: false, isPlatformStaff: false, isPlatformSuperAdmin: false },
      { ...authContext(), isPlatformAdmin: false, isPlatformSuperAdmin: false, permissions: [{ code: "platform.ai_config.read", scope: "all" as const }] },
    ]) {
      await expect(service.deleteProvider(auth, PROVIDER_ID, { expected_version: 3 })).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(writes).toBe(0);
  });

  test("failed deletion propagates the conflict and does not write success audit", async () => {
    const { AiConfigService } = await import("./index");
    let audits = 0;
    const service = new AiConfigService({
      configRepository: { deleteProvider: async () => { throw Errors.business(409, "供应商仍有关联模型或目录记录，请改用停用", "AI_PROVIDER_IN_USE"); } },
      auditRepository: { create: async () => { audits += 1; return auditRecord; } },
    });
    await expect(service.deleteProvider(authContext(), PROVIDER_ID, { expected_version: 3 })).rejects.toMatchObject({ code: "AI_PROVIDER_IN_USE" });
    expect(audits).toBe(0);
  });
});

describe("AiConfigService route model options", () => {
  test("counts the manual candidate once and keeps every page within its requested size", async () => {
    const { AiConfigService } = await import("./index");
    for (const [total, pageSize] of [[0, 20], [19, 20], [20, 20], [21, 20], [100, 100]] as const) {
      const calls: unknown[] = [];
      const internal = Array.from({ length: total }, (_, index) => ({
        ...model({ id: `model-${index}` }),
        source: "internal" as const, value: `model-${index}`, model_id: `model-${index}`,
        provider_id: PROVIDER_ID, label: `Model ${index}`, description: null,
        modality: "text" as const, status: "active" as const,
      }));
      const service = new AiConfigService({ configRepository: {
        getProviderById: async () => provider(),
        listRouteModels: async (_id, query) => {
          calls.push(query);
          const offset = (query.page - 1) * query.pageSize;
          return { list: internal.slice(offset, offset + query.pageSize),
            pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
        },
      } });
      const totalPages = Math.ceil((total + 1) / pageSize);
      const values: string[] = [];
      for (let page = 1; page <= totalPages + 1; page += 1) {
        const result = await service.listRouteModelOptions(authContext(), PROVIDER_ID, {
          page, pageSize, keyword: "custom", modality: "text",
        });
        expect(result.list.length).toBeLessThanOrEqual(pageSize);
        expect(result.pagination).toEqual({ page, pageSize, total: total + 1, totalPages });
        values.push(...result.list.map((item) => item.value));
      }
      expect(values).toEqual([...internal.map((item) => item.value), "manual:custom"]);
      expect(calls).toHaveLength(totalPages + 1);
    }
  });

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

  test("lists OpenRouter catalog options when no internal models exist", async () => {
    const { AiConfigService } = await import("./index");
    const service = new AiConfigService({
      configRepository: {
        getProviderById: async () => provider({ provider_type: "openrouter", code: "openrouter" }),
        listRouteModels: async () => ({
          list: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        }),
      },
      catalogRepository: {
        listLatestEligibleCatalogRouteOptions: async () => ({
          list: [{
            source: "catalog" as const,
            value: "66666666-6666-4666-8666-666666666666",
            model_id: null,
            provider_id: PROVIDER_ID,
            label: "GPT-4o",
            description: "openai/gpt-4o",
            modality: "text" as const,
            apply_status: "eligible",
          }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      },
    });

    await expect(service.listRouteModelOptions(authContext(), PROVIDER_ID, {
      page: 1,
      pageSize: 20,
      modality: "text",
    })).resolves.toMatchObject({
      list: [{ source: "catalog", label: "GPT-4o" }],
    });
  });

});
