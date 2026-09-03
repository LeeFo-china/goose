import { Errors } from "@/errors/error-factory";
import type {
  AiModelPayload,
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
