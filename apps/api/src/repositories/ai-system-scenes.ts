import { Errors } from "@/errors/error-factory";
import type { SystemAiSceneListQuery } from "@/schema/ai-config";
import { SupabaseDB } from "@/utils/supabase";

export type AiSystemSceneRecord = {
  code: string;
  name: string;
  modality: "text" | "image" | "video" | "speech";
  required_input_modalities: Array<"text" | "image" | "video" | "speech">;
  runtime_status: "connected" | "not_connected";
  requirements_source: "runtime" | "planned_adapter";
  requires_streaming: boolean;
  min_reference_images: number;
  source: "system" | "legacy";
  allow_new_configuration: boolean;
};

type SceneRegistryClient = {
  from: (table: "ai_system_scenes") => SceneRegistryQueryBuilder;
};

type SceneRegistryQueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type SceneRegistryQueryBuilder = {
  select: (...args: unknown[]) => SceneRegistryQueryBuilder;
  eq: (...args: unknown[]) => SceneRegistryQueryBuilder;
  order: (...args: unknown[]) => SceneRegistryQueryBuilder;
  range: (...args: unknown[]) => SceneRegistryQueryBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
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
].join(",");

function pageRange(query: SystemAiSceneListQuery) {
  const from = (query.page - 1) * query.pageSize;
  return { from, to: from + query.pageSize - 1 };
}

export class AiSystemSceneRepository {
  constructor(
    private readonly client: SceneRegistryClient = SupabaseDB.getAdminClient() as unknown as SceneRegistryClient,
  ) {}

  async list(query: SystemAiSceneListQuery) {
    const { from, to } = pageRange(query);
    const { data, error, count } = await this.client.from("ai_system_scenes")
      .select(SYSTEM_SCENE_SELECT, { count: "exact" })
      .order("source", { ascending: false })
      .order("code", { ascending: true })
      .range(from, to);
    if (error) throw Errors.dbError("查询 AI 系统场景失败", error);

    const total = count ?? 0;
    return {
      list: (data || []) as AiSystemSceneRecord[],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

  async getByCode(code: string): Promise<AiSystemSceneRecord | null> {
    const { data, error } = await this.client.from("ai_system_scenes")
      .select(SYSTEM_SCENE_SELECT)
      .eq("code", code)
      .maybeSingle();
    if (error) throw Errors.dbError("查询 AI 系统场景失败", error);
    return data as AiSystemSceneRecord | null;
  }
}

export const aiSystemSceneRepository = new AiSystemSceneRepository();
