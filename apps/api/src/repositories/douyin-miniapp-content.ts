import { z } from "zod";
import { TENANT_STATUS_VALUES } from "@gooes/domain";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const PROJECT_SELECT = [
  "id", "status", "start_date", "updated_at",
  "property:properties!inner(community,layout,area,city,district)",
  "public_profile:douyin_project_public_profiles!inner(public_title,"
    + "public_description,public_image_urls,style_tags,budget_band,"
    + "publication_status,updated_at)",
].join(",");
const COMPANY_SELECT = [
  "public_name", "introduction", "public_phone", "address_province",
  "address_city", "address_district", "address", "status", "published_at",
].join(",");
const AREA_SELECT = "province,city,district,priority";
const INSTALLATION_SELECT = [
  "id", "tenant_id", "authorizer_appid", "authorization_status", "installation_kind",
  "template_version", "runtime_config", "tenant:tenants(id,status)",
].join(",");
const LOG_SELECT = "id,stage_code,node_name,images,created_at";
const PROJECT_IMAGE_LOG_SELECT = "project_id,images,created_at";
const PROJECT_IMAGE_LOGS_PER_PROJECT = 20;
const MAX_PROJECT_IMAGE_LOGS = 2_000;
const IN_PROGRESS_STATUSES = ["started", "constructing"] as const;
const PUBLIC_PROJECT_STATUSES = [...IN_PROGRESS_STATUSES, "acceptance"] as const;

const NullableString = z.string().nullable();
const InstallationSchema = z.object({
  id: z.uuid(), tenant_id: z.uuid(), authorizer_appid: z.string().min(1),
  authorization_status: z.literal("active"), template_version: NullableString,
  installation_kind: z.enum(["merchant", "template_development"]),
  runtime_config: z.unknown(),
  tenant: z.object({ id: z.uuid(), status: z.enum(TENANT_STATUS_VALUES) }),
}).strict();
const CompanySchema = z.object({
  public_name: z.string().min(1), introduction: NullableString,
  public_phone: z.string().min(1), address_province: NullableString,
  address_city: NullableString, address_district: NullableString,
  address: NullableString, status: z.literal("published"), published_at: z.string().min(1),
}).strict();
const AreaSchema = z.object({
  province: NullableString, city: z.string().min(1), district: NullableString,
  priority: z.number().int(),
}).strict();
const PropertySchema = z.object({
  community: z.string(), layout: NullableString,
  area: z.union([z.number(), z.string()]).nullable(),
  city: NullableString, district: NullableString,
}).strict();
const PublicProjectProfileSchema = z.object({
  public_title: z.string().min(1), public_description: z.string().min(1),
  public_image_urls: z.array(z.string()), style_tags: z.array(z.string()),
  budget_band: NullableString, publication_status: z.literal("published"),
  updated_at: z.string().min(1),
}).strict();
const ProjectSchema = z.object({
  id: z.uuid(), status: NullableString, start_date: NullableString,
  updated_at: z.string(), property: PropertySchema,
  public_profile: PublicProjectProfileSchema,
}).strict().transform((project) => ({
  ...project,
  name: project.public_profile.public_title,
  budget: null,
  style_tags: project.public_profile.style_tags,
}));
const LogSchema = z.object({
  id: z.uuid(), stage_code: NullableString, node_name: NullableString,
  images: z.unknown(), created_at: z.string(),
}).strict();
const ProjectImageLogSchema = z.object({
  project_id: z.uuid(), images: z.unknown(), created_at: z.string(),
}).strict();
const WorkflowStateSchema = z.object({
  subject_id: z.uuid(),
  instance_status: NullableString,
  current_node_title: NullableString,
}).strict();

