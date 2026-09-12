import { describe, expect, test } from "bun:test";
import { AiModelListQuerySchema, SystemAiSceneListQuerySchema } from "@/schema/ai-config";
import type { AiSceneRecord } from "./ai-system-scenes";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PROVIDER_ID = "11111111-1111-4111-8111-111111111111";
const MODEL_ID = "44444444-4444-4444-8444-444444444444";
const SCENE_CODE = "scene_11111111111141118111111111111111";
const MODEL_SELECT = "id,provider_id,code,name,model_name,modality,input_modalities,catalog_managed,probe_status,status,sort_order,version,created_at,updated_at,provider:ai_providers!ai_models_provider_id_fkey(id,code,name,provider_type,status)";
const SCENE_SELECT = "code,name,modality,required_input_modalities,runtime_status,requirements_source,requires_streaming,min_reference_images,source,allow_new_configuration,status,version,updated_at";
type Call = { method: string; args: unknown[] };

function queryBuilder(data: unknown = [], error: unknown = null, count = 41) {
  const calls: Call[] = [];
  const response = { data, error, count };
  const singleResponse = { data: Array.isArray(data) ? data[0] ?? null : data, error };
  const builder = {
    select: (...args: unknown[]) => { calls.push({ method: "select", args }); return builder; },
    insert: (...args: unknown[]) => { calls.push({ method: "insert", args }); return builder; },
    update: (...args: unknown[]) => { calls.push({ method: "update", args }); return builder; },
    eq: (...args: unknown[]) => { calls.push({ method: "eq", args }); return builder; },
    ilike: (...args: unknown[]) => { calls.push({ method: "ilike", args }); return builder; },
    or: (...args: unknown[]) => { calls.push({ method: "or", args }); return builder; },
    order: (...args: unknown[]) => { calls.push({ method: "order", args }); return builder; },
    range: (...args: unknown[]) => { calls.push({ method: "range", args }); return builder; },
    limit: (...args: unknown[]) => { calls.push({ method: "limit", args }); return builder; },
    maybeSingle: async () => singleResponse,
    single: async () => singleResponse,
    then: Promise.resolve(response).then.bind(Promise.resolve(response)),
    calls,
  };
  return builder;
}

async function configFixture(data: unknown = [], error: unknown = null) {
  const { AiConfigRepository } = await import("./ai-config");
  const builder = queryBuilder(data, error);
  const tables: string[] = [];
  return { builder, tables, repository: new AiConfigRepository({
    from: (table) => { tables.push(table); return builder; },
  }) };
}

async function sceneFixture(data: unknown = [], error: unknown = null) {
  const module = await import("./ai-system-scenes");
  const builder = queryBuilder(data, error);
  const rpcCalls: Call[] = [];
  const tables: string[] = [];
  const repository = new module.AiSystemSceneRepository({
    from: (table: string) => { tables.push(table); return builder; },
    rpc: async (...args: unknown[]) => { rpcCalls.push({ method: "rpc", args }); return { data, error }; },
  } as never);
  return { builder, rpcCalls, tables, repository, module };
}

function expectFiltersBeforeRange(calls: Call[]) {
  const rangeIndex = calls.findIndex((call) => call.method === "range");
  expect(rangeIndex).toBeGreaterThan(0);
  calls.forEach((call, index) => {
    if (["eq", "or"].includes(call.method)) expect(index).toBeLessThan(rangeIndex);
  });
}

const SEARCH_CASES = [
  ["seedream", '"%seedream%"', "%seedream%"],
  ["%", String.raw`"%\\%%"`, String.raw`%\%%`],
  ["_", String.raw`"%\\_%"`, String.raw`%\_%`],
  ["\\", String.raw`"%\\\\%"`, String.raw`%\\%`],
  ['"', String.raw`"%\"%"`, '%"%'],
  [",", '"%,%"', "%,%"],
  [")", '"%)%"', "%)%"],
  ['a%,().:_"\\b', String.raw`"%a\\%,().:\\_\"\\\\b%"`, String.raw`%a\%,().:\_"\\b%`],
] as const;

