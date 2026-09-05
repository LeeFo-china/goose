import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

function updateBuilder(error: unknown) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {
    update: (...args: unknown[]) => { calls.push({ method: "update", args }); return builder; },
    eq: (...args: unknown[]) => { calls.push({ method: "eq", args }); return builder; },
    select: (...args: unknown[]) => { calls.push({ method: "select", args }); return builder; },
    single: async () => ({ data: null, error }),
    calls,
  };
  return builder;
}

function createProviderBuilder(existingCodes: string[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const inserted: unknown[] = [];
  const selectBuilder = {
    select: (...args: unknown[]) => { calls.push({ method: "select", args }); return selectBuilder; },
    ilike: (...args: unknown[]) => { calls.push({ method: "ilike", args }); return selectBuilder; },
    limit: (...args: unknown[]) => { calls.push({ method: "limit", args }); return selectBuilder; },
    then: (resolve: (value: unknown) => unknown) => resolve({
      data: existingCodes.map((code) => ({ code })),
      error: null,
    }),
  };
  const insertBuilder = {
    select: (...args: unknown[]) => { calls.push({ method: "select", args }); return insertBuilder; },
    single: async () => ({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        ...(inserted[0] as Record<string, unknown>),
        created_at: "2026-09-03T00:00:00.000Z",
        updated_at: "2026-09-03T00:00:00.000Z",
      },
      error: null,
    }),
  };
  const root = {
    select: selectBuilder.select,
    ilike: selectBuilder.ilike,
    limit: selectBuilder.limit,
    then: selectBuilder.then,
    insert: (...args: unknown[]) => { calls.push({ method: "insert", args }); inserted.push(args[0]); return insertBuilder; },
    calls,
    inserted,
  };
  return root;
}

function listBuilder(rows: unknown[], count = rows.length) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const response = { data: rows, error: null, count };
  const builder = {
    select: (...args: unknown[]) => { calls.push({ method: "select", args }); return builder; },
    eq: (...args: unknown[]) => { calls.push({ method: "eq", args }); return builder; },
    or: (...args: unknown[]) => { calls.push({ method: "or", args }); return builder; },
    order: (...args: unknown[]) => { calls.push({ method: "order", args }); return builder; },
    range: (...args: unknown[]) => { calls.push({ method: "range", args }); return builder; },
    maybeSingle: async () => ({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null }),
    single: async () => ({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error: null }),
    then: Promise.resolve(response).then.bind(Promise.resolve(response)),
    calls,
  };
  return builder;
}

describe("AiConfigRepository optimistic version errors", () => {
  test("maps stale version updates to stable 409 without raw database details", async () => {
    const { AiConfigRepository } = await import("./ai-config");
    const builder = updateBuilder({
      code: "PGRST116",
      message: "JSON object requested, multiple (or no) rows returned",
      details: "The result contains 0 rows",
    });
    const repository = new AiConfigRepository({
      from: () => builder,
    } as never);

    await expect(repository.updateModel("11111111-1111-4111-8111-111111111111", {
      expected_version: 3,
      name: "新模型",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "AI_CONFIG_VERSION_STALE",
      details: undefined,
    });
    expect(builder.calls).toContainEqual({ method: "eq", args: ["version", 3] });
  });

  test("generates a unique provider code before inserting a new provider", async () => {
    const { AiConfigRepository } = await import("./ai-config");
    const builder = createProviderBuilder(["openrouter", "openrouter_2"]);
    const repository = new AiConfigRepository({
      from: () => builder,
    } as never);

    const record = await repository.createProvider({
      name: "OpenRouter",
      provider_type: "openrouter",
      endpoint_url: "https://openrouter.ai/api/v1",
      api_key_setting_key: "OPENROUTER_API_KEY",
      status: "active",
      sort_order: 10,
    });

    expect(record.code).toBe("openrouter_3");
    expect(builder.inserted[0]).toEqual(expect.objectContaining({
      code: "openrouter_3",
      name: "OpenRouter",
    }));
    expect(builder.calls).toContainEqual({ method: "select", args: ["code"] });
    expect(builder.calls).toContainEqual({ method: "ilike", args: ["code", "openrouter%"] });
    expect(JSON.stringify(builder.inserted[0])).not.toContain("manual");
  });

  test("lists provider-scoped route models with search before pagination", async () => {
    const { AiConfigRepository } = await import("./ai-config");
    const builder = listBuilder([{
      id: "44444444-4444-4444-8444-444444444444",
      provider_id: "11111111-1111-4111-8111-111111111111",
      code: "openrouter.openai_gpt_4o",
      name: "GPT-4o",
      model_name: "openai/gpt-4o",
      modality: "text",
      status: "active",
      sort_order: 0,
      created_at: "2026-09-05T00:00:00.000Z",
      updated_at: "2026-09-05T00:00:00.000Z",
    }]);
    const repository = new AiConfigRepository({ from: () => builder } as never);

    const result = await repository.listRouteModels("11111111-1111-4111-8111-111111111111", {
      page: 2,
      pageSize: 20,
      keyword: "gpt",
      modality: "text",
      status: "active",
    });

    expect(result.list[0]).toMatchObject({
      source: "internal",
      value: "44444444-4444-4444-8444-444444444444",
      label: "GPT-4o",
      description: "openai/gpt-4o",
    });
    expect(builder.calls).toContainEqual({
      method: "eq",
      args: ["provider_id", "11111111-1111-4111-8111-111111111111"],
    });
    expect(builder.calls).toContainEqual({ method: "eq", args: ["modality", "text"] });
    expect(builder.calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(builder.calls.some((call) => call.method === "or" && String(call.args[0]).includes("gpt"))).toBe(true);
    expect(builder.calls).toContainEqual({ method: "range", args: [20, 39] });
  });
});
