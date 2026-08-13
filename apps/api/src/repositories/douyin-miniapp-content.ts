import { z } from "zod";
import { TENANT_STATUS_VALUES } from "@gooes/domain";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

const PROJECT_SELECT = [
  "id", "name", "status", "budget", "start_date", "created_at", "updated_at",
  "style_tags",
  "property:properties!inner(community,layout,area,city,district)",
].join(",");
const COMPANY_SELECT = [
  "public_name", "introduction", "public_phone", "address_province",
  "address_city", "address_district", "address", "status", "published_at",
].join(",");
const AREA_SELECT = "province,city,district,priority";
const INSTALLATION_SELECT = [
  "id", "tenant_id", "authorizer_appid", "authorization_status", "template_version",
  "runtime_config", "tenant:tenants(id,status)",
].join(",");
const LOG_SELECT = "id,stage_code,node_name,images,created_at";
const PROJECT_IMAGE_LOG_SELECT = "project_id,images,created_at";
const PROJECT_IMAGE_LOGS_PER_PROJECT = 20;
const MAX_PROJECT_IMAGE_LOGS = 2_000;
const PUBLIC_STATUSES = [
  "signed", "design_finalized", "pending_start", "started", "constructing", "acceptance",
].join(",");

const NullableString = z.string().nullable();
const InstallationSchema = z.object({
  id: z.uuid(), tenant_id: z.uuid(), authorizer_appid: z.string().min(1),
  authorization_status: z.literal("active"), template_version: NullableString,
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
const ProjectSchema = z.object({
  id: z.uuid(), name: NullableString, status: NullableString,
  budget: z.union([z.number(), z.string()]).nullable(), start_date: NullableString,
  created_at: NullableString, updated_at: z.string(), style_tags: z.unknown(),
  property: PropertySchema,
}).strict();
const LogSchema = z.object({
  id: z.uuid(), stage_code: NullableString, node_name: NullableString,
  images: z.unknown(), created_at: z.string(),
}).strict();
const ProjectImageLogSchema = z.object({
  project_id: z.uuid(), images: z.unknown(), created_at: z.string(),
}).strict();

export type DouyinContentInstallation = z.infer<typeof InstallationSchema>;
export type DouyinContentCompany = z.infer<typeof CompanySchema>;
export type DouyinContentArea = z.infer<typeof AreaSchema>;
export type DouyinContentProject = z.infer<typeof ProjectSchema>;
export type DouyinContentLog = z.infer<typeof LogSchema>;
export type DouyinContentProjectImageLog = z.infer<typeof ProjectImageLogSchema>;
type PageInput = { tenantId: string; page: number; pageSize: number };
type CaseListInput = PageInput & { style?: string; layout?: string };
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

  listCases(input: CaseListInput) {
    let query = this.publicProjects(input.tenantId, { count: "exact" });
    if (input.style) query = query.contains("style_tags", [input.style]);
    if (input.layout) query = query.eq("property.layout", input.layout);
    return this.listProjects(query, input, "查询抖音装修案例失败");
  }

  listSites(input: PageInput) {
    const query = this.client.from("projects").select(PROJECT_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId).neq("visibility_status", "hidden")
      .in("status", ["started", "constructing"]);
    return this.listProjects(query, input, "查询抖音在建工地失败");
  }

  findCase(input: { tenantId: string; id: string }) {
    return this.findProject(this.publicProjects(input.tenantId).eq("id", input.id),
      "查询抖音装修案例失败");
  }

  findSite(input: { tenantId: string; id: string }) {
    const query = this.client.from("projects").select(PROJECT_SELECT)
      .eq("tenant_id", input.tenantId).eq("id", input.id)
      .neq("visibility_status", "hidden").in("status", ["started", "constructing"]);
    return this.findProject(query, "查询抖音在建工地失败");
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

  private publicProjects(tenantId: string, options?: { count: "exact" }) {
    return this.client.from("projects").select(PROJECT_SELECT, options)
      .eq("tenant_id", tenantId).neq("visibility_status", "hidden")
      .or(`status.in.(${PUBLIC_STATUSES}),visibility_status.eq.public`);
  }

  private async listProjects(query: DouyinContentQuery, input: PageInput, message: string) {
    return execute(message, async () => {
      const result = await query.order("updated_at", { ascending: false })
        .order("id", { ascending: false }).range(...pageRange(input));
      return { rows: parseRows(ProjectSchema, result), total: validCount(result.count) };
    });
  }

  private findProject(query: DouyinContentQuery, message: string) {
    return execute(message, async () => {
      const result = await query.maybeSingle();
      return parseOne(ProjectSchema, result);
    });
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
