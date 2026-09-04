import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PROVIDER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const ENTRY_ID = "44444444-4444-4444-8444-444444444444";
const MODEL_ID = "55555555-5555-4555-8555-555555555555";

function auth(permissions: string[] = ["platform.ai_config.manage"]): AuthContext {
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
    permissions: permissions.map((code) => ({ code, scope: "all" as const })),
  };
}

describe("OpenRouterModelSyncService", () => {
  test("fetches the OpenRouter model catalog, saves a preview run and never returns the API key", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const repository = {
      getProvider: mock(async () => ({
        id: PROVIDER_ID,
        provider_type: "openrouter",
        status: "active",
        endpoint_url: "https://openrouter.ai/api/v1",
        api_key_setting_key: "OPENROUTER_API_KEY",
      })),
      listCatalogManagedModels: mock(async () => []),
      saveOpenRouterCatalogPreview: mock(async (input: unknown) => ({
        run_id: RUN_ID,
        model_count: 1,
        catalog_hash: "a".repeat(64),
        input,
      })),
      applyOpenRouterCatalog: mock(async () => ({ run_id: RUN_ID, applied_count: 1 })),
      saveCapabilityOverride: mock(async () => ({ model_id: MODEL_ID, version: 4 })),
      getOpenRouterUsageSummary: mock(async () => ({ requests_24h: 0, estimated_cost_usd_24h: 0 })),
    };
    const settings = {
      getSecretString: mock(async () => "secret-openrouter-key"),
      getString: mock(async (_key: string, fallback: string) => fallback),
    };
    const fetchImpl = mock(async (url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: "openai/gpt-4o-mini", name: "GPT-4o mini", context_length: 128000, pricing: { prompt: "0.1", completion: "0.2", request: "-1" } }],
        links: {},
        total_count: 1,
      }),
      url,
      init,
    }));
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: settings as never,
      fetchImpl: fetchImpl as never,
    });

    const result = await service.createPreview(auth(), { provider_id: PROVIDER_ID });

    expect(result.run_id).toBe(RUN_ID);
    expect(JSON.stringify(result)).not.toContain("secret-openrouter-key");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer secret-openrouter-key" }),
      }),
    );
    expect(repository.saveOpenRouterCatalogPreview).toHaveBeenCalledWith(expect.objectContaining({
      providerId: PROVIDER_ID,
      requestedByEmployeeId: EMPLOYEE_ID,
      sourceEndpoint: "https://openrouter.ai/api/v1/models",
      entries: [expect.objectContaining({
        external_model_id: "openai/gpt-4o-mini",
        model_code: "openrouter.openai_gpt_4o_mini",
        model_name: "GPT-4o mini",
        modality: "text",
        input_modalities: ["text"],
        change_type: "new",
        capability_payload: {
          modality: "text",
          max_context_tokens: expect.any(Number),
          supports_json_object: expect.any(Boolean),
          supports_streaming: expect.any(Boolean),
        },
        raw_price_projection: { prompt: "0.1", completion: "0.2" },
      })],
      summaryPayload: { total: 1, new: 1, changed: 0, unchanged: 0, removed: 0 },
    }));
    expect(JSON.stringify(repository.saveOpenRouterCatalogPreview.mock.calls[0]?.[0])).not.toContain("total_count");
  });

  test("rejects invalid or inactive OpenRouter providers before fetch and caps apply entry IDs at 100", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const repository = {
      getProvider: mock(async () => ({ id: PROVIDER_ID, provider_type: "openai_compatible" })),
      listCatalogManagedModels: mock(async () => []),
      saveOpenRouterCatalogPreview: mock(async () => null),
      applyOpenRouterCatalog: mock(async () => ({ run_id: RUN_ID, applied_count: 1 })),
      saveCapabilityOverride: mock(async () => ({ model_id: MODEL_ID, version: 4 })),
      getOpenRouterUsageSummary: mock(async () => ({ requests_24h: 0, estimated_cost_usd_24h: 0 })),
    };
    const fetchImpl = mock(async () => ({ ok: true, json: async () => ({}) }));
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: { getSecretString: mock(async () => "key"), getString: mock(async (_key: string, fallback: string) => fallback) } as never,
      fetchImpl: fetchImpl as never,
    });

    await expect(service.createPreview(auth(), { provider_id: PROVIDER_ID }))
      .rejects.toMatchObject({ statusCode: 400, code: "AI_OPENROUTER_PROVIDER_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();

    repository.getProvider = mock(async () => ({ id: PROVIDER_ID, provider_type: "openrouter", status: "inactive" }));
    await expect(service.createPreview(auth(), { provider_id: PROVIDER_ID }))
      .rejects.toMatchObject({ statusCode: 400, code: "AI_OPENROUTER_PROVIDER_INVALID" });
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(service.applyCatalog(auth(), {
      run_id: RUN_ID,
      entry_ids: Array.from({ length: 101 }, () => ENTRY_ID),
      expected_catalog_hash: "a".repeat(64),
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("reads credits as numbers only and saves capability through RPC", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const repository = {
      getProvider: mock(async () => ({
        id: PROVIDER_ID,
        provider_type: "openrouter",
        status: "active",
        endpoint_url: "https://openrouter.ai/api/v1",
        api_key_setting_key: "OPENROUTER_API_KEY",
      })),
      listCatalogManagedModels: mock(async () => []),
      saveOpenRouterCatalogPreview: mock(async () => null),
      applyOpenRouterCatalog: mock(async () => ({ run_id: RUN_ID, applied_count: 1 })),
      saveCapabilityOverride: mock(async () => ({ model_id: MODEL_ID, version: 4, probe_status: "eligible" })),
      getOpenRouterUsageSummary: mock(async () => ({ requests_24h: 3, estimated_cost_usd_24h: 1.25 })),
    };
    const settings = {
      getSecretString: mock(async () => "secret-openrouter-key"),
      getString: mock(async (_key: string, fallback: string) => fallback),
    };
    const fetchImpl = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { total_credits: "100.5", total_usage: "25.25" } }),
    }));
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: settings as never,
      fetchImpl: fetchImpl as never,
    });

    await expect(service.getCredits(auth(["platform.ai_config.read"]), { provider_id: PROVIDER_ID }))
      .resolves.toEqual({ total_credits: 100.5, total_usage: 25.25 });
    await expect(service.saveCapability(auth(), MODEL_ID, {
      expected_version: 3,
      capability_payload: {
        modality: "text",
        max_context_tokens: 128000,
        supports_json_object: true,
        supports_streaming: true,
      },
      probe_status: "eligible",
      probe_at: "2026-09-01T00:00:00.000Z",
    })).resolves.toMatchObject({ model_id: MODEL_ID, version: 4 });
  });

  test("diffs OpenRouter catalog against current managed models without sending raw upstream envelope", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const repository = {
      getProvider: mock(async () => ({
        id: PROVIDER_ID,
        provider_type: "openrouter",
        status: "active",
        api_key_setting_key: "OPENROUTER_API_KEY",
      })),
      listCatalogManagedModels: mock(async () => [{
        id: MODEL_ID,
        provider_id: PROVIDER_ID,
        code: "openrouter.openai_gpt_4o_mini",
        name: "GPT-4o mini",
        model_name: "openai/gpt-4o-mini",
        modality: "text",
        input_modalities: ["text"],
        capability_payload: {
          modality: "text",
          max_context_tokens: 128000,
          supports_json_object: true,
          supports_streaming: true,
        },
        price_snapshot: {
          raw_price_projection: { prompt: "0.1", completion: "0.2" },
        },
        version: 7,
        status: "active",
        sort_order: 0,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      }, {
        id: "77777777-7777-4777-8777-777777777777",
        provider_id: PROVIDER_ID,
        code: "openrouter.removed_model",
        name: "Removed model",
        model_name: "vendor/removed",
        modality: "text",
        input_modalities: ["text"],
        capability_payload: {
          modality: "text",
          max_context_tokens: 4096,
          supports_json_object: false,
          supports_streaming: false,
        },
        price_snapshot: { raw_price_projection: { prompt: "1" } },
        version: 2,
        status: "active",
        sort_order: 0,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      }]),
      saveOpenRouterCatalogPreview: mock(async (input: unknown) => ({ run_id: RUN_ID, input })),
      applyOpenRouterCatalog: mock(async () => ({ run_id: RUN_ID, applied_count: 1 })),
      saveCapabilityOverride: mock(async () => ({ model_id: MODEL_ID, version: 4 })),
      getOpenRouterUsageSummary: mock(async () => ({ requests_24h: 0, estimated_cost_usd_24h: 0 })),
    }; const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: {
        getSecretString: mock(async () => "secret-openrouter-key"),
        getString: mock(async (_key: string, fallback: string) => fallback),
      } as never,
      fetchImpl: mock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: "openai/gpt-4o-mini", name: "GPT-4o mini", context_length: 128000, pricing: { prompt: "0.1", completion: "0.2" }, supported_parameters: ["response_format", "stream"] },
            { id: "openai/gpt-4o", name: "GPT-4o", context_length: 128000, pricing: { prompt: "0.2", completion: "0.4" }, supported_parameters: ["stream"] },
          ],
          links: {},
          total_count: 2,
        }),
      })) as never,
    });

    await service.createPreview(auth(), { provider_id: PROVIDER_ID });

    const input = repository.saveOpenRouterCatalogPreview.mock.calls[0]?.[0] as {
      entries: Array<Record<string, unknown>>;
      summaryPayload: Record<string, unknown>;
    };
    expect(input.summaryPayload).toEqual({ total: 3, new: 1, changed: 0, unchanged: 1, removed: 1 });
    expect(input.entries.map((entry) => entry.change_type).sort()).toEqual(["new", "removed", "unchanged"]);
    for (const entry of input.entries) {
      expect(Object.keys(entry).sort()).toEqual([
        "apply_block_code", "apply_status",
        "capability_payload",
        "catalog_hash",
        "change_type",
        "external_model_id",
        "input_modalities",
        "modality",
        "model_code",
        "model_name",
        "raw_price_projection",
      ].sort());
    }
  });

  test("uses catalog capability candidates and does not invent video or speech prices", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const currentCapability = {
      modality: "text" as const,
      max_context_tokens: 8192,
      supports_json_object: false,
      supports_streaming: false,
    };
    const repository = {
      getProvider: mock(async () => ({
        id: PROVIDER_ID,
        provider_type: "openrouter",
        status: "active",
        api_key_setting_key: "OPENROUTER_API_KEY",
      })),
      listCatalogManagedModels: mock(async () => [{
        id: MODEL_ID,
        provider_id: PROVIDER_ID,
        code: "openrouter.openai_gpt_4o_mini",
        name: "GPT-4o mini",
        model_name: "openai/gpt-4o-mini",
        modality: "text",
        input_modalities: ["text"],
        capability_payload: currentCapability,
        probe_status: "eligible",
        price_snapshot: {
          raw_price_projection: {
            prompt: "0.1",
            completion: "0.2",
            image: "0.3",
          },
        },
        version: 7,
        status: "active",
        sort_order: 0,
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
      }]),
      saveOpenRouterCatalogPreview: mock(async (input: unknown) => ({ run_id: RUN_ID, input })),
      applyOpenRouterCatalog: mock(async () => ({ run_id: RUN_ID, applied_count: 1 })),
      saveCapabilityOverride: mock(async () => ({ model_id: MODEL_ID, version: 4 })),
      getOpenRouterUsageSummary: mock(async () => ({ requests_24h: 0, estimated_cost_usd_24h: 0 })),
    };
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: {
        getSecretString: mock(async () => "secret-openrouter-key"),
        getString: mock(async (_key: string, fallback: string) => fallback),
      } as never,
      fetchImpl: mock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{
            id: "openai/gpt-4o-mini",
            name: "GPT-4o mini",
            context_length: 128000,
            architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
            pricing: {
              prompt: "0.1",
              completion: "0.2",
              image: "0.3",
              input_audio: "0.4",
              output_audio: "0.5",
            },
            supported_parameters: ["response_format", "stream"],
          }],
          links: {},
          total_count: 1,
        }),
      })) as never,
    });

    await service.createPreview(auth(), { provider_id: PROVIDER_ID });

    const input = repository.saveOpenRouterCatalogPreview.mock.calls[0]?.[0] as {
      entries: Array<{
        change_type: string;
        capability_payload: unknown;
        raw_price_projection: Record<string, unknown>;
      }>;
    };
    expect(input.entries).toHaveLength(1);
    expect(input.entries[0]?.change_type).toBe("changed");
    expect(input.entries[0]?.capability_payload).toEqual({ modality: "text", max_context_tokens: 128000, supports_json_object: true, supports_streaming: true });
    expect(input.entries[0]?.raw_price_projection).toEqual({
      prompt: "0.1",
      completion: "0.2",
      image: "0.3",
    });
  });

  test("ignores existing non-text catalog models while building text catalog preview", async () => {
    const { OpenRouterModelSyncService } = await import("./openrouter-model-sync");
    const imageCapability = {
      modality: "image" as const,
      max_prompt_tokens: 4000,
      output_formats: ["png"],
    };
    const repository = {
      getProvider: mock(async () => ({
        id: PROVIDER_ID,
        provider_type: "openrouter",
        status: "active",
        api_key_setting_key: "OPENROUTER_API_KEY",
      })),
      listCatalogManagedModels: mock(async () => [
        {
          id: "77777777-7777-4777-8777-777777777777",
          provider_id: PROVIDER_ID,
          code: "openrouter.image_model",
          name: "Image Model",
          model_name: "openrouter/image-model",
          modality: "image",
          input_modalities: ["text", "image"],
          capability_payload: imageCapability,
          probe_status: "eligible",
          price_snapshot: { raw_price_projection: { image: "0.5" } },
          version: 7,
          status: "active",
          sort_order: 0,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
        {
          id: "88888888-8888-4888-8888-888888888888",
          provider_id: PROVIDER_ID,
          code: "openrouter.hybrid_image",
          name: "Hybrid Image",
          model_name: "openrouter/hybrid-model",
          modality: "image",
          input_modalities: ["text", "image"],
          capability_payload: imageCapability,
          probe_status: "eligible",
          price_snapshot: { raw_price_projection: { image: "0.5" } },
          version: 7,
          status: "active",
          sort_order: 0,
          created_at: "2026-09-01T00:00:00.000Z",
          updated_at: "2026-09-01T00:00:00.000Z",
        },
      ]),
      saveOpenRouterCatalogPreview: mock(async (input: unknown) => ({ run_id: RUN_ID, input })),
      applyOpenRouterCatalog: mock(async () => ({ run_id: RUN_ID, applied_count: 1 })),
      saveCapabilityOverride: mock(async () => ({ model_id: MODEL_ID, version: 4 })),
      getOpenRouterUsageSummary: mock(async () => ({ requests_24h: 0, estimated_cost_usd_24h: 0 })),
    };
    const service = new OpenRouterModelSyncService({
      repository: repository as never,
      settings: {
        getSecretString: mock(async () => "secret-openrouter-key"),
        getString: mock(async (_key: string, fallback: string) => fallback),
      } as never,
      fetchImpl: mock(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: "openrouter/image-model",
              name: "Image Model",
              architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
              pricing: { image: "0.5" },
            },
            {
              id: "openrouter/hybrid-model",
              name: "Hybrid Model",
              architecture: { input_modalities: ["text", "image"], output_modalities: ["text", "image"] },
              pricing: { image: "0.5" },
            },
            {
              id: "openrouter/text-model",
              name: "Text Model",
              architecture: { input_modalities: ["text"], output_modalities: ["text"] },
              pricing: { prompt: "0.1", completion: "0.2" },
            },
          ],
          links: {},
          total_count: 3,
        }),
      })) as never,
    });

    await service.createPreview(auth(), { provider_id: PROVIDER_ID });

    const input = repository.saveOpenRouterCatalogPreview.mock.calls[0]?.[0] as {
      entries: Array<{
        external_model_id: string;
        modality: string;
        capability_payload: { modality?: string };
        change_type: string;
      }>;
    };
    expect(input.entries.map((entry) => entry.external_model_id)).toEqual([
      "openrouter/text-model",
    ]);
    expect(input.entries[0]).toMatchObject({
      modality: "text",
      capability_payload: { modality: "text" },
      change_type: "new",
    });
  });
});