function expectLiteralSearch(calls: Call[], field: "model_name" | "code", encoded: string, sqlPattern: string) {
  const filter = calls.find((call) => call.method === "or")?.args[0];
  expect(filter).toBe(`name.ilike.${encoded},${field}.ilike.${encoded}`);
  // Model quoted-value decoding only; this is not a real PostgREST integration test.
  const match = String(filter).match(/^name\.ilike\.("(?:\\.|[^"\\])*"),(?:model_name|code)\.ilike\.("(?:\\.|[^"\\])*")$/);
  expect(match).not.toBeNull();
  for (const quoted of match?.slice(1) ?? []) {
    expect(quoted.slice(1, -1).replace(/\\([\s\S])/g, "$1")).toBe(sqlPattern);
  }
  expectFiltersBeforeRange(calls);
}

const model = {
  id: MODEL_ID, provider_id: PROVIDER_ID, code: "mdl_11111111111141118111111111111111",
  name: "Seedream", model_name: "seedream", modality: "image" as const,
  input_modalities: ["text" as const], status: "active" as const, sort_order: 0,
  created_at: "2026-09-12T00:00:00Z", updated_at: "2026-09-12T00:00:00Z",
};
const scene: AiSceneRecord = {
  code: SCENE_CODE, name: "自定义效果图", modality: "image" as const,
  required_input_modalities: ["image"], runtime_status: "not_connected",
  requirements_source: "admin", requires_streaming: false, min_reference_images: 0,
  source: "custom", allow_new_configuration: true, status: "active", version: 1,
  updated_at: "2026-09-12T00:00:00Z",
};
const command = {
  scene_code: SCENE_CODE, name: scene.name, modality: "image" as const,
  quality_tier: "balanced" as const, primary_model_id: MODEL_ID,
  fallback_model_id: null, temperature: null, response_format: null, timeout_ms: 30000,
  status: "active" as const,
};
const route = { ...command, id: MODEL_ID, version: 1, created_at: model.created_at, updated_at: model.updated_at };

