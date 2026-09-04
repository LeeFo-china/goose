import { Errors } from "@/errors/error-factory";
import type {
  AiCatalogEntryListQuery,
  AiCatalogRunListQuery,
  AiConfigListQuery,
  AiModelCapabilityPayload,
  AiModelListQuery,
  AiSceneRouteListQuery,
} from "@/schema/ai-config";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  ilike: (...args: unknown[]) => QueryBuilder;
  or: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  range: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<QueryResult>["then"];
};

type AiCatalogTable =
  | "ai_providers"
  | "ai_models"
  | "ai_scene_routes"
  | "ai_model_catalog_sync_runs"
  | "ai_model_catalog_entries";

type AiCatalogClient = {
  from: (table: AiCatalogTable) => QueryBuilder;
  rpc: (functionName: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: unknown;
  }>;
};

type Page<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type AiProviderRecord = {
  id: string;
  code: string;
  name: string;
  provider_type: string;
  endpoint_url: string | null;
  api_key_setting_key: string | null;
  status: "active" | "inactive";
  sort_order: number;
  version?: number | null;
  created_at: string;
  updated_at: string;
};

export type AiModelRecord = {
  id: string;
  provider_id: string;
  code: string;
  name: string;
  model_name: string;
  modality?: "text" | "image" | "video" | "speech";
  input_modalities?: string[] | null;
  capability_payload?: Record<string, unknown> | null;
  probe_status?: "unverified" | "eligible" | "ineligible" | "stale";
  version?: number | null;
  current_price_snapshot_id?: string | null;
  catalog_managed?: boolean | null;
  status: "active" | "inactive";
  sort_order: number;
  created_at: string;
  updated_at: string;
  provider?: Pick<AiProviderRecord, "id" | "code" | "name" | "provider_type"> | null;
  price_snapshot?: Record<string, unknown> | null;
};

export type AiSceneRouteRecord = {
  id: string;
  scene_code: string;
  name: string;
  primary_model_id: string | null;
  fallback_model_id: string | null;
  quality_tier?: "fast" | "balanced" | "quality";
  modality?: "text" | "image" | "video" | "speech";
  max_cost_usd?: string | number | null;
  confirmation_threshold_usd?: string | number | null;
  temperature: number | null;
  response_format: "json_object" | "text" | null;
  timeout_ms: number | null;
  status: "active" | "inactive";
  version?: number | null;
  created_at: string;
  updated_at: string;
  primary_model?: AiModelRecord | null;
  fallback_model?: AiModelRecord | null;
};

export type CatalogPreviewInput = {
  providerId: string;
  sourceEndpoint: string;
  catalogHash: string;
  requestedByEmployeeId: string;
  entries: Record<string, unknown>[];
  summaryPayload: Record<string, unknown>;
};

export type CatalogApplyInput = {
  runId: string;
  entryIds: string[];
  expectedCatalogHash: string;
};

const PROVIDER_SELECT = [
  "id",
  "code",
  "name",
  "provider_type",
  "endpoint_url",
  "api_key_setting_key",
  "status",
  "sort_order",
  "version",
  "created_at",
  "updated_at",
].join(",");

const MODEL_SELECT = [
  "id",
  "provider_id",
  "code",
  "name",
  "model_name",
  "modality",
  "input_modalities",
  "probe_status",
  "version",
  "current_price_snapshot_id",
  "catalog_managed",
  "status",
  "sort_order",
  "created_at",
  "updated_at",
  "provider:ai_providers!ai_models_provider_id_fkey(id,code,name,provider_type)",
  "price_snapshot:ai_model_price_snapshots!ai_models_current_price_snapshot_id_fkey(id,prompt_price_usd,completion_price_usd,request_price_usd,image_price_usd,video_price_usd,speech_price_usd,raw_price_projection,valid_from)",
].join(",");

const CATALOG_MANAGED_MODEL_SELECT = [
  "id",
  "provider_id",
  "code",
  "name",
  "model_name",
  "modality",
  "input_modalities",
  "capability_payload",
  "probe_status",
  "version",
  "current_price_snapshot_id",
  "catalog_managed",
  "status",
  "sort_order",
  "created_at",
  "updated_at",
  "provider:ai_providers!ai_models_provider_id_fkey(id,code,name,provider_type)",
  "price_snapshot:ai_model_price_snapshots!ai_models_current_price_snapshot_id_fkey(id,prompt_price_usd,completion_price_usd,request_price_usd,image_price_usd,video_price_usd,speech_price_usd,raw_price_projection,valid_from)",
].join(",");

