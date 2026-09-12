import { Errors } from "@/errors/error-factory";
import type {
  AiModelPayload,
  AiModelListQuery,
  AiRouteModelOptionListQuery,
  AiProviderPayload,
  AiSceneRoutePayload,
  DeleteAiProviderPayload,
  UpdateAiModelPayload,
  UpdateAiProviderPayload,
  UpdateAiSceneRoutePayload,
} from "@/schema/ai-config";
import { AiModelListQuerySchema } from "@/schema/ai-config";
import { SupabaseDB } from "@/utils/supabase";

export type AiProviderRecord = {
  id: string;
  code: string;
  name: string;
  provider_type: string;
  endpoint_url: string | null;
  api_key_setting_key: string | null;
  status: "active" | "inactive";
  sort_order: number;
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
  catalog_managed?: boolean | null;
  probe_status?: "unverified" | "eligible" | "ineligible" | "stale";
  status: "active" | "inactive";
  sort_order: number;
  created_at: string;
  updated_at: string;
  provider?: AiProviderRecord | null;
};

export type AiSceneRouteRecord = {
  id: string;
  scene_code: string;
  name: string;
  primary_model_id: string | null;
  fallback_model_id: string | null;
  quality_tier: "fast" | "balanced" | "quality";
  modality: "text" | "image" | "video" | "speech";
  temperature: number | null;
  response_format: "json_object" | "text" | null;
  timeout_ms: number | null;
  status: "active" | "inactive";
  version: number;
  created_at: string;
  updated_at: string;
  primary_model?: AiModelRecord | null;
  fallback_model?: AiModelRecord | null;
};

export type AiRouteModelOptionRecord = AiModelRecord & {
  source: "internal";
  value: string;
  label: string;
  description: string | null;
};

type ServerOwnedAiModelPayload = AiModelPayload & { code: string };

export type Page<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type AiConfigClient = {
  from: (table: string) => any;
};

function isNoRowsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const envelope = error as { code?: unknown; details?: unknown; message?: unknown };
  return envelope.code === "PGRST116"
    || (typeof envelope.details === "string" && envelope.details.includes("0 rows"))
    || (typeof envelope.message === "string" && envelope.message.includes("0 rows"));
}

function staleVersionError() {
  return Errors.business(409, "配置版本已变化，请重新加载后再保存", "AI_CONFIG_VERSION_STALE");
}

function sceneTierConflictError() {
  return Errors.business(409, "该场景与质量档位已存在", "AI_SCENE_ROUTE_TIER_CONFLICT");
}

export function isAiModelModalityReferenceError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const envelope = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (envelope.code !== "23503") return false;
  const constraints = ["ai_scene_routes_primary_model_modality_fkey", "ai_scene_routes_fallback_model_modality_fkey"];
  if (typeof envelope.constraint === "string") return constraints.includes(envelope.constraint);
  const message = envelope.message;
  return typeof message === "string" && constraints.some(name => message.includes(`foreign key constraint "${name}"`));
}

function isModelRegistrationConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (record.code !== "23505") return false;
  const constraint = "ai_models_provider_call_name_modality_key";
  if (typeof record.constraint === "string") return record.constraint === constraint;
  return typeof record.message === "string"
    && record.message.includes(`unique constraint "${constraint}"`);
}

function modelRegistrationConflictError() {
  return Errors.business(409, "该供应商下已登记相同调用名称和模态的模型", "AI_MODEL_ALREADY_REGISTERED");
}

function isSceneTierConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (record.code !== "23505") return false;
  return record.constraint === "uniq_ai_scene_routes_scene_quality"
    || (typeof record.message === "string"
      && record.message.includes("uniq_ai_scene_routes_scene_quality"));
}

function pageRange(query: { page: number; pageSize: number }) {
  const from = (query.page - 1) * query.pageSize;
  return { from, to: from + query.pageSize - 1 };
}

function totalPages(total: number, pageSize: number) {
  return total ? Math.ceil(total / pageSize) : 0;
}

const MODEL_SELECT = [
  "id",
  "provider_id",
  "code",
  "name",
  "model_name",
  "modality",
  "input_modalities",
  "catalog_managed",
  "probe_status",
  "status",
  "sort_order",
  "version",
  "created_at",
  "updated_at",
  "provider:ai_providers!ai_models_provider_id_fkey(id,code,name,provider_type,status)",
].join(",");

const SCENE_ROUTE_SELECT = [
  "id",
  "scene_code",
  "name",
  "primary_model_id",
  "fallback_model_id",
  "quality_tier",
  "modality",
  "temperature",
  "response_format",
  "timeout_ms",
  "status",
  "version",
  "created_at",
  "updated_at",
].join(",");