describe("paginated AI configuration repositories", () => {
  test("maps database modality race guards precisely and strips provider/database diagnostics", async () => {
    const secret = "synthetic-sensitive-diagnostic";
    for (const slot of ["primary", "fallback"]) {
      const constraint = `ai_scene_routes_${slot}_model_modality_fkey`;
      for (const format of ["constraint", "postgrest", "unrelated", "wrong_state"] as const) {
        const exact = format === "constraint" || format === "postgrest";
        const error = { code: format === "wrong_state" ? "23514" : "23503", details: secret, hint: secret,
          ...(format === "constraint" ? { constraint, message: secret } : {
            message: `insert or update on table "ai_scene_routes" violates foreign key constraint "${constraint}${format === "unrelated" ? "_extra" : ""}"`,
          }) };
        const { repository } = await configFixture(null, error);
        const sceneRepo = (await sceneFixture(null, error)).repository;
        const operations = [
          [() => repository.updateModel(MODEL_ID, { expected_version: 1, modality: "text" }), "AI_MODEL_MODALITY_IN_USE"],
          [() => repository.createSceneRoute(command), "AI_ROUTE_MODEL_MODALITY_MISMATCH"],
          [() => repository.updateSceneRoute(MODEL_ID, { expected_version: 1, primary_model_id: MODEL_ID }), "AI_ROUTE_MODEL_MODALITY_MISMATCH"],
          [() => sceneRepo.createCustomSceneRoute(command), "AI_ROUTE_MODEL_MODALITY_MISMATCH"],
        ] as const;
        for (const [operation, code] of operations) {
          await expect(operation()).rejects.toMatchObject({ code: exact ? code : "DB_ERROR", statusCode: exact ? 409 : 500, details: undefined });
          await operation().catch(caught => { expect(JSON.stringify(caught)).not.toContain(secret); });
        }
      }
    }
  });

  test("new model and scene read paths never expose Supabase diagnostics", async () => {
    const secret = "synthetic-sensitive-diagnostic";
    const error = { code: "XX000", message: secret, details: secret, hint: secret };
    const { repository } = await configFixture(null, error);
    const sceneRepo = (await sceneFixture(null, error)).repository;
    for (const operation of [() => repository.listModels({ page: 1, pageSize: 20 }),
      () => repository.hasModelRouteReference(MODEL_ID), () => sceneRepo.list({ page: 1, pageSize: 20 })]) {
      await expect(operation()).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR", details: undefined });
      await operation().catch(caught => { expect(JSON.stringify(caught)).not.toContain(secret); });
    }
  });
  test("manual models persist server codes and all requested modalities", async () => {
    for (const modality of ["text", "image", "video", "speech"] as const) {
      const { repository, builder } = await configFixture(model);
      await repository.createManualModel({ code: "mdl_opaque", provider: { id: PROVIDER_ID, code: "prv_opaque" },
        modelName: "model-x", displayName: "Display", modality, inputModalities: ["text", modality] });
      expect(builder.calls[0]).toEqual({ method: "insert", args: [{ code: "mdl_opaque", provider_id: PROVIDER_ID,
        name: "Display", model_name: "model-x", modality, input_modalities: ["text", modality], status: "active", sort_order: 0 }] });
    }
  });
  test("filters models before exact bounded pagination with minimal fields and stable ordering", async () => {
    const { repository, builder, tables } = await configFixture([model]);
    const result = await repository.listModels({ page: 2, pageSize: 20, providerId: PROVIDER_ID,
      modality: "image", status: "active", keyword: "seedream" });
    expect(result).toEqual({ list: [model], pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 } });
    expect(tables).toEqual(["ai_models"]);
    expect(builder.calls).toEqual([
      { method: "select", args: [MODEL_SELECT, { count: "exact" }] },
      { method: "eq", args: ["provider_id", PROVIDER_ID] },
      { method: "eq", args: ["modality", "image"] }, { method: "eq", args: ["status", "active"] },
      { method: "or", args: ['name.ilike."%seedream%",model_name.ilike."%seedream%"'] },
      { method: "order", args: ["sort_order", { ascending: true }] },
      { method: "order", args: ["created_at", { ascending: true }] }, { method: "range", args: [20, 39] },
    ]);
  });

  test("escapes literal punctuation and wildcard characters in model searches", async () => {
    for (const [keyword, encoded, sqlPattern] of SEARCH_CASES) {
      const { repository, builder } = await configFixture();
      await repository.listModels({ page: 1, pageSize: 20, keyword });
      expectLiteralSearch(builder.calls, "model_name", encoded, sqlPattern);
    }
  });

  test("retains schema default 20 and rejects oversized repository pagination", async () => {
    expect(AiModelListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(AiModelListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    const { repository, builder } = await configFixture();
    expect((await repository.listModels(AiModelListQuerySchema.parse({}))).pagination.pageSize).toBe(20);
    expect(builder.calls).toContainEqual({ method: "range", args: [0, 19] });
    for (const pageSize of [101, 0, -1, NaN, Infinity]) {
      await expect(repository.listModels({ page: 1, pageSize })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    const valid = await configFixture();
    await valid.repository.listModels({ page: 1, pageSize: 100 });
    expect(valid.builder.calls).toContainEqual({ method: "range", args: [0, 99] });
  });

  test("inserts service-owned opaque provider code without name candidate lookup", async () => {
    const input = { code: "prv_11111111111141118111111111111111", name: "OpenRouter",
      provider_type: "openrouter" as const, api_key_setting_key: "OPENROUTER_API_KEY" as const,
      status: "active" as const, sort_order: 10 };
    const { repository, builder, tables } = await configFixture([{ id: PROVIDER_ID, ...input }]);
    expect((await repository.createProvider(input)).code).toBe(input.code);
    expect(tables).toEqual(["ai_providers"]);
    expect(builder.calls).toEqual([{ method: "insert", args: [input] }, { method: "select", args: ["*"] }]);
  });

  test("inserts service-owned model code with the precise model projection", async () => {
    const { id, created_at, updated_at, ...input } = model;
    const { repository, builder, tables } = await configFixture(model);
    expect(await repository.createModel(input)).toEqual(model);
    expect(tables).toEqual(["ai_models"]);
    expect(builder.calls).toEqual([{ method: "insert", args: [input] }, { method: "select", args: [MODEL_SELECT] }]);
  });

  test("maps only model business-key duplicates to a stable conflict", async () => {
    for (const error of [
      { code: "23505", constraint: "ai_models_provider_call_name_modality_key", details: "private" },
      { code: "23505", message: 'duplicate key value violates unique constraint "ai_models_provider_call_name_modality_key"' },
    ]) {
      await expect((await configFixture(null, error)).repository.createModel(model)).rejects.toMatchObject({
        statusCode: 409, code: "AI_MODEL_ALREADY_REGISTERED", details: undefined,
      });
    }
    await expect((await configFixture(null, { code: "23505", constraint: "uniq_ai_models_code" })).repository.createModel(model))
      .rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("maps exact model business-key conflicts on updates without exposing database details", async () => {
    for (const error of [
      { code: "23505", constraint: "ai_models_provider_call_name_modality_key", message: "private", details: "private", hint: "private" },
      { code: "23505", message: 'duplicate key value violates unique constraint "ai_models_provider_call_name_modality_key"', details: "private" },
    ]) {
      const { repository } = await configFixture(null, error);
      await expect(repository.updateModel(MODEL_ID, { expected_version: 1, model_name: "registered" })).rejects.toMatchObject({
        statusCode: 409, code: "AI_MODEL_ALREADY_REGISTERED", details: undefined,
      });
    }
  });

  test("does not classify other model write failures as registration conflicts or expose raw errors", async () => {
    for (const error of [
      { code: "23505", constraint: "uniq_ai_models_code", message: "private", details: "private" },
      { code: "23505", message: 'duplicate key value violates unique constraint "ai_models_provider_call_name_modality_key_extra"', details: "private" },
      { code: "XX000", constraint: "ai_models_provider_call_name_modality_key", message: "private", details: "private" },
    ]) {
      const { repository } = await configFixture(null, error);
      await expect(repository.createModel(model)).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR", details: undefined });
      await expect(repository.updateModel(MODEL_ID, { expected_version: 1, model_name: "registered" }))
        .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR", details: undefined });
    }
  });

  test("checks primary and fallback model references in one minimal bounded query", async () => {
    const { repository, builder, tables } = await configFixture([{ id: MODEL_ID }]);
    expect(await repository.hasModelRouteReference(MODEL_ID)).toBe(true);
    expect(tables).toEqual(["ai_scene_routes"]);
    expect(builder.calls).toEqual([
      { method: "select", args: ["id"] },
      { method: "or", args: [`primary_model_id.eq."${MODEL_ID}",fallback_model_id.eq."${MODEL_ID}"`] },
      { method: "limit", args: [1] },
    ]);
    expect(await (await configFixture()).repository.hasModelRouteReference(MODEL_ID)).toBe(false);
    const escaped = await configFixture();
    await escaped.repository.hasModelRouteReference('x",id.eq.y\\z');
    expect(escaped.builder.calls).toContainEqual({ method: "or", args: ['primary_model_id.eq."x\\",id.eq.y\\\\z",fallback_model_id.eq."x\\",id.eq.y\\\\z"'] });
  });

  test("lists route model options with escaped filtering before pagination", async () => {
    const { repository, builder } = await configFixture([model]);
    const result = await repository.listRouteModels(PROVIDER_ID, { page: 2, pageSize: 20, keyword: "seedream", modality: "image", status: "active" });
    expect(result.list[0]).toMatchObject({ source: "internal", value: MODEL_ID, label: "Seedream", description: "seedream" });
    expectFiltersBeforeRange(builder.calls);
  });

  test("maps stale model updates and route tier duplicates without database details", async () => {
    const stale = await configFixture(null, { code: "PGRST116", details: "The result contains 0 rows" });
    await expect(stale.repository.updateModel(MODEL_ID, { expected_version: 3, name: "新模型" })).rejects.toMatchObject({
      statusCode: 409, code: "AI_CONFIG_VERSION_STALE", details: undefined,
    });
    expect(stale.builder.calls).toContainEqual({ method: "eq", args: ["version", 3] });
    const duplicate = await configFixture(null, { code: "23505", constraint: "uniq_ai_scene_routes_scene_quality", message: "private" });
    await expect(duplicate.repository.createSceneRoute(command)).rejects.toMatchObject({
      statusCode: 409, code: "AI_SCENE_ROUTE_TIER_CONFLICT", details: undefined,
    });
  });

  test("wraps model and provider database failures and does not query references during updates", async () => {
    const failure = { code: "XX000", message: "private" };
    const { repository } = await configFixture(null, failure);
    await expect(repository.listModels({ page: 1, pageSize: 20 })).rejects.toMatchObject({ code: "DB_ERROR" });
    await expect(repository.hasModelRouteReference(MODEL_ID)).rejects.toMatchObject({ code: "DB_ERROR" });
    await expect(repository.createProvider({ code: "prv_opaque", name: "供应商", provider_type: "openrouter",
      api_key_setting_key: "OPENROUTER_API_KEY", status: "active", sort_order: 0 }))
      .rejects.toMatchObject({ code: "DB_ERROR", message: "创建 AI 供应商失败", details: failure });
    const update = await configFixture(model);
    await update.repository.updateModel(MODEL_ID, { expected_version: 1, modality: "image" });
    expect(update.tables).toEqual(["ai_models"]);
  });
});

describe("AI scene registry repository", () => {
  test("keeps the rollout alias and filters registry fields before exact bounded pagination", async () => {
    const { repository, builder, module } = await sceneFixture([scene]);
    expect(module.AiSceneRegistryRepository).toBe(module.AiSystemSceneRepository);
    const result = await repository.list({ page: 2, pageSize: 20, keyword: "效果图", source: "custom", status: "active" });
    expect(result).toEqual({ list: [scene], pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 } });
    expect(builder.calls).toContainEqual({ method: "select", args: [SCENE_SELECT, { count: "exact" }] });
    expect(builder.calls).toContainEqual({ method: "eq", args: ["source", "custom"] });
    expect(builder.calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(builder.calls).toContainEqual({ method: "or", args: ['name.ilike."%效果图%",code.ilike."%效果图%"'] });
    expect(builder.calls).toContainEqual({ method: "range", args: [20, 39] });
    expect(builder.calls.filter((call) => call.method === "order")).toEqual([
      { method: "order", args: ["source", { ascending: false }] },
      { method: "order", args: ["code", { ascending: true }] },
    ]);
    expectFiltersBeforeRange(builder.calls);
  });

  test("escapes scene keyword and rejects pageSize above 100", async () => {
    for (const [keyword, encoded, sqlPattern] of SEARCH_CASES) {
      const fixture = await sceneFixture();
      await fixture.repository.list({ page: 1, pageSize: 20, keyword });
      expectLiteralSearch(fixture.builder.calls, "code", encoded, sqlPattern);
    }
    const { repository, builder } = await sceneFixture();
    await expect(repository.list({ page: 1, pageSize: 101 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((await repository.list(SystemAiSceneListQuerySchema.parse({}))).pagination.pageSize).toBe(20);
    expect(builder.calls).toContainEqual({ method: "range", args: [0, 19] });
    await repository.list({ page: 1, pageSize: 100 });
    expect(builder.calls).toContainEqual({ method: "range", args: [0, 99] });
  });

  test("gets a registry row by code with only required fields", async () => {
    const { repository, builder } = await sceneFixture(scene);
    expect(await repository.getByCode(SCENE_CODE)).toEqual(scene);
    expect(builder.calls).toEqual([{ method: "select", args: [SCENE_SELECT] }, { method: "eq", args: ["code", SCENE_CODE] }]);
  });

  test("updates only name and status of a custom scene at the expected version", async () => {
    const { repository, builder } = await sceneFixture(scene);
    expect(await repository.updateCustom(SCENE_CODE, { name: "新名称", status: "inactive", expected_version: 3 })).toEqual(scene);
    expect(builder.calls).toEqual([
      { method: "update", args: [{ name: "新名称", status: "inactive" }] },
      { method: "eq", args: ["code", SCENE_CODE] }, { method: "eq", args: ["source", "custom"] },
      { method: "eq", args: ["version", 3] }, { method: "select", args: [SCENE_SELECT] },
    ]);
  });

  test("maps missing or stale custom updates to a stable conflict", async () => {
    const { repository } = await sceneFixture(null, { code: "PGRST116", message: "private", details: "The result contains 0 rows" });
    await expect(repository.updateCustom(SCENE_CODE, { name: "新名称", expected_version: 3 })).rejects.toMatchObject({
      statusCode: 409, code: "AI_CONFIG_VERSION_STALE", details: undefined,
    });
  });

  test("creates a custom scene and its route through exactly one atomic RPC", async () => {
    const { repository, rpcCalls, tables } = await sceneFixture({ scene, route });
    expect(await repository.createCustomSceneRoute(command)).toEqual({ scene, route });
    expect(tables).toEqual([]);
    expect(rpcCalls).toEqual([{ method: "rpc", args: ["create_ai_custom_scene_route", {
      p_scene_code: SCENE_CODE, p_scene_name: scene.name, p_modality: "image", p_quality_tier: "balanced",
      p_primary_model_id: MODEL_ID, p_fallback_model_id: null, p_temperature: null,
      p_response_format: null, p_timeout_ms: 30000, p_status: "active",
    }] }]);
  });

  test("rejects malformed atomic create RPC results", async () => {
    for (const result of [null, {}, { scene: {}, route: {} }, { scene, route: null }]) {
      await expect((await sceneFixture(result)).repository.createCustomSceneRoute(command)).rejects.toMatchObject({ code: "DB_ERROR" });
    }
  });

  test("deletes a custom scene only through the protected RPC", async () => {
    const { repository, rpcCalls, tables } = await sceneFixture(SCENE_CODE);
    expect(await repository.deleteCustom(SCENE_CODE, 3)).toEqual({ code: SCENE_CODE, deleted: true });
    expect(tables).toEqual([]);
    expect(rpcCalls).toEqual([{ method: "rpc", args: ["delete_ai_custom_scene", { p_scene_code: SCENE_CODE, p_expected_version: 3 }] }]);
  });

  test("maps protected RPC errors to stable business errors without database details", async () => {
    for (const [pgCode, message, code, statusCode] of [
      ["P0002", "ai_custom_scene_not_found", "AI_CUSTOM_SCENE_NOT_FOUND", 404],
      ["40001", "ai_config_version_stale", "AI_CONFIG_VERSION_STALE", 409],
      ["23503", "ai_custom_scene_in_use", "AI_CUSTOM_SCENE_IN_USE", 409],
    ] as const) {
      const { repository } = await sceneFixture(null, { code: pgCode, message, details: "private" });
      await expect(repository.deleteCustom(SCENE_CODE, 3)).rejects.toMatchObject({ statusCode, code, details: undefined });
    }
  });

  test("wraps unexpected command errors and rejects malformed delete RPC results", async () => {
    const failure = { code: "XX000", message: "private", details: "private" };
    const { repository } = await sceneFixture(null, failure);
    for (const run of [() => repository.createCustomSceneRoute(command), () => repository.deleteCustom(SCENE_CODE, 1),
      () => repository.updateCustom(SCENE_CODE, { name: "新名称", expected_version: 1 })]) {
      await expect(run()).rejects.toMatchObject({ code: "DB_ERROR", details: undefined });
    }
    for (const data of [null, {}, "wrong_scene"]) {
      await expect((await sceneFixture(data)).repository.deleteCustom(SCENE_CODE, 1)).rejects.toMatchObject({ code: "DB_ERROR" });
    }
    const empty = await sceneFixture(null);
    expect(await empty.repository.getByCode(SCENE_CODE)).toBeNull();
    await expect(empty.repository.updateCustom(SCENE_CODE, { expected_version: 1, name: "新名称" }))
      .rejects.toMatchObject({ code: "AI_CONFIG_VERSION_STALE" });
  });
});
