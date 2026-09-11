import { beforeAll, describe, expect, test } from "bun:test";

import type { AiSystemSceneRecord } from "@/repositories/ai-system-scenes";
import { UpdateAiSceneRoutePayloadSchema } from "@/schema/ai-config";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let AiConfigService: typeof import("./index").AiConfigService;
beforeAll(async () => {
  ({ AiConfigService } = await import("./index"));
});

const PROVIDER_ID = "11111111-1111-4111-8111-111111111111";
const MODEL_ID = "33333333-3333-4333-8333-333333333333";
const FALLBACK_MODEL_ID = "66666666-6666-4666-8666-666666666666";

function authContext(): AuthContext {
  return {
    authUserId: "55555555-5555-4555-8555-555555555555",
    employeeId: "44444444-4444-4444-8444-444444444444",
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

function provider(status: "active" | "inactive" = "active") {
  return {
    id: PROVIDER_ID,
    code: "openai_compatible",
    name: "兼容供应商",
    provider_type: "openai_compatible",
    endpoint_url: "https://example.com/v1",
    api_key_setting_key: "AI_PROVIDER_KEY",
    status,
    sort_order: 0,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
  } as const;
}

function model(input: Partial<{
  id: string;
  modality: "text" | "image" | "video" | "speech";
  providerStatus: "active" | "inactive";
}> = {}) {
  return {
    id: input.id ?? MODEL_ID,
    provider_id: PROVIDER_ID,
    code: "manual.deepseek_chat",
    name: "DeepSeek Chat",
    model_name: "deepseek-chat",
    modality: input.modality ?? "text",
    input_modalities: ["text"],
    catalog_managed: false,
    probe_status: "unverified" as const,
    status: "active" as const,
    sort_order: 0,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    provider: provider(input.providerStatus),
  };
}

function scene(input: Partial<AiSystemSceneRecord> = {}): AiSystemSceneRecord {
  return {
    code: input.code ?? "decoration_qa",
    name: input.name ?? "装修问答",
    modality: input.modality ?? "text",
    required_input_modalities: input.required_input_modalities ?? ["text"],
    runtime_status: input.runtime_status ?? "connected",
    requirements_source: input.requirements_source ?? "runtime",
    requires_streaming: input.requires_streaming ?? true,
    min_reference_images: input.min_reference_images ?? 0,
    source: input.source ?? "system",
    allow_new_configuration: input.allow_new_configuration ?? true,
  };
}

function route(input: Partial<{
  scene_code: string;
  modality: "text" | "image" | "video" | "speech";
  primary_model_id: string | null;
  fallback_model_id: string | null;
}> = {}) {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    scene_code: input.scene_code ?? "decoration_qa",
    name: "装修问答",
    primary_model_id: input.primary_model_id === undefined ? MODEL_ID : input.primary_model_id,
    fallback_model_id: input.fallback_model_id === undefined ? FALLBACK_MODEL_ID : input.fallback_model_id,
    quality_tier: "balanced" as const,
    modality: input.modality ?? "text",
    temperature: null,
    response_format: "text" as const,
    timeout_ms: null,
    status: "active" as const,
    version: 2,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
  };
}

describe("AiConfigService scene route registry policy", () => {
  test("lists the paginated registry under read permission", async () => {
    const page = { list: [scene()], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } };
    const service = new AiConfigService({ systemSceneRepository: { list: async () => page } });
    await expect(service.listSystemScenes(authContext(), { page: 1, pageSize: 20 })).resolves.toEqual(page);
    await expect(service.listSystemScenes({
      ...authContext(),
      permissions: [{ code: "platform.ai_config.manage", scope: "all" }],
    }, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("derives identity and rejects unknown, legacy, mismatched, or duplicate create inputs", async () => {
    const writes: unknown[] = [];
    let currentScene: AiSystemSceneRecord | null = scene();
    const service = new AiConfigService({
      configRepository: {
        createSceneRoute: async (input) => {
          writes.push(input);
          return { ...route({ primary_model_id: null, fallback_model_id: null }), ...input };
        },
      },
      systemSceneRepository: { getByCode: async () => currentScene },
    });

    await service.createSceneRoute(authContext(), {
      scene_code: "decoration_qa", quality_tier: "balanced", status: "active",
    });
    expect(writes[0]).toMatchObject({
      name: "装修问答", modality: "text", primary_model_id: null, fallback_model_id: null,
    });

    currentScene = scene({ source: "legacy", allow_new_configuration: false });
    await expect(service.createSceneRoute(authContext(), {
      scene_code: "decoration_qa", quality_tier: "fast", status: "active",
    })).rejects.toMatchObject({ statusCode: 400, code: "AI_SCENE_NOT_CONFIGURABLE" });
    currentScene = null;
    await expect(service.createSceneRoute(authContext(), {
      scene_code: "unknown_scene", quality_tier: "fast", status: "active",
    })).rejects.toMatchObject({ statusCode: 400, code: "AI_SCENE_NOT_CONFIGURABLE" });
    currentScene = scene();
    await expect(service.createSceneRoute(authContext(), {
      scene_code: "decoration_qa", modality: "image", quality_tier: "quality", status: "active",
    })).rejects.toMatchObject({ statusCode: 400, code: "AI_SCENE_MODALITY_MISMATCH" });
    await expect(service.createSceneRoute(authContext(), {
      scene_code: "decoration_qa", primary_model_id: MODEL_ID, fallback_model_id: MODEL_ID,
      quality_tier: "quality", status: "active",
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_ROUTE_MODEL_DUPLICATED" });
  });

  test("allows an unbound disconnected image route but rejects a newly bound model", async () => {
    const imageScene = scene({
      code: "decoration_raw_drawing", name: "装修生图", modality: "image",
      runtime_status: "not_connected", requirements_source: "planned_adapter",
    });
    const service = new AiConfigService({
      configRepository: { createSceneRoute: async (input) => ({
        ...route({ scene_code: input.scene_code, modality: input.modality,
          primary_model_id: null, fallback_model_id: null }), ...input,
      }) },
      systemSceneRepository: { getByCode: async () => imageScene },
    });
    await expect(service.createSceneRoute(authContext(), {
      scene_code: imageScene.code, quality_tier: "balanced", status: "inactive",
    })).resolves.toMatchObject({ primary_model_id: null, modality: "image" });
    await expect(service.createSceneRoute(authContext(), {
      scene_code: imageScene.code, primary_model_id: MODEL_ID,
      quality_tier: "quality", status: "inactive",
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_SCENE_RUNTIME_NOT_CONNECTED" });
  });

  test("preserves or clears an existing disconnected image binding but rejects replacement or fallback", async () => {
    const imageScene = scene({
      code: "decoration_raw_drawing", name: "装修生图", modality: "image",
      runtime_status: "not_connected", requirements_source: "planned_adapter",
    });
    const persisted = route({
      scene_code: imageScene.code,
      modality: "image",
      primary_model_id: MODEL_ID,
      fallback_model_id: null,
    });
    const writes: unknown[] = [];
    const service = new AiConfigService({
      configRepository: {
        getSceneRouteById: async () => persisted,
        getModelById: async (id) => model({ id, modality: "image" }),
        updateSceneRoute: async (_id, input) => { writes.push(input); return { ...persisted, ...input }; },
      },
      systemSceneRepository: { getByCode: async () => imageScene },
    });

    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, name: "生图配置新名称",
    })).resolves.toMatchObject({ primary_model_id: MODEL_ID });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, primary_model_id: null,
    })).resolves.toMatchObject({ primary_model_id: null });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, primary_model_id: FALLBACK_MODEL_ID,
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_SCENE_RUNTIME_NOT_CONNECTED" });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, fallback_model_id: FALLBACK_MODEL_ID,
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_SCENE_RUNTIME_NOT_CONNECTED" });
    expect(writes).toHaveLength(2);
  });

  test("validates the full persisted route and does not accept a missing provider relation", async () => {
    const persisted = route();
    let updates = 0;
    const service = new AiConfigService({
      configRepository: {
        getSceneRouteById: async () => persisted,
        getModelById: async (id) => id === MODEL_ID ? model({ id }) : { ...model({ id }), provider: undefined },
        updateSceneRoute: async () => { updates += 1; return persisted; },
      },
      systemSceneRepository: { getByCode: async () => scene() },
    });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, primary_model_id: FALLBACK_MODEL_ID,
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_ROUTE_MODEL_DUPLICATED" });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, name: "新名称",
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_PROVIDER_NOT_FOUND" });
    expect(updates).toBe(0);
  });

  test("uses persisted modality, protects identity, provider state, and stale versions", async () => {
    const persisted = route({ primary_model_id: null, fallback_model_id: null });
    let modelQueries = 0;
    let selectedModel = model({ modality: "image" });
    const service = new AiConfigService({
      configRepository: {
        getSceneRouteById: async () => persisted,
        getModelById: async () => { modelQueries += 1; return selectedModel; },
        updateSceneRoute: async () => persisted,
      },
      systemSceneRepository: { getByCode: async () => scene() },
    });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, primary_model_id: MODEL_ID,
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_ROUTE_MODEL_MODALITY_MISMATCH" });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, modality: "image",
    })).rejects.toMatchObject({ statusCode: 400, code: "AI_SCENE_ROUTE_IDENTITY_IMMUTABLE" });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 1, primary_model_id: MODEL_ID,
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_CONFIG_VERSION_STALE" });
    expect(modelQueries).toBe(1);
    selectedModel = model({ providerStatus: "inactive" });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, primary_model_id: MODEL_ID,
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_PROVIDER_INACTIVE" });
  });

  test("keeps legacy route identity immutable while allowing ordinary edits", async () => {
    const persisted = route({ scene_code: "legacy_scene" });
    const service = new AiConfigService({
      configRepository: {
        getSceneRouteById: async () => persisted,
        getModelById: async (id) => model({ id }),
        updateSceneRoute: async (_id, input) => ({ ...persisted, ...input }),
      },
      systemSceneRepository: { getByCode: async () => scene({
        code: "legacy_scene", name: "历史场景", source: "legacy", allow_new_configuration: false,
      }) },
    });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, name: "历史场景新名称",
    })).resolves.toMatchObject({ name: "历史场景新名称", scene_code: "legacy_scene" });
    await expect(service.updateSceneRoute(authContext(), persisted.id, {
      expected_version: 2, scene_code: "decoration_qa",
    })).rejects.toMatchObject({ statusCode: 400, code: "AI_SCENE_ROUTE_IDENTITY_IMMUTABLE" });
  });

  test("preserves an inactive fast route when a parsed PATCH only renames it", async () => {
    const persisted = {
      ...route({ primary_model_id: null, fallback_model_id: null }),
      quality_tier: "fast" as const,
      status: "inactive" as const,
    };
    let written: unknown;
    const service = new AiConfigService({
      configRepository: {
        getSceneRouteById: async () => persisted,
        updateSceneRoute: async (_id, input) => {
          written = input;
          return { ...persisted, ...input };
        },
      },
      systemSceneRepository: { getByCode: async () => scene() },
    });
    const parsedPatch = UpdateAiSceneRoutePayloadSchema.parse({
      expected_version: 2,
      name: "新名称",
    });

    await expect(service.updateSceneRoute(authContext(), persisted.id, parsedPatch))
      .resolves.toMatchObject({ quality_tier: "fast", status: "inactive" });
    expect(written).toEqual({ expected_version: 2, name: "新名称" });
  });
});
