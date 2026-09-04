import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PROVIDER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

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

function createRepository(currentModels: unknown[] = []) {
  return {
    getProvider: mock(async () => ({
      id: PROVIDER_ID,
      provider_type: "openrouter",
      status: "active",
      endpoint_url: "https://catalog.test/api/v1/",
      api_key_setting_key: "OPENROUTER_API_KEY",
    })),
    listCatalogManagedModels: mock(async () => currentModels),
    saveOpenRouterCatalogPreview: mock(async (input: unknown) => ({ run_id: RUN_ID, input })),
    applyOpenRouterCatalog: mock(async () => ({ run_id: RUN_ID, applied_count: 1 })),
    saveCapabilityOverride: mock(async () => null),
    getOpenRouterUsageSummary: mock(async () => null),
  };
}

function createRepositoryWithEndpoint(endpointUrl: string, currentModels: unknown[] = []) {
  const repository = createRepository(currentModels);
  repository.getProvider = mock(async () => ({
    id: PROVIDER_ID,
    provider_type: "openrouter",
    status: "active",
    endpoint_url: endpointUrl,
    api_key_setting_key: "OPENROUTER_API_KEY",
  }));
  return repository;
}

function createSettings() {
  return {
    getSecretString: mock(async () => "secret-openrouter-key"),
    getString: mock(async (_key: string, fallback: string) => fallback),
  };
}

function createFetch(payloads: Record<string, unknown>, failingPath?: string) {
  return mock(async (url: string) => {
    const parsedUrl = new URL(url);
    const pathAndSearch = `${parsedUrl.pathname}${parsedUrl.search}`;
    if (pathAndSearch === failingPath) {
      return { ok: false, status: 502, json: async () => ({ error: "upstream unavailable" }) };
    }
    if (!(pathAndSearch in payloads)) {
      return { ok: false, status: 404, json: async () => ({ error: "unexpected endpoint" }) };
    }
    return { ok: true, status: 200, json: async () => payloads[pathAndSearch] };
  });
}

function textPayload(data: unknown[]) {
  return { data, links: {}, total_count: data.length };
}

function imageModel(id: string) {
  return {
    id,
    name: "Shared Image",
    architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
    supported_parameters: {
      input_references: { type: "integer", min: 0, max: 1 },
      n: { type: "integer", min: 1, max: 1 },
      resolution: { type: "enum", values: ["1024x1024"] },
    },
  };
}

function videoModel(id: string) {
  return {
    id,
    name: "Video Model",
    generate_audio: true,
    supported_aspect_ratios: ["16:9"],
    supported_durations: [5],
    pricing_skus: { "per-video-second": "0.05" },
  };
}

function catalogPayloads() {
  return {
    "/api/v1/models": textPayload([{
      id: "openrouter/shared",
      name: "Shared Text",
      context_length: 128000,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: { prompt: "0.1", completion: "0.2" },
      supported_parameters: ["response_format", "stream"],
    }]),
    "/api/v1/images/models": { data: [imageModel("openrouter/shared")] },
    "/api/v1/videos/models": { data: [videoModel("openrouter/video")] },
    "/api/v1/models?output_modalities=speech": textPayload([{
      id: "openrouter/speech",
      name: "Speech Model",
      architecture: { output_modalities: ["speech"] },
      pricing: { output_audio: "0.2" },
      supported_voices: ["alloy"],
    }]),
  };
}

