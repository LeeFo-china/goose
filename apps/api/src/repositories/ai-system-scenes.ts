import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import type { AiSceneRoutePayload, SystemAiSceneListQuery } from "@/schema/ai-config";
import { PaginationQuerySchema } from "@/schema/request";
import { SupabaseDB } from "@/utils/supabase";
import type { AiSceneRouteRecord, Page } from "./ai-config";
import { isAiModelModalityReferenceError } from "./ai-config";

const ModalitySchema = z.enum(["text", "image", "video", "speech"]);
const StatusSchema = z.enum(["active", "inactive"]);
const SceneRecordSchema = z.object({
  code: z.string(),
  name: z.string(),
  modality: ModalitySchema,
  required_input_modalities: z.array(ModalitySchema),
  runtime_status: z.enum(["connected", "not_connected"]),
  requirements_source: z.enum(["runtime", "planned_adapter", "admin"]),
  requires_streaming: z.boolean(),
  min_reference_images: z.number().int().nonnegative(),
  source: z.enum(["system", "custom", "legacy"]),
  allow_new_configuration: z.boolean(),
  status: StatusSchema,
  version: z.number().int().positive(),
  updated_at: z.string(),
});
const CustomSceneRouteResultSchema = z.object({
  scene: SceneRecordSchema,
  route: z.object({
    id: z.string(), scene_code: z.string(), name: z.string(),
    primary_model_id: z.string().nullable(), fallback_model_id: z.string().nullable(),
    quality_tier: z.enum(["fast", "balanced", "quality"]), modality: ModalitySchema,
    temperature: z.number().nullable(), response_format: z.enum(["json_object", "text"]).nullable(),
    timeout_ms: z.number().nullable(), status: StatusSchema, version: z.number().int().positive(),
    created_at: z.string(), updated_at: z.string(),
  }),
});

export type AiSceneRecord = z.infer<typeof SceneRecordSchema>;
/** Compatibility view for callers migrating from the read-only system registry. */
export type AiSystemSceneRecord = Omit<AiSceneRecord, "status" | "version" | "updated_at">
  & Partial<Pick<AiSceneRecord, "status" | "version" | "updated_at">>;
export type AiSceneListQuery = SystemAiSceneListQuery & {
  keyword?: string;
  source?: AiSceneRecord["source"];
  status?: AiSceneRecord["status"];
};
export type UpdateAiCustomScenePayload = Partial<Pick<AiSceneRecord, "name" | "status">>
  & { expected_version: number };
export type CreateCustomSceneRouteCommand = AiSceneRoutePayload & {
  name: string;
  modality: AiSceneRecord["modality"];
};
export type CustomSceneRouteResult = {
  scene: AiSceneRecord;
  route: AiSceneRouteRecord;
};

type SceneRegistryClient = {
  from: (table: "ai_system_scenes") => SceneRegistryQueryBuilder;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<SceneRegistryQueryResult>;
};

type SceneRegistryQueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type SceneRegistryQueryBuilder = {
  select: (...args: unknown[]) => SceneRegistryQueryBuilder;
  eq: (...args: unknown[]) => SceneRegistryQueryBuilder;
  or: (...args: unknown[]) => SceneRegistryQueryBuilder;
  update: (...args: unknown[]) => SceneRegistryQueryBuilder;
  order: (...args: unknown[]) => SceneRegistryQueryBuilder;
  range: (...args: unknown[]) => SceneRegistryQueryBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<SceneRegistryQueryResult>["then"];
};

const SYSTEM_SCENE_SELECT = [
  "code",
  "name",
  "modality",
  "required_input_modalities",
  "runtime_status",
  "requirements_source",
  "requires_streaming",
  "min_reference_images",
  "source",
  "allow_new_configuration",
  "status",
  "version",
  "updated_at",
].join(",");

function sceneCommandError(error: unknown, operation: string) {
  if (isAiModelModalityReferenceError(error)) {
    return Errors.business(409, "AI 模型模态与场景路由不匹配", "AI_ROUTE_MODEL_MODALITY_MISMATCH");
  }
  if (error && typeof error === "object") {
    const envelope = error as { code?: unknown; message?: unknown };
    if (envelope.code === "PGRST116" || (envelope.code === "40001" && envelope.message === "ai_config_version_stale")) {
      return Errors.business(409, "配置版本已变化，请重新加载后再保存", "AI_CONFIG_VERSION_STALE");
    }
    if (envelope.code === "P0002" && envelope.message === "ai_custom_scene_not_found") {
      return Errors.business(404, "自定义 AI 场景不存在", "AI_CUSTOM_SCENE_NOT_FOUND");
    }
    if (envelope.code === "23503" && envelope.message === "ai_custom_scene_in_use") {
      return Errors.business(409, "自定义 AI 场景仍有路由或调用记录引用，请改用停用", "AI_CUSTOM_SCENE_IN_USE");
    }
  }
  return Errors.dbError(`${operation}失败`);
}