const ROUTE_SELECT = [
  "id",
  "scene_code",
  "name",
  "primary_model_id",
  "fallback_model_id",
  "quality_tier",
  "modality",
  "max_cost_usd",
  "confirmation_threshold_usd",
  "temperature",
  "response_format",
  "timeout_ms",
  "status",
  "version",
  "created_at",
  "updated_at",
  "primary_model:ai_models!ai_scene_routes_primary_model_id_fkey(id,code,name,model_name,modality,status)",
  "fallback_model:ai_models!ai_scene_routes_fallback_model_id_fkey(id,code,name,model_name,modality,status)",
].join(",");

const RUN_SELECT = [
  "id",
  "provider_id",
  "source_endpoint",
  "catalog_hash",
  "run_status",
  "model_count",
  "summary_payload",
  "created_by_employee_id",
  "created_at",
].join(",");

const ENTRY_SELECT = [
  "id",
  "run_id",
  "entry_position",
  "external_model_id",
  "model_name",
  "modality",
  "change_type",
  "current_model_id",
  "current_model_version",
  "raw_price_projection",
  "catalog_hash",
  "apply_status",
  "apply_block_code",
  "created_at",
].join(",");

function pageRange(query: { page: number; pageSize: number }) {
  const from = (query.page - 1) * query.pageSize;
  return { from, to: from + query.pageSize - 1 };
}

function totalPages(total: number, pageSize: number) {
  return total ? Math.ceil(total / pageSize) : 0;
}

function escapeCatalogKeyword(keyword: string) {
  return keyword.trim().replace(/[\\%_,()]/g, "\\$&");
}

function assertRpcDataObject(data: unknown, operation: string) {
  if (!data || typeof data !== "object" || !("data" in data)) {
    const error = data && typeof data === "object"
      ? (data as { error?: unknown }).error
      : null;
    if (error && typeof error === "object") {
      const envelope = error as {
        status_code?: unknown;
        code?: unknown;
        message?: unknown;
      };
      throw Errors.business(
        typeof envelope.status_code === "number" ? envelope.status_code : 500,
        typeof envelope.message === "string" ? envelope.message : `${operation}失败`,
        typeof envelope.code === "string" ? envelope.code : "AI_MODEL_CATALOG_COMMAND_FAILED",
      );
    }
    throw Errors.dbError(`${operation}返回格式无效`);
  }
  const value = (data as { data?: unknown; error?: unknown }).data;
  if (!value || typeof value !== "object") {
    throw Errors.dbError(`${operation}返回数据无效`);
  }
  return value as Record<string, unknown>;
}

export class AiModelCatalogRepository {
  constructor(private readonly client: AiCatalogClient = SupabaseDB.getAdminClient() as unknown as AiCatalogClient) {}

  private from(table: AiCatalogTable) {
    return this.client.from(table);
  }

  async getProvider(providerId: string): Promise<AiProviderRecord | null> {
    const { data, error } = await this.from("ai_providers")
      .select(PROVIDER_SELECT)
      .eq("id", providerId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询 AI 供应商失败");
    return data as AiProviderRecord | null;
  }

  async listProviders(query: AiConfigListQuery): Promise<Page<AiProviderRecord>> {
    const { from, to } = pageRange(query);
    const { data, error, count } = await this.from("ai_providers")
      .select(PROVIDER_SELECT, { count: "exact" })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw Errors.dbError("查询 AI 供应商失败");
    const total = count ?? 0;
    return {
      list: (data || []) as AiProviderRecord[],
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: totalPages(total, query.pageSize) },
    };
  }

