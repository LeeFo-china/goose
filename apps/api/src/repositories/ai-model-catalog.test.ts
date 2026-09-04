import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PROVIDER_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const ENTRY_ID = "33333333-3333-4333-8333-333333333333";
const MODEL_ID = "44444444-4444-4444-8444-444444444444";

function tableResponse(data: unknown, count = 1) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const response = { data, error: null, count };
  const builder = {
    select: (...args: unknown[]) => { calls.push({ method: "select", args }); return builder; },
    eq: (...args: unknown[]) => { calls.push({ method: "eq", args }); return builder; },
    ilike: (...args: unknown[]) => { calls.push({ method: "ilike", args }); return builder; },
    or: (...args: unknown[]) => { calls.push({ method: "or", args }); return builder; },
    order: (...args: unknown[]) => { calls.push({ method: "order", args }); return builder; },
    range: (...args: unknown[]) => { calls.push({ method: "range", args }); return builder; },
    limit: (...args: unknown[]) => { calls.push({ method: "limit", args }); return builder; },
    maybeSingle: async () => ({ data: Array.isArray(data) ? data[0] ?? null : data, error: null }),
    then: Promise.resolve(response).then.bind(Promise.resolve(response)),
    calls,
  };
  return builder;
}

describe("AiModelCatalogRepository", () => {
  test("lists models with exact pagination, bounded range and necessary fields", async () => {
    const { AiModelCatalogRepository } = await import("./ai-model-catalog");
    const builders: Record<string, ReturnType<typeof tableResponse>> = {};
    const client = {
      from(table: string) {
        builders[table] = tableResponse([
          {
            id: MODEL_ID,
            provider_id: PROVIDER_ID,
            code: "openrouter.text",
            name: "OpenRouter Text",
            model_name: "openai/gpt-4o-mini",
            status: "active",
            modality: "text",
            input_modalities: ["text"],
            probe_status: "eligible",
            version: 3,
            sort_order: 0,
            created_at: "2026-09-01T00:00:00.000Z",
            updated_at: "2026-09-01T00:00:00.000Z",
            provider: { id: PROVIDER_ID, code: "openrouter", name: "OpenRouter", provider_type: "openrouter" },
            price_snapshot: { id: "price", prompt_price_usd: "0.000001", completion_price_usd: "0.000002" },
          },
        ]);
        return builders[table];
      },
      rpc: async () => ({ data: null, error: null }),
    };

    const result = await new AiModelCatalogRepository(client as never).listModels({
      page: 2,
      pageSize: 20,
      modality: "text",
      status: "active",
      keyword: "gpt",
    });

    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 1, totalPages: 1 });
    expect(result.list[0]?.model_name).toBe("openai/gpt-4o-mini");
    const calls = builders.ai_models!.calls;
    expect(calls.find((call) => call.method === "select")?.args).toEqual([
      expect.stringContaining("current_price_snapshot_id"),
      { count: "exact" },
    ]);
    expect(calls.find((call) => call.method === "select")?.args[0]).toEqual(
      expect.stringContaining("prompt_price_usd"),
    );
    expect(calls.find((call) => call.method === "select")?.args[0]).not.toEqual(
      expect.stringContaining("input_price_usd"),
    );
    expect(calls.find((call) => call.method === "select")?.args[0]).not.toEqual(
      expect.stringContaining("capability_payload"),
    );
    expect(calls.find((call) => call.method === "select")?.args[0]).not.toBe("*");
    expect(calls).toContainEqual({ method: "eq", args: ["modality", "text"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(calls).toContainEqual({ method: "range", args: [20, 39] });
  });

  test("loads catalog-managed models with private capability fields only for server-side diff", async () => {
    const { AiModelCatalogRepository } = await import("./ai-model-catalog");
    const builders: Record<string, ReturnType<typeof tableResponse>> = {};
    const client = {
      from(table: string) {
        builders[table] = tableResponse([]);
        return builders[table];
      },
      rpc: async () => ({ data: null, error: null }),
    };

    await new AiModelCatalogRepository(client as never).listCatalogManagedModels(PROVIDER_ID);

    const calls = builders.ai_models!.calls;
    expect(calls.find((call) => call.method === "select")?.args[0]).toEqual(
      expect.stringContaining("capability_payload"),
    );
    expect(calls).toContainEqual({ method: "eq", args: ["catalog_managed", true] });
    expect(calls).toContainEqual({ method: "limit", args: [10000] });
  });

  test("uses service-role RPCs for preview, apply and capability override with strict envelopes", async () => {
    const { AiModelCatalogRepository } = await import("./ai-model-catalog");
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
      from: () => tableResponse({ id: PROVIDER_ID, provider_type: "openrouter", api_key_setting_key: "OPENROUTER_API_KEY" }),
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === "save_openrouter_model_catalog_preview") {
          return { data: { data: { run_id: RUN_ID, model_count: 1, catalog_hash: "a".repeat(64) } }, error: null };
        }
        if (name === "apply_openrouter_model_catalog") {
          return { data: { data: { run_id: RUN_ID, applied_count: 1 } }, error: null };
        }
        return { data: { data: { model_id: MODEL_ID, version: 4, probe_status: "eligible" } }, error: null };
      },
    };
    const repository = new AiModelCatalogRepository(client as never);

    await expect(repository.saveOpenRouterCatalogPreview({
      providerId: PROVIDER_ID,
      sourceEndpoint: "https://openrouter.ai/api/v1/models",
      catalogHash: "a".repeat(64),
      requestedByEmployeeId: "55555555-5555-4555-8555-555555555555",
      entries: [{
        external_model_id: "openai/gpt-4o-mini",
        model_code: "openrouter.openai_gpt_4o_mini",
        model_name: "GPT-4o mini",
        modality: "text",
        input_modalities: ["text"],
        capability_payload: {
          modality: "text",
          max_context_tokens: 128000,
          supports_json_object: true,
          supports_streaming: true,
        },
        raw_price_projection: { prompt: "0.1", completion: "0.2" },
        catalog_hash: "a".repeat(64),
        change_type: "new",
      }],
      summaryPayload: { total: 1, new: 1, changed: 0, unchanged: 0, removed: 0 },
    })).resolves.toMatchObject({ run_id: RUN_ID });
    await expect(repository.applyOpenRouterCatalog({
      runId: RUN_ID,
      entryIds: [ENTRY_ID],
      expectedCatalogHash: "a".repeat(64),
    })).resolves.toMatchObject({ applied_count: 1 });
    await expect(repository.saveCapabilityOverride({
      modelId: MODEL_ID,
      expectedVersion: 3,
      capabilityPayload: {
        modality: "text",
        max_context_tokens: 128000,
        supports_json_object: true,
        supports_streaming: true,
      },
      probeStatus: "eligible",
      probeAt: "2026-09-01T00:00:00.000Z",
    })).resolves.toMatchObject({ version: 4 });

    expect(calls[0]).toEqual({
      name: "save_openrouter_model_catalog_preview",
      args: {
        p_provider_id: PROVIDER_ID,
        p_catalog_hash: "a".repeat(64),
        p_source_endpoint: "https://openrouter.ai/api/v1/models",
        p_entries: expect.arrayContaining([expect.objectContaining({
          external_model_id: "openai/gpt-4o-mini",
          change_type: "new",
        })]),
        p_created_by_employee_id: "55555555-5555-4555-8555-555555555555",
        p_summary_payload: { total: 1, new: 1, changed: 0, unchanged: 0, removed: 0 },
      },
    });
    expect(calls.map((call) => call.name)).toEqual([
      "save_openrouter_model_catalog_preview",
      "apply_openrouter_model_catalog",
      "save_ai_model_capability_override",
    ]);
  });

  test("filters catalog runs by provider when a provider is selected", async () => {
    const { AiModelCatalogRepository } = await import("./ai-model-catalog");
    const builders: Record<string, ReturnType<typeof tableResponse>> = {};
    const client = {
      from(table: string) {
        builders[table] = tableResponse([]);
        return builders[table];
      },
      rpc: async () => ({ data: null, error: null }),
    };

    await new AiModelCatalogRepository(client as never).listCatalogRuns({
      page: 1,
      pageSize: 20,
      provider_id: PROVIDER_ID,
    });

    expect(builders.ai_model_catalog_sync_runs!.calls).toContainEqual({
      method: "eq",
      args: ["provider_id", PROVIDER_ID],
    });
  });

  test("filters catalog entries before pagination with bounded selected fields", async () => {
    const { AiModelCatalogRepository } = await import("./ai-model-catalog");
    const builders: Record<string, ReturnType<typeof tableResponse>> = {};
    const client = {
      from(table: string) {
        builders[table] = tableResponse([
          {
            id: ENTRY_ID,
            run_id: RUN_ID,
            entry_position: 21,
            external_model_id: "anthropic/claude-3.5-sonnet",
            model_name: "Claude 3.5 Sonnet",
            modality: "image",
            change_type: "new",
            apply_status: "blocked",
            apply_block_code: "MODEL_CODE_CONFLICT",
          },
        ]);
        return builders[table];
      },
      rpc: async () => ({ data: null, error: null }),
    };

    const result = await new AiModelCatalogRepository(client).listCatalogEntries(RUN_ID, {
      page: 2,
      pageSize: 20,
      keyword: " claude\\%_,() ",
      modality: "image",
      changeType: "new",
    });

    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 1, totalPages: 1 });
    expect(result.list[0]?.external_model_id).toBe("anthropic/claude-3.5-sonnet");
    const catalogEntriesBuilder = builders.ai_model_catalog_entries;
    expect(catalogEntriesBuilder).toBeDefined();
    if (!catalogEntriesBuilder) throw new Error("missing catalog entries query builder");
    const calls = catalogEntriesBuilder.calls;
    const select = calls.find((call) => call.method === "select")?.args[0];
    expect(select).toEqual(expect.stringContaining("apply_status"));
    expect(select).toEqual(expect.stringContaining("apply_block_code"));
    expect(select).not.toEqual(expect.stringContaining("capability_payload"));
    expect(calls.map((call) => call.method)).toEqual([
      "select",
      "eq",
      "eq",
      "eq",
      "or",
      "order",
      "range",
    ]);
    expect(calls).toContainEqual({ method: "eq", args: ["run_id", RUN_ID] });
    expect(calls).toContainEqual({ method: "eq", args: ["modality", "image"] });
    expect(calls).toContainEqual({ method: "eq", args: ["change_type", "new"] });
    expect(calls).toContainEqual({
      method: "or",
      args: ["model_name.ilike.%claude\\\\\\%\\_\\,\\(\\)%,external_model_id.ilike.%claude\\\\\\%\\_\\,\\(\\)%"],
    });
    expect(calls.at(-1)).toEqual({ method: "range", args: [20, 39] });
  });

  test("maps RPC business error envelopes without leaking raw database details", async () => {
    const { AiModelCatalogRepository } = await import("./ai-model-catalog");
    const client = {
      from: () => tableResponse(null),
      rpc: async () => ({
        data: {
          error: {
            status_code: 409,
            code: "AI_MODEL_CATALOG_STALE",
            message: "目录已过期",
            detail: "raw database detail",
          },
        },
        error: null,
      }),
    };
    const repository = new AiModelCatalogRepository(client as never);

    await expect(repository.applyOpenRouterCatalog({
      runId: RUN_ID,
      entryIds: [ENTRY_ID],
      expectedCatalogHash: "a".repeat(64),
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "AI_MODEL_CATALOG_STALE",
      message: "目录已过期",
      details: undefined,
    });
  });
});
