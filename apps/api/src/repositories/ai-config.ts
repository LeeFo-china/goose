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

class AiConfigRepository {
  private client = SupabaseDB.getAdminClient();

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

  async createProvider(input: AiProviderPayload) {
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
    const { data, error } = await this.from("ai_providers")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
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
    const { data, error } = await this.from("ai_models")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
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
    const { data, error } = await this.from("ai_scene_routes")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新 AI 场景路由失败", error);
    }

    return data as AiSceneRouteRecord;
  }
}

export const aiConfigRepository = new AiConfigRepository();
