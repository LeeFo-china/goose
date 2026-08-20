import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type {
  TenantDouyinProjectListQuery,
  TenantDouyinProjectPublicationInput,
} from "@/schema/tenant-douyin-projects";
import { SupabaseDB } from "@/utils/supabase";

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
const PROFILE_RETURN_FIELDS = [
  "id",
  "tenant_id",
  "project_id",
  PROFILE_FIELDS,
].join(",");
const ATTACHED_IMAGE_LOG_LIMIT = 100;

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
}).strict();

type DatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};
export interface TenantDouyinProjectsQuery extends PromiseLike<DatabaseResult> {
  select(...args: unknown[]): TenantDouyinProjectsQuery;
  eq(...args: unknown[]): TenantDouyinProjectsQuery;
  order(...args: unknown[]): TenantDouyinProjectsQuery;
  range(...args: unknown[]): TenantDouyinProjectsQuery;
  limit(...args: unknown[]): TenantDouyinProjectsQuery;
  upsert(...args: unknown[]): TenantDouyinProjectsQuery;
  maybeSingle(): Promise<DatabaseResult>;
  single(): Promise<DatabaseResult>;
}
export interface TenantDouyinProjectsDatabaseClient {
  from(table: string): TenantDouyinProjectsQuery;
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
    const result = await query
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + input.pageSize - 1);
    assertDatabaseSuccess(result, "查询租户抖音项目失败");
    if (!Number.isInteger(result.count) || result.count! < 0) {
      throw Errors.dbError("查询租户抖音项目总数失败", result.count);
    }
    return {
      rows: parseData(z.array(ProjectListRowSchema), result.data,
        "解析租户抖音项目失败"),
      total: result.count!,
    };
  }

  async findProject(input: { tenantId: string; projectId: string }) {
    const result = await this.client.from("projects")
      .select("id,tenant_id")
      .eq("id", input.projectId)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    assertDatabaseSuccess(result, "查询租户项目失败");
    if (result.data === null) return null;
    return parseData(ProjectOwnershipSchema, result.data, "解析租户项目失败");
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
    const result = await this.client.from("project_logs")
      .select("images")
      .eq("tenant_id", input.tenantId)
      .eq("project_id", input.projectId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    assertDatabaseSuccess(result, "查询项目图片失败");
    return parseData(
      z.array(AttachedImageRowSchema),
      result.data ?? [],
      "解析项目图片失败",
    );
  }

  async upsertProfile(input: {
    tenantId: string;
    projectId: string;
    profile: TenantDouyinProjectPublicationInput;
  }) {
    const result = await this.client.from("douyin_project_public_profiles")
      .upsert({
        tenant_id: input.tenantId,
        project_id: input.projectId,
        ...input.profile,
      }, { onConflict: "tenant_id,project_id" })
      .select(PROFILE_RETURN_FIELDS)
      .single();
    assertDatabaseSuccess(result, "保存抖音项目公开资料失败");
    return parseData(SavedProfileSchema, result.data, "解析抖音项目公开资料失败");
  }
}

function assertDatabaseSuccess(result: DatabaseResult, message: string): void {
  if (result.error) throw Errors.dbError(message, result.error);
}

function parseData<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Errors.dbError(message, parsed.error.issues);
  return parsed.data;
}

export const tenantDouyinProjectsRepository =
  new TenantDouyinProjectsRepository();
