import { Errors } from "@/errors/error-factory";
import type {
  AiModelPayload,
  AiRouteModelOptionListQuery,
  AiProviderPayload,
  AiSceneRoutePayload,
  UpdateAiModelPayload,
  UpdateAiProviderPayload,
  UpdateAiSceneRoutePayload,
} from "@/schema/ai-config";
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
  temperature: number | null;
  response_format: "json_object" | "text" | null;
  timeout_ms: number | null;
  status: "active" | "inactive";
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

type AiConfigClient = {
  from: (table: string) => any;
};

const PROVIDER_CODE_MAX_LENGTH = 80;
const PROVIDER_CODE_LOOKUP_LIMIT = 1000;

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

function normalizeProviderCodeSeed(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function truncateProviderCodeBase(base: string, suffix = ""): string {
  return base.slice(0, PROVIDER_CODE_MAX_LENGTH - suffix.length);
}

function providerCodeCandidate(base: string, index: number): string {
  if (index === 1) return truncateProviderCodeBase(base);
  const suffix = `_${index}`;
  return `${truncateProviderCodeBase(base, suffix)}${suffix}`;
}

function providerCodeBase(input: AiProviderPayload): string {
  const nameSeed = normalizeProviderCodeSeed(input.name);
  return truncateProviderCodeBase(nameSeed || input.provider_type || "ai_provider");
}

function modelCodeSeed(value: string): string {
  return normalizeProviderCodeSeed(value) || "model";
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

  async listModels() {
    const { data, error } = await this.from("ai_models")
      .select(`
        *,
        provider:ai_providers!ai_models_provider_id_fkey(*)
      `)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询 AI 模型失败", error);
    }

    return (data || []) as AiModelRecord[];
  }

  async listRouteModels(providerId: string, query: AiRouteModelOptionListQuery) {
    const { from, to } = pageRange(query);
    let request = this.from("ai_models")
      .select(MODEL_SELECT, { count: "exact" })
      .eq("provider_id", providerId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to);

    if (query.modality) request = request.eq("modality", query.modality);
    if (query.status) request = request.eq("status", query.status);
    if (query.keyword) {
      request = request.or(`name.ilike.%${query.keyword}%,model_name.ilike.%${query.keyword}%`);
    }

    const { data, error, count } = await request;
    if (error) {
      throw Errors.dbError("查询供应商模型候选失败", error);
    }

    const total = count ?? 0;
    return {
      list: ((data || []) as AiModelRecord[]).map(routeModelOptionFromRecord),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: totalPages(total, query.pageSize),
      },
    };
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
    provider: Pick<AiProviderRecord, "id" | "code">;
    modelName: string;
    displayName?: string | null;
  }): Promise<AiModelRecord> {
    const code = `manual.${input.provider.code}.${modelCodeSeed(input.modelName)}`.slice(0, 120);
    return this.createModel({
      provider_id: input.provider.id,
      code,
      name: input.displayName || input.modelName,
      model_name: input.modelName,
      modality: "text",
      input_modalities: ["text"],
      status: "active",
      sort_order: 0,
    });
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

  private async nextProviderCode(input: AiProviderPayload): Promise<string> {
    const base = providerCodeBase(input);
    const { data, error } = await this.from("ai_providers")
      .select("code")
      .ilike("code", `${base}%`)
      .limit(PROVIDER_CODE_LOOKUP_LIMIT);

    if (error) {
      throw Errors.dbError("生成 AI 供应商编码失败", error);
    }

    const existingCodes = new Set(
      ((data || []) as Array<{ code?: unknown }>)
        .map((item) => item.code)
        .filter((code): code is string => typeof code === "string"),
    );

    for (let index = 1; index <= PROVIDER_CODE_LOOKUP_LIMIT; index += 1) {
      const candidate = providerCodeCandidate(base, index);
      if (!existingCodes.has(candidate)) return candidate;
    }

    throw Errors.business(409, "供应商编码已用尽，请调整供应商名称", "AI_PROVIDER_CODE_EXHAUSTED");
  }

  async createProvider(input: AiProviderPayload) {
    const code = await this.nextProviderCode(input);
    const { data, error } = await this.from("ai_providers")
      .insert({ ...input, code })
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

  async createModel(input: AiModelPayload) {
    const { data, error } = await this.from("ai_models")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建 AI 模型失败", error);
    }

    return data as AiModelRecord;
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
      if (isNoRowsError(error)) throw staleVersionError();
      throw Errors.dbError("更新 AI 模型失败", error);
    }

    return data as AiModelRecord;
  }

  async createSceneRoute(input: AiSceneRoutePayload) {
    const { data, error } = await this.from("ai_scene_routes")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建 AI 场景路由失败", error);
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
      if (isNoRowsError(error)) throw staleVersionError();
      throw Errors.dbError("更新 AI 场景路由失败", error);
    }

    return data as AiSceneRouteRecord;
  }
}

export const aiConfigRepository = new AiConfigRepository();
