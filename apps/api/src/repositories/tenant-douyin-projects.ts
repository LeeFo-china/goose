import { z } from "zod";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type {
  TenantDouyinProjectListQuery,
  TenantDouyinProjectPublicationInput,
} from "@/schema/tenant-douyin-projects";
import type { Database } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";
import { PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE } from "@gooes/domain";

const PROFILE_FIELDS = [
  "public_title",
  "public_description",
  "public_image_urls",
  "style_tags",
  "budget_band",
  "publication_status",
  "updated_at",
].join(",");
const PROJECT_FIELDS = [
  "id",
  "name",
  "status",
  "updated_at",
  "property:properties(community,layout,area)",
].join(",");
const ATTACHED_IMAGE_LOG_LIMIT = 100;
const PUBLICATION_RPC_NAME = "upsert_douyin_project_public_profile";
const PUBLICATION_RPC_ERROR_CODES = [
  "DOUYIN_PROJECT_PUBLICATION_INVALID",
  "DOUYIN_PROJECT_NOT_FOUND",
  "DOUYIN_PROJECT_IMAGE_REFERENCE_SCOPE_MISMATCH",
  "DOUYIN_PROJECT_IMAGE_NOT_ATTACHED",
  "DOUYIN_PROJECT_PUBLICATION_IMAGES_REQUIRED",
] as const;

const NullableStringSchema = z.string().nullable();
const ProfileSchema = z.strictObject({
  public_title: z.string(),
  public_description: z.string(),
  public_image_urls: z.array(z.string()),
  style_tags: z.array(z.string()),
  budget_band: NullableStringSchema,
  publication_status: z.enum(["draft", "published", "hidden"]),
  updated_at: z.string(),
});
const ProjectListRowSchema = z.strictObject({
  id: z.uuid(),
  name: NullableStringSchema,
  status: NullableStringSchema,
  updated_at: z.string(),
  property: z.strictObject({
    community: z.string(),
    layout: NullableStringSchema,
    area: z.union([z.number(), z.string()]).nullable(),
  }).nullable(),
  public_profile: ProfileSchema.nullable(),
});
const ProjectOwnershipSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
});
const AttachedImageRowSchema = z.strictObject({ images: z.unknown() });
const SavedProfileSchema = ProfileSchema.extend({
  id: z.uuid(),
  tenant_id: z.uuid(),
  project_id: z.uuid(),
  created_at: z.string(),
}).strict();
const AcceptanceProjectRowSchema = z.strictObject({
  project_id: z.uuid().nullable(),
});
const WorkflowStateRowSchema = z.strictObject({
  subject_id: z.uuid(),
  instance_status: z.string().nullable(),
  current_node_title: z.string().nullable(),
});
const PublicationRpcErrorSchema = z.strictObject({
  status_code: z.union([z.literal(400), z.literal(404)]),
  code: z.enum(PUBLICATION_RPC_ERROR_CODES),
  message: z.string().trim().min(1).max(1000),
});
const PublicationRpcEnvelopeSchema = z.union([
  z.strictObject({ data: SavedProfileSchema }),
  z.strictObject({ error: PublicationRpcErrorSchema }),
]);

export type TenantDouyinProfileCommandResult =
  | { readonly ok: true; readonly data: z.infer<typeof SavedProfileSchema> }
  | { readonly ok: false; readonly error: z.infer<typeof PublicationRpcErrorSchema> };

type DatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};
export interface TenantDouyinProjectsQuery extends PromiseLike<DatabaseResult> {
  select(...args: unknown[]): TenantDouyinProjectsQuery;
  eq(...args: unknown[]): TenantDouyinProjectsQuery;
  in(...args: unknown[]): TenantDouyinProjectsQuery;
  order(...args: unknown[]): TenantDouyinProjectsQuery;
  range(...args: unknown[]): TenantDouyinProjectsQuery;
  limit(...args: unknown[]): TenantDouyinProjectsQuery;
  maybeSingle(): Promise<DatabaseResult>;
}
type GeneratedPublicationRpcArgs = Database["public"]["Functions"][
  "upsert_douyin_project_public_profile"
]["Args"];
type PublicationRpcArgs = Omit<
  GeneratedPublicationRpcArgs,
  "p_budget_band" | "p_publication_status"
> & {
  readonly p_budget_band: string | null;
  readonly p_publication_status: "draft" | "published" | "hidden";
};
export interface TenantDouyinProjectsDatabaseClient {
  from(table: string): TenantDouyinProjectsQuery;
  rpc(
    functionName: typeof PUBLICATION_RPC_NAME,
    args: PublicationRpcArgs,
  ): Promise<DatabaseResult>;
}

export class TenantDouyinProjectsRepository {
  constructor(
    private readonly configuredClient?: TenantDouyinProjectsDatabaseClient,
  ) {}

  private get client(): TenantDouyinProjectsDatabaseClient {
    return this.configuredClient
      ?? SupabaseDB.getAdminClient() as unknown as TenantDouyinProjectsDatabaseClient;
  }

