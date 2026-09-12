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


describe("AiConfigService server-owned resource codes", () => {
  test("normalizes provider PATCH URLs while preserving omitted and null endpoint semantics", async () => {
    const { AiConfigService } = await import("./index");
    const writes: unknown[] = [];
    const service = new AiConfigService({ configRepository: {
      updateProvider: async (_id, input) => { writes.push(input); return { ...provider(), ...input }; },
    }, auditRepository: { create: async () => auditRecord } });
    await service.updateProvider(authContext(), PROVIDER_ID, { expected_version: 2, endpoint_url: "https://example.com/api/v3/images/generations" });
    await service.updateProvider(authContext(), PROVIDER_ID, { expected_version: 2, name: "Rename" });
    await service.updateProvider(authContext(), PROVIDER_ID, { expected_version: 2, endpoint_url: null });
    expect(writes).toEqual([
      { expected_version: 2, endpoint_url: "https://example.com/api/v3" },
      { expected_version: 2, name: "Rename" }, { expected_version: 2, endpoint_url: null },
    ]);
  });

  test("rejects unsafe provider PATCH URLs before persistence with a sanitized stable error", async () => {
    const { AiConfigService } = await import("./index");
    let writes = 0;
    const service = new AiConfigService({ configRepository: {
      updateProvider: async () => { writes++; return provider(); },
    }, auditRepository: { create: async () => auditRecord } });
    for (const endpoint_url of ["http://example.com/api/v3", "https://example.com/api/v3/predict"]) {
      await expect(service.updateProvider(authContext(), PROVIDER_ID, { expected_version: 2, endpoint_url }))
        .rejects.toMatchObject({ statusCode: 400, code: "AI_PROVIDER_ENDPOINT_INVALID", details: undefined });
    }
    expect(writes).toBe(0);
  });

  test("normalizes provider base URLs and wraps invalid URLs without raw errors", async () => {
    const { AiConfigService } = await import("./index");
    const service = new AiConfigService({
      secretSettingsService: { assertReference: async () => undefined },
      configRepository: { createProvider: async input => ({ ...provider(), ...input }) },
      auditRepository: { create: async () => auditRecord },
    });
    const input = { name: "Ark", provider_type: "openai_compatible" as const, api_key_setting_key: "ARK_API_KEY" as const,
      status: "active" as const, sort_order: 0, endpoint_url: "https://example.com/api/v3/images/generations" };
    expect((await service.createProvider(authContext(), input)).endpoint_url).toBe("https://example.com/api/v3");
    await expect(service.createProvider(authContext(), { ...input, endpoint_url: "http://bad?secret=value" }))
      .rejects.toMatchObject({ statusCode: 400, code: "AI_PROVIDER_ENDPOINT_INVALID" });
  });

  test("checks route references only for an actual modality change", async () => {
    const { AiConfigService } = await import("./index");
    let reads = 0; let references = 0; let writes = 0; let used = true; let raced = false;
    const databaseConflict = Errors.business(409, "模型已有场景路由引用，不能修改模态", "AI_MODEL_MODALITY_IN_USE");
    const service = new AiConfigService({ configRepository: {
      getModelById: async () => { reads++; return model(); },
      hasModelRouteReference: async () => { references++; return used; },
      updateModel: async (_id, input) => {
        writes++;
        if (raced) throw databaseConflict;
        return { ...model(), ...input };
      },
    }, auditRepository: { create: async () => auditRecord } });
    await service.updateModel(authContext(), MODEL_ID, { name: "Rename", status: "inactive", sort_order: 4, expected_version: 1 });
    expect([reads, references, writes]).toEqual([0, 0, 1]);
    await service.updateModel(authContext(), MODEL_ID, { modality: "text", expected_version: 1 });
    expect(references).toBe(0);
    await expect(service.updateModel(authContext(), MODEL_ID, { modality: "image", expected_version: 1 }))
      .rejects.toMatchObject({ statusCode: 409, code: "AI_MODEL_MODALITY_IN_USE" });
    used = false;
    await service.updateModel(authContext(), MODEL_ID, { modality: "image", expected_version: 1 });
    expect([references, writes]).toEqual([2, 3]);
    raced = true;
    await expect(service.updateModel(authContext(), MODEL_ID, { modality: "image", expected_version: 1 }))
      .rejects.toBe(databaseConflict);
    expect([references, writes]).toEqual([3, 4]);
  });

  test("lists models through the bounded config repository", async () => {
    const { AiConfigService } = await import("./index");
    const queries: unknown[] = [];
    const page = { list: [model()], pagination: { page: 2, pageSize: 1, total: 2, totalPages: 2 } };
    const service = new AiConfigService({ catalogRepository: {}, configRepository: { listModels: async query => { queries.push(query); return page; } } });
    expect(await service.listModels(authContext(), { page: 2, pageSize: 1, modality: "image" })).toEqual(page);
    expect(queries).toEqual([{ page: 2, pageSize: 1, modality: "image" }]);
  });

  test("reuses each manual business key and retries only its read after a unique conflict", async () => {
    const { AiConfigService } = await import("./index");
    for (const modality of ["text", "image", "video", "speech"] as const) {
      for (const mode of ["existing", "create", "race", "unresolved"] as const) {
        const calls: unknown[] = []; let reads = 0;
        const conflict = Errors.business(409, "Already registered", "AI_MODEL_ALREADY_REGISTERED");
        const service = new AiConfigService({ codeFactory: kind => `${kind}_opaque`, configRepository: {
          getProviderById: async () => provider({ provider_type: "openrouter" }),
          findModelByProviderAndCallName: async (...key) => {
            calls.push(key); reads++;
            return mode === "existing" || (mode === "race" && reads === 2) ? model({ modality }) : null;
          },
          createManualModel: async input => {
            calls.push(input);
            if (mode === "race" || mode === "unresolved") throw conflict;
            return model({ modality });
          },
        } });
        const result = service.resolveRouteModelOption(authContext(), PROVIDER_ID, { source: "manual", model_name: "model-x", modality });
        if (mode === "unresolved") await expect(result).rejects.toBe(conflict);
        else expect((await result).model.modality).toBe(modality);
        expect(calls[0]).toEqual([PROVIDER_ID, "model-x", modality]);
        if (mode !== "existing") expect(calls[1]).toMatchObject({ code: "mdl_opaque", modelName: "model-x", modality, inputModalities: [modality] });
        expect(calls).toHaveLength(mode === "existing" ? 1 : mode === "create" ? 2 : 3);
      }
    }
  });
  test("creates provider and model codes before repository insertion", async () => {
    const { AiConfigService } = await import("./index");
    const calls: unknown[] = [];
    const service = new AiConfigService({
      codeFactory: (kind) => { calls.push(kind); return `${kind}_opaque`; },
      secretSettingsService: { assertReference: async () => undefined },
      configRepository: {
        createProvider: async (input) => { calls.push(input); return { ...provider(), ...input }; },
        createModel: async (input) => { calls.push(input); return { ...model(), ...input }; },
      },
      auditRepository: { create: async () => auditRecord },
    });
    const providerInput = { name: "兼容供应商", provider_type: "openai_compatible" as const,
      api_key_setting_key: "ARK_API_KEY" as const, status: "active" as const, sort_order: 0 };
    const modelInput = { name: "Seedream", provider_id: PROVIDER_ID, model_name: "seedream",
      modality: "image" as const, status: "active" as const, sort_order: 0 };
    expect((await service.createProvider(authContext(), providerInput)).code).toBe("prv_opaque");
    expect((await service.createModel(authContext(), modelInput)).code).toBe("mdl_opaque");
    expect(calls).toEqual(["prv", { ...providerInput, code: "prv_opaque" }, "mdl", { ...modelInput, code: "mdl_opaque" }]);
  });

  test("generates opaque codes by default without deriving identity from names", async () => {
    const { AiConfigService } = await import("./index");
    const service = new AiConfigService({
      configRepository: { createModel: async (input) => ({ ...model(), ...input }) },
      auditRepository: { create: async () => auditRecord },
    });
    const input = { name: "Seedream", provider_id: PROVIDER_ID, model_name: "seedream",
      modality: "image" as const, status: "active" as const, sort_order: 0 };
    const first = await service.createModel(authContext(), input);
    const second = await service.createModel(authContext(), input);
    expect(first.code).toMatch(/^mdl_[0-9a-f]{32}$/);
    expect(second.code).not.toBe(first.code);
  });
});

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
  test("does not switch an internal options result to the catalog on an empty later page", async () => {
    const { AiConfigService } = await import("./index");
    const internal = { list: [], pagination: { page: 2, pageSize: 20, total: 1, totalPages: 1 } };
    const catalog = { list: [], pagination: { page: 2, pageSize: 20, total: 50, totalPages: 3 } };
    const service = new AiConfigService({ configRepository: {
      getProviderById: async () => provider({ provider_type: "openrouter" }), listRouteModels: async () => internal,
    }, catalogRepository: { listLatestEligibleCatalogRouteOptions: async () => catalog } });
    expect((await service.listRouteModelOptions(authContext(), PROVIDER_ID, { page: 2, pageSize: 20 })).pagination).toEqual(internal.pagination);
  });
  test("OpenRouter reports empty discovery and propagates failures without fake empty results", async () => {
    const { AiConfigService } = await import("./index");
    const page = { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
    let failure = false;
    const error = Errors.business(502, "目录失败", "AI_OPENROUTER_CATALOG_FAILED");
    const service = new AiConfigService({ configRepository: {
      getProviderById: async () => provider({ provider_type: "openrouter" }), listRouteModels: async () => page,
    }, catalogRepository: { listLatestEligibleCatalogRouteOptions: async () => { if (failure) throw error; return page; } } });
    expect(await service.listRouteModelOptions(authContext(), PROVIDER_ID, { page: 1, pageSize: 20 }))
      .toEqual({ ...page, discovery: { mode: "openrouter_catalog", status: "empty" } });
    failure = true;
    await expect(service.listRouteModelOptions(authContext(), PROVIDER_ID, { page: 1, pageSize: 20 })).rejects.toBe(error);
    await expect(service.resolveRouteModelOption({ ...authContext(), permissions: [] }, PROVIDER_ID,
      { source: "manual", model_name: "x", modality: "image" })).rejects.toMatchObject({ statusCode: 403 });
  });
  test("inspection requires platform read permission before accessing provider or models", async () => {
    const { AiConfigService } = await import("./index");
    const calls: string[] = [];
    const page = { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
    const service = new AiConfigService({ configRepository: {
      getProviderById: async () => { calls.push("provider"); return provider(); },
      listRouteModels: async () => { calls.push("models"); return page; },
    } });
    const reader = { ...authContext(), isPlatformAdmin: false, isPlatformSuperAdmin: false,
      permissions: [{ code: "platform.ai_config.read", scope: "all" as const }] };
    const query = { page: 1, pageSize: 20, view: "inspect" as const };
    for (const auth of [
      { ...reader, tenantId: "tenant" },
      { ...reader, isPlatformStaff: false },
      { ...reader, permissions: [] },
    ]) {
      await expect(service.listRouteModelOptions(auth, PROVIDER_ID, query)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(calls).toEqual([]);
    expect(await service.listRouteModelOptions(reader, PROVIDER_ID, query)).toEqual({ ...page, discovery: { mode: "internal_only", status: "unsupported" } });
    expect(calls).toEqual(["provider", "models"]);
  });

  test("inspection returns registered models without active filtering, synthetic candidates or catalog reads", async () => {
    const { AiConfigService } = await import("./index");
    for (const providerType of ["openai_compatible", "openrouter"]) {
      const calls: unknown[] = [];
      const registered = { list: [{ ...model({ status: "inactive" }), source: "internal" as const,
        value: MODEL_ID, model_id: MODEL_ID, label: "Registered text", description: null }],
        pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } };
      const service = new AiConfigService({ configRepository: {
        getProviderById: async () => provider({ provider_type: providerType }),
        listRouteModels: async (_id, query) => { calls.push(query); return registered; },
      } });
      const query = { page: 2, pageSize: 20, keyword: "registered", view: "inspect" as const };
      expect(await service.listRouteModelOptions(authContext(), PROVIDER_ID, query)).toEqual({ ...registered, discovery: { mode: "internal_only", status: "unsupported" } });
      expect(calls).toEqual([query]);
    }
  });

  test("keeps manual input out of paginated rows and totals", async () => {
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
      const totalPages = Math.ceil(total / pageSize);
      const values: string[] = [];
      for (let page = 1; page <= totalPages + 1; page += 1) {
        const result = await service.listRouteModelOptions(authContext(), PROVIDER_ID, {
          page, pageSize, keyword: "custom", modality: "text",
        });
        expect(result.list.length).toBeLessThanOrEqual(pageSize);
        expect(result.pagination).toEqual({ page, pageSize, total, totalPages });
        expect(result.discovery).toEqual({ mode: "internal_only", status: "unsupported" });
        values.push(...result.list.map((item) => item.value));
      }
      expect(values).toEqual(internal.map((item) => item.value));
      expect(calls).toHaveLength(totalPages + 1);
    }
  });

  test("requires an active provider before listing route model options", async () => {
    const { AiConfigService } = await import("./index");
    let catalogCalled = false;
    let modelsCalled = false;
    const service = new AiConfigService({
      configRepository: {
        getProviderById: async () => provider({ status: "inactive" }),
        listRouteModels: async () => {
          modelsCalled = true;
          return { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
        },
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
    await expect(service.listRouteModelOptions(authContext(), PROVIDER_ID, {
      page: 1, pageSize: 20, view: "inspect",
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_PROVIDER_INACTIVE" });
    expect(modelsCalled).toBe(false);
    expect(catalogCalled).toBe(false);
  });

  test("resolves manual route models for both supported provider types", async () => {
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
    })).resolves.toMatchObject({ model_id: MODEL_ID });
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
      discovery: { mode: "openrouter_catalog", status: "ready" },
    });
  });

});