export class AiSceneRegistryRepository {
  constructor(
    private readonly client: SceneRegistryClient = SupabaseDB.getAdminClient() as unknown as SceneRegistryClient,
  ) {}

  async list(query: AiSceneListQuery): Promise<Page<AiSceneRecord>> {
    const parsed = PaginationQuerySchema.safeParse(query);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const { page, pageSize } = parsed.data;
    const from = (page - 1) * pageSize;
    let request = this.client.from("ai_system_scenes").select(SYSTEM_SCENE_SELECT, { count: "exact" });
    if (query.source) request = request.eq("source", query.source);
    if (query.status) request = request.eq("status", query.status);
    if (query.keyword) {
      // Escape SQL LIKE literals first, then encode the entire quoted PostgREST
      // value so its parser preserves the backslashes required by SQL LIKE.
      const pattern = `%${query.keyword.trim().replace(/[\\%_]/g, "\\$&")}%`;
      const keyword = `"${pattern.replace(/[\\"]/g, "\\$&")}"`;
      request = request.or(`name.ilike.${keyword},code.ilike.${keyword}`);
    }
    const { data, error, count } = await request
      .order("source", { ascending: false })
      .order("code", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw Errors.dbError("查询 AI 系统场景失败");

    const total = count ?? 0;
    return {
      list: (data || []) as AiSceneRecord[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }

  async getByCode(code: string): Promise<AiSceneRecord | null> {
    const { data, error } = await this.client.from("ai_system_scenes")
      .select(SYSTEM_SCENE_SELECT)
      .eq("code", code)
      .maybeSingle();
    if (error) throw Errors.dbError("查询 AI 系统场景失败", error);
    return data as AiSceneRecord | null;
  }

  async updateCustom(code: string, input: UpdateAiCustomScenePayload): Promise<AiSceneRecord> {
    const payload: Partial<Pick<AiSceneRecord, "name" | "status">> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.status !== undefined) payload.status = input.status;
    const { data, error } = await this.client.from("ai_system_scenes")
      .update(payload)
      .eq("code", code)
      .eq("source", "custom")
      .eq("version", input.expected_version)
      .select(SYSTEM_SCENE_SELECT)
      .single();
    if (error) throw sceneCommandError(error, "更新自定义 AI 场景");
    if (!data) throw sceneCommandError({ code: "PGRST116" }, "更新自定义 AI 场景");
    return data as AiSceneRecord;
  }

  async createCustomSceneRoute(input: CreateCustomSceneRouteCommand): Promise<CustomSceneRouteResult> {
    const { data, error } = await this.client.rpc("create_ai_custom_scene_route", {
      p_scene_code: input.scene_code,
      p_scene_name: input.name,
      p_modality: input.modality,
      p_quality_tier: input.quality_tier,
      p_primary_model_id: input.primary_model_id ?? null,
      p_fallback_model_id: input.fallback_model_id ?? null,
      p_temperature: input.temperature ?? null,
      p_response_format: input.response_format ?? null,
      p_timeout_ms: input.timeout_ms ?? null,
      p_status: input.status,
    });
    if (error) throw sceneCommandError(error, "创建自定义 AI 场景路由");
    const parsed = CustomSceneRouteResultSchema.safeParse(data);
    if (!parsed.success) throw Errors.dbError("创建自定义 AI 场景路由返回格式无效");
    return parsed.data;
  }

  async deleteCustom(code: string, expectedVersion: number): Promise<{ code: string; deleted: true }> {
    const { data, error } = await this.client.rpc("delete_ai_custom_scene", {
      p_scene_code: code, p_expected_version: expectedVersion,
    });
    if (error) throw sceneCommandError(error, "删除自定义 AI 场景");
    if (data !== code) throw Errors.dbError("删除自定义 AI 场景返回格式无效");
    return { code, deleted: true };
  }
}

export { AiSceneRegistryRepository as AiSystemSceneRepository };
export const aiSceneRegistryRepository = new AiSceneRegistryRepository();
export const aiSystemSceneRepository: {
  list(query: AiSceneListQuery): Promise<Page<AiSystemSceneRecord>>;
  getByCode(code: string): Promise<AiSystemSceneRecord | null>;
} = aiSceneRegistryRepository;