  async listProjects(
    input: TenantDouyinProjectListQuery & { tenantId: string },
  ) {
    const result = await executeDatabase(async () => {
      const profileRelation = input.publicationStatus
        ? `public_profile:douyin_project_public_profiles!inner(${PROFILE_FIELDS})`
        : `public_profile:douyin_project_public_profiles(${PROFILE_FIELDS})`;
      let query = this.client.from("projects")
        .select(`${PROJECT_FIELDS},${profileRelation}`, { count: "exact" })
        .eq("tenant_id", input.tenantId);
      if (input.publicationStatus) {
        query = query.eq(
          "public_profile.publication_status",
          input.publicationStatus,
        );
      }
      const from = (input.page - 1) * input.pageSize;
      return await query
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + input.pageSize - 1);
    }, "查询租户抖音项目失败");
    assertDatabaseSuccess(result, "查询租户抖音项目失败");
    if (!Number.isInteger(result.count) || result.count! < 0) {
      throw Errors.dbError("查询租户抖音项目总数失败");
    }
    return {
      rows: parseData(z.array(ProjectListRowSchema), result.data,
        "解析租户抖音项目失败"),
      total: result.count!,
    };
  }

  async findProject(input: { tenantId: string; projectId: string }) {
    const result = await executeDatabase(
      () => this.client.from("projects")
        .select("id,tenant_id")
        .eq("id", input.projectId)
        .eq("tenant_id", input.tenantId)
        .maybeSingle(),
      "查询租户项目失败",
    );
    assertDatabaseSuccess(result, "查询租户项目失败");
    if (result.data === null) return null;
    return parseData(ProjectOwnershipSchema, result.data, "解析租户项目失败");
  }

  async listFinalAcceptanceCompletedProjectIds(input: {
    tenantId: string;
    projectIds: readonly string[];
  }): Promise<Set<string>> {
    const projectIds = [...new Set(input.projectIds)].slice(0, 100);
    if (projectIds.length === 0) return new Set();
    const result = await executeDatabase(
      () => this.client.from("project_acceptances")
        .select("project_id")
        .eq("tenant_id", input.tenantId)
        .in("project_id", projectIds)
        .eq("stage_code", PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE)
        .eq("status", "customer_confirmed"),
      "查询项目竣工验收完成状态失败",
    );
    assertDatabaseSuccess(result, "查询项目竣工验收完成状态失败");
    const rows = parseData(
      z.array(AcceptanceProjectRowSchema),
      result.data ?? [],
      "解析项目竣工验收完成状态失败",
    );
    return new Set(rows.flatMap((row) => row.project_id ? [row.project_id] : []));
  }

  async listWorkflowStatesByProjectIds(input: {
    tenantId: string;
    projectIds: readonly string[];
  }) {
    const projectIds = [...new Set(input.projectIds)].slice(0, 100);
    if (projectIds.length === 0) return [];
    const result = await executeDatabase(
      () => this.client.from("workflow_subject_states")
        .select("subject_id,instance_status,current_node_title")
        .eq("tenant_id", input.tenantId)
        .eq("subject_type", "project")
        .in("subject_id", projectIds),
      "查询项目当前工序失败",
    );
    assertDatabaseSuccess(result, "查询项目当前工序失败");
    return parseData(
      z.array(WorkflowStateRowSchema),
      result.data ?? [],
      "解析项目当前工序失败",
    );
  }

  async listAttachedImageRows(input: {
    tenantId: string;
    projectId: string;
    limit: number;
  }) {
    const limit = Math.min(
      ATTACHED_IMAGE_LOG_LIMIT,
      Math.max(1, Math.trunc(input.limit)),
    );
    const result = await executeDatabase(
      () => this.client.from("project_logs")
        .select("images")
        .eq("tenant_id", input.tenantId)
        .eq("project_id", input.projectId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit),
      "查询项目图片失败",
    );
    assertDatabaseSuccess(result, "查询项目图片失败");
    return parseData(
      z.array(AttachedImageRowSchema),
      result.data ?? [],
      "解析项目图片失败",
    );
  }

  async publishProfileAtomic(input: {
    tenantId: string;
    projectId: string;
    profile: TenantDouyinProjectPublicationInput;
  }): Promise<TenantDouyinProfileCommandResult> {
    // The SQL function accepts nullable text even though the checked-in generated
    // declaration currently narrows p_budget_band to string.
    const result = await executeDatabase(
      () => this.client.rpc(PUBLICATION_RPC_NAME, {
        p_tenant_id: input.tenantId,
        p_project_id: input.projectId,
        p_public_title: input.profile.public_title,
        p_public_description: input.profile.public_description,
        p_public_image_urls: input.profile.public_image_urls,
        p_style_tags: input.profile.style_tags,
        p_budget_band: input.profile.budget_band ?? null,
        p_publication_status: input.profile.publication_status,
      }),
      "原子保存抖音项目公开资料失败",
    );
    assertDatabaseSuccess(result, "原子保存抖音项目公开资料失败");
    const envelope = parseData(
      PublicationRpcEnvelopeSchema,
      result.data,
      "解析抖音项目公开资料命令结果失败",
    );
    return "data" in envelope
      ? { ok: true, data: envelope.data }
      : { ok: false, error: envelope.error };
  }
}

function assertDatabaseSuccess(result: DatabaseResult, message: string): void {
  if (result.error) throw Errors.dbError(message);
}

function parseData<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Errors.dbError(message);
  return parsed.data;
}

async function executeDatabase<T>(
  operation: () => T | PromiseLike<T>,
  message: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.dbError(message);
  }
}

export const tenantDouyinProjectsRepository =
  new TenantDouyinProjectsRepository();