describe("OpenRouter multimodal catalog sync", () => {
  test("derives catalog endpoints from chat completions provider URL", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const repository = createRepositoryWithEndpoint("https://openrouter.ai/api/v1/chat/completions");
    const fetchImpl = createFetch(catalogPayloads());
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: createSettings() as never,
      fetchImpl: fetchImpl as never,
    });

    await service.createPreview(auth(), { provider_id: PROVIDER_ID });

    expect(fetchImpl.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://openrouter.ai/api/v1/models",
      "https://openrouter.ai/api/v1/images/models",
      "https://openrouter.ai/api/v1/videos/models",
      "https://openrouter.ai/api/v1/models?output_modalities=speech",
    ]);
  });

  test("fetches four endpoints atomically and saves modality-scoped entries in deterministic order", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const currentTextCapability = {
      modality: "text",
      max_context_tokens: 128000,
      supports_json_object: true,
      supports_streaming: true,
    };
    const currentImageCapability = {
      modality: "image",
      supported_sizes: ["1024x1024"],
      supports_reference_image: true,
      max_images_per_request: 1,
    };
    const repository = createRepository([{
      code: "openrouter.openrouter_shared",
      name: "Shared Text",
      model_name: "openrouter/shared",
      modality: "text",
      input_modalities: ["text"],
      capability_payload: currentTextCapability,
      price_snapshot: { raw_price_projection: { prompt: "0.1", completion: "0.2" } },
    }, {
      code: "openrouter.image.openrouter_shared",
      name: "Shared Image",
      model_name: "openrouter/shared",
      modality: "image",
      input_modalities: ["text", "image"],
      capability_payload: currentImageCapability,
      price_snapshot: { raw_price_projection: {} },
    }]);
    const fetchImpl = createFetch(catalogPayloads());
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: createSettings() as never,
      fetchImpl: fetchImpl as never,
    });

    await service.createPreview(auth(), { provider_id: PROVIDER_ID });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.map((call) => new URL(String(call[0])).pathname + new URL(String(call[0])).search)).toEqual([
      "/api/v1/models",
      "/api/v1/images/models",
      "/api/v1/videos/models",
      "/api/v1/models?output_modalities=speech",
    ]);
    const saved = repository.saveOpenRouterCatalogPreview.mock.calls[0]?.[0] as {
      sourceEndpoint: string;
      entries: Array<{
        external_model_id: string;
        modality: string;
        change_type: string;
      }>;
      summaryPayload: Record<string, unknown>;
    };
    expect(saved.entries.map((entry) => [entry.external_model_id, entry.modality])).toEqual([
      ["openrouter/shared", "text"],
      ["openrouter/shared", "image"],
      ["openrouter/video", "video"],
      ["openrouter/speech", "speech"],
    ]);
    expect(saved.entries.map((entry) => entry.change_type)).toEqual([
      "unchanged",
      "unchanged",
      "new",
      "new",
    ]);
    expect(saved.summaryPayload).toMatchObject({
      total: 4,
      new: 2,
      changed: 0,
      unchanged: 2,
      removed: 0,
      source_endpoints: [
        "https://catalog.test/api/v1/models",
        "https://catalog.test/api/v1/images/models",
        "https://catalog.test/api/v1/videos/models",
        "https://catalog.test/api/v1/models?output_modalities=speech",
      ],
      modality_counts: { text: 1, image: 1, video: 1, speech: 1 },
    });
    expect(saved.sourceEndpoint.length).toBeLessThanOrEqual(2048);
    expect(JSON.stringify(saved)).not.toContain("secret-openrouter-key");
  });

  test("does not save a preview run when any endpoint fails or has an invalid contract", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const failingRepository = createRepository();
    const failingService = new OpenRouterModelSyncService({
      repository: failingRepository as never,
      settings: createSettings() as never,
      fetchImpl: createFetch(catalogPayloads(), "/api/v1/videos/models") as never,
    });

    await expect(failingService.createPreview(auth(), { provider_id: PROVIDER_ID }))
      .rejects.toMatchObject({ statusCode: 502, code: "AI_OPENROUTER_CATALOG_FAILED" });
    expect(failingRepository.saveOpenRouterCatalogPreview).not.toHaveBeenCalled();

    const invalidRepository = createRepository();
    const invalidPayloads = {
      ...catalogPayloads(),
      "/api/v1/images/models": { data: [{ id: "openrouter/image", unexpected: true }] },
    };
    const invalidService = new OpenRouterModelSyncService({
      repository: invalidRepository as never,
      settings: createSettings() as never,
      fetchImpl: createFetch(invalidPayloads) as never,
    });

    await expect(invalidService.createPreview(auth(), { provider_id: PROVIDER_ID }))
      .rejects.toMatchObject({ statusCode: 502, code: "AI_OPENROUTER_CATALOG_INVALID" });
    expect(invalidRepository.saveOpenRouterCatalogPreview).not.toHaveBeenCalled();
  });

  test("rejects combined catalogs over 10000 entries before repository write", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const repository = createRepository();
    const payloads = {
      "/api/v1/models": textPayload(Array.from({ length: 2501 }, (_, index) => ({
        id: `openrouter/text-${index}`,
        name: `Text ${index}`,
        context_length: 4096,
        architecture: { output_modalities: ["text"] },
        supported_parameters: ["stream"],
      }))),
      "/api/v1/images/models": { data: Array.from({ length: 2501 }, (_, index) => imageModel(`openrouter/image-${index}`)) },
      "/api/v1/videos/models": { data: Array.from({ length: 2501 }, (_, index) => videoModel(`openrouter/video-${index}`)) },
      "/api/v1/models?output_modalities=speech": textPayload(Array.from({ length: 2501 }, (_, index) => ({
        id: `openrouter/speech-${index}`,
        name: `Speech ${index}`,
        architecture: { output_modalities: ["speech"] },
        supported_voices: ["alloy"],
      }))),
    };
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: createSettings() as never,
      fetchImpl: createFetch(payloads) as never,
    });

    await expect(service.createPreview(auth(), { provider_id: PROVIDER_ID }))
      .rejects.toMatchObject({ statusCode: 400, code: "AI_OPENROUTER_CATALOG_TOO_LARGE" });
    expect(repository.saveOpenRouterCatalogPreview).not.toHaveBeenCalled();
  });

  test("deduplicates exact catalog identities before hashing and size checks", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const repository = createRepository();
    const textModels = Array.from({ length: 9999 }, (_, index) => ({
      id: `openrouter/text-${index}`,
      name: `Text ${index}`,
      context_length: 4096,
      architecture: { output_modalities: ["text"] },
      supported_parameters: ["stream"],
    }));
    const firstTextModel = textModels[0];
    if (!firstTextModel) throw new Error("test fixture must include a text model");
    textModels.push(firstTextModel);
    const payloads = {
      "/api/v1/models": textPayload(textModels),
      "/api/v1/images/models": { data: [imageModel("openrouter/image-final")] },
      "/api/v1/videos/models": { data: [] },
      "/api/v1/models?output_modalities=speech": textPayload([]),
    };
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: createSettings() as never,
      fetchImpl: createFetch(payloads) as never,
    });

    await service.createPreview(auth(), { provider_id: PROVIDER_ID });

    const saved = repository.saveOpenRouterCatalogPreview.mock.calls[0]?.[0] as {
      catalogHash: string;
      entries: Array<{ catalog_hash: string }>;
      summaryPayload: Record<string, unknown>;
    };
    expect(saved.entries).toHaveLength(10000);
    expect(saved.entries.every((entry) => entry.catalog_hash === saved.catalogHash)).toBe(true);
    expect(saved.summaryPayload).toMatchObject({ total: 10000 });
  });
});