export type DouyinContentInstallation = z.infer<typeof InstallationSchema>;
export type DouyinContentCompany = z.infer<typeof CompanySchema>;
export type DouyinContentArea = z.infer<typeof AreaSchema>;
export type DouyinContentProject = z.infer<typeof ProjectSchema>;
export type DouyinContentLog = z.infer<typeof LogSchema>;
export type DouyinContentProjectImageLog = z.infer<typeof ProjectImageLogSchema>;
export type DouyinContentWorkflowState = z.infer<typeof WorkflowStateSchema>;
type PageInput = { tenantId: string; page: number; pageSize: number };
type CaseListInput = PageInput & { style?: string; layout?: string };
type ProjectPhase = "in_progress" | "completed";
type ProjectListInput = CaseListInput & { phase?: ProjectPhase };
type ProjectListResult = { rows: DouyinContentProject[]; count: number };
type LegacyProjectListResult = { rows: DouyinContentProject[]; total: number };
type DatabaseResult = { data: unknown; error: unknown; count?: number | null };

export interface DouyinContentQuery extends PromiseLike<DatabaseResult> {
  select(...args: unknown[]): DouyinContentQuery;
  eq(...args: unknown[]): DouyinContentQuery;
  neq(...args: unknown[]): DouyinContentQuery;
  in(...args: unknown[]): DouyinContentQuery;
  or(...args: unknown[]): DouyinContentQuery;
  contains(...args: unknown[]): DouyinContentQuery;
  order(...args: unknown[]): DouyinContentQuery;
  range(...args: unknown[]): DouyinContentQuery;
  limit(...args: unknown[]): DouyinContentQuery;
  maybeSingle(): Promise<DatabaseResult>;
}
export interface DouyinContentDatabaseClient {
  from(table: string): DouyinContentQuery;
}

export class DouyinMiniappContentRepository {
  constructor(private readonly configuredClient?: DouyinContentDatabaseClient) {}

  private get client(): DouyinContentDatabaseClient {
    return this.configuredClient
      ?? SupabaseDB.getAdminClient() as unknown as DouyinContentDatabaseClient;
  }

  findActiveInstallation(input: { installationId: string; tenantId: string; appId: string }) {
    return this.findOne("douyin_miniapp_installations", INSTALLATION_SELECT,
      InstallationSchema, "查询抖音公开内容安装失败", (query) => query
        .eq("id", input.installationId).eq("tenant_id", input.tenantId)
        .eq("authorizer_appid", input.appId).eq("authorization_status", "active"));
  }

  findPublishedCompany(tenantId: string) {
    return this.findOne("tenant_service_provider_profiles", COMPANY_SELECT, CompanySchema,
      "查询装修公司公开资料失败", (query) => query.eq("tenant_id", tenantId)
        .eq("status", "published"));
  }

  async listServiceAreas(tenantId: string): Promise<DouyinContentArea[]> {
    return execute("查询装修公司服务区域失败", async () => {
      // 公开公司资料仅展示前 50 个启用区域，不返回无上限辅助列表。
      const result = await this.client.from("tenant_service_areas").select(AREA_SELECT)
        .eq("tenant_id", tenantId).eq("status", "active")
        .order("priority", { ascending: false }).order("id", { ascending: true }).limit(50);
      return parseRows(AreaSchema, result);
    });
  }