  async listModels(query: AiModelListQuery): Promise<Page<AiModelRecord>> {
    const { from, to } = pageRange(query);
    let request = this.from("ai_models")
      .select(MODEL_SELECT, { count: "exact" })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to);
    if (query.modality) request = request.eq("modality", query.modality);
    if (query.status) request = request.eq("status", query.status);
    if (query.keyword) request = request.or(`code.ilike.%${query.keyword}%,name.ilike.%${query.keyword}%,model_name.ilike.%${query.keyword}%`);
    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询 AI 模型失败");
    const total = count ?? 0;
    return {
      list: (data || []) as AiModelRecord[],
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: totalPages(total, query.pageSize) },
    };
  }

  async listSceneRoutes(query: AiSceneRouteListQuery): Promise<Page<AiSceneRouteRecord>> {
    const { from, to } = pageRange(query);
    let request = this.from("ai_scene_routes")
      .select(ROUTE_SELECT, { count: "exact" })
      .order("scene_code", { ascending: true })
      .order("quality_tier", { ascending: true })
      .range(from, to);
    if (query.sceneCode) request = request.eq("scene_code", query.sceneCode);
    if (query.qualityTier) request = request.eq("quality_tier", query.qualityTier);
    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询 AI 场景路由失败");
    const total = count ?? 0;
    return {
      list: (data || []) as AiSceneRouteRecord[],
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: totalPages(total, query.pageSize) },
    };
  }

  async listCatalogRuns(query: AiCatalogRunListQuery): Promise<Page<Record<string, unknown>>> {
    const { from, to } = pageRange(query);
    let request = this.from("ai_model_catalog_sync_runs")
      .select(RUN_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (query.provider_id) request = request.eq("provider_id", query.provider_id);
    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询 OpenRouter 目录同步记录失败");
    const total = count ?? 0;
    return {
      list: (data || []) as Record<string, unknown>[],
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: totalPages(total, query.pageSize) },
    };
  }

  async listCatalogEntries(runId: string, query: AiCatalogEntryListQuery): Promise<Page<Record<string, unknown>>> {
    const { from, to } = pageRange(query);
    let request = this.from("ai_model_catalog_entries")
      .select(ENTRY_SELECT, { count: "exact" })
      .eq("run_id", runId);
    if (query.modality) request = request.eq("modality", query.modality);
    if (query.changeType) request = request.eq("change_type", query.changeType);
    if (query.keyword) {
      const keyword = escapeCatalogKeyword(query.keyword);
      request = request.or(`model_name.ilike.%${keyword}%,external_model_id.ilike.%${keyword}%`);
    }
    const { data, error, count } = await request
      .order("entry_position", { ascending: true })
      .range(from, to);
    if (error) throw Errors.dbError("查询 OpenRouter 目录条目失败");
    const total = count ?? 0;
    return {
      list: (data || []) as Record<string, unknown>[],
      pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: totalPages(total, query.pageSize) },
    };
  }

  async listCatalogManagedModels(providerId: string): Promise<AiModelRecord[]> {
    const { data, error } = await this.from("ai_models")
      .select(CATALOG_MANAGED_MODEL_SELECT)
      .eq("provider_id", providerId)
      .eq("catalog_managed", true)
      .order("model_name", { ascending: true })
      .limit(10000);
    if (error) throw Errors.dbError("查询 OpenRouter 已管理模型失败");
    return (data || []) as AiModelRecord[];
  }

  async getCounts() {
    const [providers, models, routes] = await Promise.all([
      this.listProviders({ page: 1, pageSize: 1 }),
      this.listModels({ page: 1, pageSize: 1 }),
      this.listSceneRoutes({ page: 1, pageSize: 1 }),
    ]);
    return {
      providers: providers.pagination.total,
      models: models.pagination.total,
      routes: routes.pagination.total,
    };
  }

  async getOpenRouterUsageSummary() {
    // Task5 会引入真实 ai_generation_provider_events / cost ledger。
    // Task4 先提供安全 summary 形状，避免查询尚不存在的账本表。
    const rows: Array<{ cost_usd?: string | number | null }> = [];
    return {
      requests_24h: rows.length,
      estimated_cost_usd_24h: rows.reduce((sum, row) => sum + Number(row.cost_usd || 0), 0),
    };
  }

  async saveOpenRouterCatalogPreview(input: CatalogPreviewInput) {
    const { data, error } = await this.client.rpc("save_openrouter_model_catalog_preview", {
      p_provider_id: input.providerId,
      p_catalog_hash: input.catalogHash,
      p_source_endpoint: input.sourceEndpoint,
      p_entries: input.entries,
      p_created_by_employee_id: input.requestedByEmployeeId,
      p_summary_payload: input.summaryPayload,
    });
    if (error) throw Errors.dbError("保存 OpenRouter 模型目录预览失败");
    return assertRpcDataObject(data, "保存 OpenRouter 模型目录预览");
  }

  async applyOpenRouterCatalog(input: CatalogApplyInput) {
    const { data, error } = await this.client.rpc("apply_openrouter_model_catalog", {
      p_run_id: input.runId,
      p_entry_ids: input.entryIds,
      p_expected_catalog_hash: input.expectedCatalogHash,
    });
    if (error) throw Errors.dbError("应用 OpenRouter 模型目录失败");
    return assertRpcDataObject(data, "应用 OpenRouter 模型目录");
  }

  async saveCapabilityOverride(input: {
    modelId: string;
    expectedVersion: number;
    capabilityPayload: AiModelCapabilityPayload["capability_payload"];
    probeStatus: AiModelCapabilityPayload["probe_status"];
    probeAt?: string | null;
  }) {
    const { data, error } = await this.client.rpc("save_ai_model_capability_override", {
      p_model_id: input.modelId,
      p_expected_version: input.expectedVersion,
      p_capability_payload: input.capabilityPayload,
      p_probe_status: input.probeStatus,
      p_probe_at: input.probeAt ?? null,
    });
    if (error) throw Errors.dbError("保存 AI 模型能力覆盖失败");
    return assertRpcDataObject(data, "保存 AI 模型能力覆盖");
  }
}

export const aiModelCatalogRepository = new AiModelCatalogRepository();