function routeModelOptionFromRecord(item: AiModelRecord): AiRouteModelOptionRecord {
  return {
    ...item,
    source: "internal",
    value: item.id,
    label: item.name,
    description: item.model_name || null,
  };
}

export class AiConfigRepository {
  private readonly client: AiConfigClient;

  constructor(client: AiConfigClient = SupabaseDB.getAdminClient() as unknown as AiConfigClient) {
    this.client = client;
  }

  private from(table: string) {
    return (this.client as unknown as { from: (table: string) => any }).from(table);
  }

  async listProviders() {
    const { data, error } = await this.from("ai_providers")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询 AI 供应商失败", error);
    }

    return (data || []) as AiProviderRecord[];
  }

  async listModels(query: AiModelListQuery): Promise<Page<AiModelRecord>> {
    const parsed = AiModelListQuerySchema.safeParse(query);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const filters = parsed.data;
    const { from, to } = pageRange(filters);
    let request = this.from("ai_models").select(MODEL_SELECT, { count: "exact" });
    if (filters.providerId) request = request.eq("provider_id", filters.providerId);
    if (filters.modality) request = request.eq("modality", filters.modality);
    if (filters.status) request = request.eq("status", filters.status);
    if (filters.keyword) {
      // Escape SQL LIKE literals first, then encode the entire quoted PostgREST
      // value: its parser consumes one backslash layer before SQL sees the pattern.
      const pattern = `%${filters.keyword.replace(/[\\%_]/g, "\\$&")}%`;
      const keyword = `"${pattern.replace(/[\\"]/g, "\\$&")}"`;
      request = request.or(`name.ilike.${keyword},model_name.ilike.${keyword}`);
    }
    const { data, error, count } = await request
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询 AI 模型失败");
    }

    const total = count ?? 0;
    return {
      list: (data || []) as AiModelRecord[],
      pagination: { page: filters.page, pageSize: filters.pageSize, total, totalPages: totalPages(total, filters.pageSize) },
    };
  }

  async listRouteModels(providerId: string, query: AiRouteModelOptionListQuery): Promise<Page<AiRouteModelOptionRecord>> {
    const page = await this.listModels({ ...query, providerId });
    return { ...page, list: page.list.map(routeModelOptionFromRecord) };
  }

  async getProviderById(id: string): Promise<AiProviderRecord | null> {
    const { data, error } = await this.from("ai_providers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 AI 供应商失败", error);
    }

    return data as AiProviderRecord | null;
  }

  async getModelById(id: string): Promise<AiModelRecord | null> {
    const { data, error } = await this.from("ai_models")
      .select(MODEL_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 AI 模型失败", error);
    }

    return data as AiModelRecord | null;
  }

  async findModelByProviderAndCallName(
    providerId: string,
    modelName: string,
    modality: "text" | "image" | "video" | "speech" = "text",
  ): Promise<AiModelRecord | null> {
    const { data, error } = await this.from("ai_models")
      .select(MODEL_SELECT)
      .eq("provider_id", providerId)
      .eq("model_name", modelName)
      .eq("modality", modality)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 AI 模型失败", error);
    }

    return data as AiModelRecord | null;
  }

  async createManualModel(input: {
    code: string;
    modality: AiModelPayload["modality"];
    inputModalities: NonNullable<AiModelPayload["input_modalities"]>;
    provider: Pick<AiProviderRecord, "id" | "code">;
    modelName: string;
    displayName?: string | null;
  }): Promise<AiModelRecord> {
    const model: ServerOwnedAiModelPayload = {
      provider_id: input.provider.id,
      code: input.code,
      name: input.displayName || input.modelName,
      model_name: input.modelName,
      modality: input.modality,
      input_modalities: input.inputModalities,
      status: "active",
      sort_order: 0,
    };
    return this.createModel(model);
  }

  async listSceneRoutes() {
    const { data, error } = await this.from("ai_scene_routes")
      .select(`
        *,
        primary_model:ai_models!ai_scene_routes_primary_model_id_fkey(
          *,
          provider:ai_providers!ai_models_provider_id_fkey(*)
        ),
        fallback_model:ai_models!ai_scene_routes_fallback_model_id_fkey(
          *,
          provider:ai_providers!ai_models_provider_id_fkey(*)
        )
      `)
      .order("scene_code", { ascending: true });

    if (error) {
      throw Errors.dbError("查询 AI 场景路由失败", error);
    }

    return (data || []) as AiSceneRouteRecord[];
  }

  async createProvider(input: AiProviderPayload & { code: string }): Promise<AiProviderRecord> {
    const { data, error } = await this.from("ai_providers")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建 AI 供应商失败", error);
    }

    return data as AiProviderRecord;
  }

  async updateProvider(id: string, input: UpdateAiProviderPayload) {
    const { expected_version, ...payload } = input;
    const { data, error } = await this.from("ai_providers")
      .update(payload)
      .eq("id", id)
      .eq("version", expected_version)
      .select("*")
      .single();

    if (error) {
      if (isNoRowsError(error)) throw staleVersionError();
      throw Errors.dbError("更新 AI 供应商失败", error);
    }

    return data as AiProviderRecord;
  }

  async deleteProvider(id: string, input: DeleteAiProviderPayload): Promise<Pick<AiProviderRecord, "id" | "name">> {
    // Deploy the RESTRICT FK migration first; FK enforcement also covers concurrent model inserts.
    const { data, error } = await this.from("ai_providers")
      .delete()
      .eq("id", id)
      .eq("version", input.expected_version)
      .select("id,name")
      .maybeSingle();

    if (error) {
      if (error.code === "23503") {
        throw Errors.business(409, "供应商仍有关联模型或目录记录，请改用停用", "AI_PROVIDER_IN_USE");
      }
      if (isNoRowsError(error)) throw staleVersionError();
      throw Errors.dbError("删除 AI 供应商失败");
    }
    if (!data) throw staleVersionError();
    return { id: data.id, name: data.name };
  }

  async createModel(input: ServerOwnedAiModelPayload): Promise<AiModelRecord> {
    const { data, error } = await this.from("ai_models")
      .insert(input)
      .select(MODEL_SELECT)
      .single();

    if (error) {
      if (isModelRegistrationConflict(error)) throw modelRegistrationConflictError();
      throw Errors.dbError("创建 AI 模型失败");
    }

    return data as AiModelRecord;
  }

  async hasModelRouteReference(modelId: string): Promise<boolean> {
    const value = `"${modelId.replace(/[\\"]/g, "\\$&")}"`;
    const { data, error } = await this.from("ai_scene_routes")
      .select("id")
      .or(`primary_model_id.eq.${value},fallback_model_id.eq.${value}`)
      .limit(1);
    if (error) throw Errors.dbError("查询 AI 模型路由引用失败");
    return (data?.length ?? 0) > 0;
  }

  async updateModel(id: string, input: UpdateAiModelPayload) {
    const { expected_version, ...payload } = input;
    const { data, error } = await this.from("ai_models")
      .update(payload)
      .eq("id", id)
      .eq("version", expected_version)
      .select("*")
      .single();

    if (error) {
      if (isAiModelModalityReferenceError(error)) {
        throw Errors.business(409, "模型已有场景路由引用，不能修改模态", "AI_MODEL_MODALITY_IN_USE");
      }
      if (isNoRowsError(error)) throw staleVersionError();
      if (isModelRegistrationConflict(error)) throw modelRegistrationConflictError();
      throw Errors.dbError("更新 AI 模型失败");
    }

    return data as AiModelRecord;
  }

  async createSceneRoute(input: AiSceneRoutePayload) {
    const { data, error } = await this.from("ai_scene_routes")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      if (isAiModelModalityReferenceError(error)) {
        throw Errors.business(409, "AI 模型模态与场景路由不匹配", "AI_ROUTE_MODEL_MODALITY_MISMATCH");
      }
      if (isSceneTierConflict(error)) throw sceneTierConflictError();
      throw Errors.dbError("创建 AI 场景路由失败");
    }

    return data as AiSceneRouteRecord;
  }

  async updateSceneRoute(id: string, input: UpdateAiSceneRoutePayload) {
    const { expected_version, ...payload } = input;
    const { data, error } = await this.from("ai_scene_routes")
      .update(payload)
      .eq("id", id)
      .eq("version", expected_version)
      .select("*")
      .single();

    if (error) {
      if (isAiModelModalityReferenceError(error)) {
        throw Errors.business(409, "AI 模型模态与场景路由不匹配", "AI_ROUTE_MODEL_MODALITY_MISMATCH");
      }
      if (isSceneTierConflict(error)) throw sceneTierConflictError();
      if (isNoRowsError(error)) throw staleVersionError();
      throw Errors.dbError("更新 AI 场景路由失败");
    }

    return data as AiSceneRouteRecord;
  }

  async getSceneRouteById(id: string): Promise<AiSceneRouteRecord | null> {
    const { data, error } = await this.from("ai_scene_routes")
      .select(SCENE_ROUTE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw Errors.dbError("查询 AI 场景路由失败", error);
    return data as AiSceneRouteRecord | null;
  }
}

export const aiConfigRepository = new AiConfigRepository();