  async listProjects(input: ProjectListInput): Promise<ProjectListResult> {
    return execute("查询抖音公开项目失败", async () => {
      const result = await this.publicProjects(input, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false }).range(...pageRange(input));
      return { rows: parseRows(ProjectSchema, result), count: validCount(result.count) };
    });
  }

  findProject(input: { tenantId: string; id: string }): Promise<DouyinContentProject | null> {
    return execute("查询抖音公开项目失败", async () => {
      const result = await this.publicProjects(input).eq("id", input.id).maybeSingle();
      return parseOne(ProjectSchema, result);
    });
  }

  async listCases(input: CaseListInput): Promise<LegacyProjectListResult> {
    const result = await this.listProjects(input);
    return { rows: result.rows, total: result.count };
  }

  async listSites(input: PageInput): Promise<LegacyProjectListResult> {
    const result = await this.listProjects({ ...input, phase: "in_progress" });
    return { rows: result.rows, total: result.count };
  }

  findCase(input: { tenantId: string; id: string }) {
    return this.findProject(input);
  }

  findSite(input: { tenantId: string; id: string }) {
    return this.findProject(input);
  }

  async listSiteLogs(input: PageInput & { projectId: string }) {
    return execute("查询抖音公开施工进度失败", async () => {
      const result = await this.client.from("project_logs")
        .select(LOG_SELECT, { count: "exact" }).eq("tenant_id", input.tenantId)
        .eq("project_id", input.projectId).order("created_at", { ascending: false })
        .order("id", { ascending: false }).range(...pageRange(input));
      return { rows: parseRows(LogSchema, result), total: validCount(result.count) };
    });
  }

  async listProjectImageLogs(input: { tenantId: string; projectIds: readonly string[] }) {
    return execute("查询抖音公开项目图片失败", async () => {
      const projectIds = [...new Set(input.projectIds)].slice(0, 100);
      if (projectIds.length === 0) return [] as DouyinContentProjectImageLog[];
      const limit = Math.min(
        projectIds.length * PROJECT_IMAGE_LOGS_PER_PROJECT,
        MAX_PROJECT_IMAGE_LOGS,
      );
      const result = await this.client.from("project_logs")
        .select(PROJECT_IMAGE_LOG_SELECT).eq("tenant_id", input.tenantId)
        .in("project_id", projectIds).order("created_at", { ascending: false })
        .limit(limit);
      return parseRows(ProjectImageLogSchema, result);
    });
  }

  async listWorkflowStatesByProjectIds(input: {
    tenantId: string;
    projectIds: readonly string[];
  }) {
    return execute("查询抖音公开项目当前工序失败", async () => {
      const projectIds = [...new Set(input.projectIds)].slice(0, 100);
      if (projectIds.length === 0) return [] as DouyinContentWorkflowState[];
      const result = await this.client.from("workflow_subject_states")
        .select("subject_id,instance_status,current_node_title")
        .eq("tenant_id", input.tenantId)
        .eq("subject_type", "project")
        .in("subject_id", projectIds);
      return parseRows(WorkflowStateSchema, result);
    });
  }

  private publicProjects(
    input: { tenantId: string; phase?: ProjectPhase; style?: string; layout?: string },
    options?: { count: "exact" },
  ) {
    let query = this.client.from("projects").select(PROJECT_SELECT, options)
      .eq("tenant_id", input.tenantId)
      .eq("public_profile.publication_status", "published");
    if (input.phase === "in_progress") {
      query = query.in("status", IN_PROGRESS_STATUSES);
    } else if (input.phase === "completed") {
      query = query.eq("status", "acceptance");
    } else {
      query = query.in("status", PUBLIC_PROJECT_STATUSES);
    }
    if (input.style) query = query.contains("public_profile.style_tags", [input.style]);
    if (input.layout) query = query.eq("property.layout", input.layout);
    return query;
  }

  private findOne<T>(table: string, select: string, schema: z.ZodType<T>, message: string,
    filter: (query: DouyinContentQuery) => DouyinContentQuery) {
    return execute(message, async () => {
      const result = await filter(this.client.from(table).select(select)).maybeSingle();
      return parseOne(schema, result);
    });
  }
}

function parseRows<T>(schema: z.ZodType<T>, result: DatabaseResult): T[] {
  assertSuccess(result);
  const parsed = z.array(schema).safeParse(result.data ?? []);
  if (!parsed.success) throw responseInvalid();
  return parsed.data;
}
function parseOne<T>(schema: z.ZodType<T>, result: DatabaseResult): T | null {
  assertSuccess(result);
  if (result.data === null) return null;
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw responseInvalid();
  return parsed.data;
}
function assertSuccess(result: DatabaseResult) {
  if (result.error) throw responseFailed();
}
function validCount(value: number | null | undefined) {
  if (!Number.isInteger(value) || value! < 0) throw responseInvalid();
  return value!;
}
function pageRange(input: { page: number; pageSize: number }): [number, number] {
  const from = (input.page - 1) * input.pageSize;
  return [from, from + input.pageSize - 1];
}
async function execute<T>(message: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.business(500, message, "DOUYIN_CONTENT_REPOSITORY_ERROR");
  }
}
function responseFailed() {
  return Errors.business(500, "抖音公开内容查询失败", "DOUYIN_CONTENT_REPOSITORY_ERROR");
}
function responseInvalid() {
  return Errors.business(500, "抖音公开内容数据无效", "DOUYIN_CONTENT_RESPONSE_INVALID");
}

export const douyinMiniappContentRepository = new DouyinMiniappContentRepository();
