import { z } from "zod";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { DouyinRuntimeConfigSchema } from "@/schema/platform-douyin-miniapps";
import { TenantServiceProviderProfileStatusSchema } from "@/schema/tenant-onboarding";
import { SupabaseDB } from "@/utils/supabase";

const PUBLIC_PROJECT_STATUSES = [
  "signed",
  "design_finalized",
  "pending_start",
  "started",
  "constructing",
  "acceptance",
].join(",");

const SAFE_INSTALLATION_SELECT = [
  "id",
  "authorizer_appid",
  "installation_kind",
  "authorization_status",
  "permission_snapshot",
  "runtime_config",
  "template_version",
  "template_release_id",
  "created_at",
  "updated_at",
].join(",");

const PROFILE_SELECT = [
  "public_name",
  "introduction",
  "public_phone",
  "status",
  "version",
  "submitted_at",
  "reviewed_at",
  "review_remark",
  "published_at",
  "updated_at",
].join(",");

const SAFE_RELEASE_SELECT = [
  "id",
  "installation_id",
  "template_id",
  "template_version",
  "description",
  "status",
  "test_qr_url",
  "latest_test_qr_url",
  "audit_qr_url",
  "audit_note",
  "audit_result",
  "submitted_at",
  "audited_at",
  "released_at",
  "created_at",
  "updated_at",
].join(",");

const DateTimeSchema = z.iso.datetime({ offset: true });
const NullableDateTimeSchema = DateTimeSchema.nullable();
const NullableStringSchema = z.string().nullable();
const TenantSummarySchema = z.strictObject({
  id: z.string().uuid(),
  name: z.string().min(1),
});
const InstallationSchema = z.strictObject({
  id: z.string().uuid(),
  authorizer_appid: z.string().trim().min(1).max(128),
  installation_kind: z.literal("merchant"),
  authorization_status: z.enum(["active", "disabled", "revoked"]),
  permission_snapshot: z.array(z.unknown()),
  runtime_config: DouyinRuntimeConfigSchema,
  template_version: NullableStringSchema,
  template_release_id: z.string().uuid().nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
const ProfileSchema = z.strictObject({
  public_name: NullableStringSchema,
  introduction: NullableStringSchema,
  public_phone: NullableStringSchema,
  status: TenantServiceProviderProfileStatusSchema,
  version: z.number().int().positive(),
  submitted_at: NullableDateTimeSchema,
  reviewed_at: NullableDateTimeSchema,
  review_remark: NullableStringSchema,
  published_at: NullableDateTimeSchema,
  updated_at: DateTimeSchema,
});
const AuditResultSchema = z.strictObject({
  audit_id: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
  status: z.enum(["pending", "approved", "rejected", "failed"]).optional(),
  reason: z.string().trim().min(1).max(1000).optional(),
  error_code: z.string().regex(/^[A-Z0-9_:-]{1,128}$/).optional(),
});
const HttpsUrlSchema = z.string().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.username === ""
      && url.password === "";
  } catch {
    return false;
  }
});
const ReleaseSchema = z.strictObject({
  id: z.string().uuid(),
  installation_id: z.string().uuid(),
  template_id: z.string().regex(/^[1-9][0-9]{0,18}$/),
  template_version: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(200),
  status: z.enum([
    "created",
    "uploaded",
    "testing",
    "audit_pending",
    "audit_rejected",
    "audit_approved",
    "released",
    "failed",
  ]),
  test_qr_url: HttpsUrlSchema.nullable(),
  latest_test_qr_url: HttpsUrlSchema.nullable(),
  audit_qr_url: HttpsUrlSchema.nullable(),
  audit_note: NullableStringSchema,
  audit_result: AuditResultSchema.nullable(),
  submitted_at: NullableDateTimeSchema,
  audited_at: NullableDateTimeSchema,
  released_at: NullableDateTimeSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});

export type TenantDouyinMiniappWorkspaceDatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

export interface TenantDouyinMiniappWorkspaceQuery {
  select(
    columns: string,
    options?: unknown,
  ): TenantDouyinMiniappWorkspaceQuery;
  eq(column: string, value: unknown): TenantDouyinMiniappWorkspaceQuery;
  neq(column: string, value: unknown): TenantDouyinMiniappWorkspaceQuery;
  in(
    column: string,
    values: readonly string[],
  ): TenantDouyinMiniappWorkspaceQuery;
  or(filters: string): TenantDouyinMiniappWorkspaceQuery;
  order(column: string, options: unknown): TenantDouyinMiniappWorkspaceQuery;
  limit(value: number): TenantDouyinMiniappWorkspaceQuery;
  maybeSingle(): Promise<TenantDouyinMiniappWorkspaceDatabaseResult>;
  then<
    TResult1 = TenantDouyinMiniappWorkspaceDatabaseResult,
    TResult2 = never,
  >(
    onfulfilled?: (
      (
        value: TenantDouyinMiniappWorkspaceDatabaseResult,
      ) => TResult1 | PromiseLike<TResult1>
    ) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

export interface TenantDouyinMiniappWorkspaceDatabaseClient {
  from(table: string): TenantDouyinMiniappWorkspaceQuery;
}

export type TenantDouyinMiniappWorkspaceInstallation = z.infer<
  typeof InstallationSchema
>;
export type TenantDouyinMiniappWorkspaceProfile = z.infer<
  typeof ProfileSchema
>;
export type TenantDouyinMiniappWorkspaceRelease = z.infer<
  typeof ReleaseSchema
>;

export class TenantDouyinMiniappWorkspaceRepository {
  constructor(
    private readonly client: TenantDouyinMiniappWorkspaceDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as
        TenantDouyinMiniappWorkspaceDatabaseClient,
  ) {}

  findTenantSummary(tenantId: string) {
    return this.findOne(
      this.client.from("tenants")
        .select("id,name")
        .eq("id", tenantId),
      TenantSummarySchema,
      "查询租户信息失败",
    );
  }

  findCurrentInstallation(tenantId: string) {
    return this.findOne(
      this.client.from("douyin_miniapp_installations")
        .select(SAFE_INSTALLATION_SELECT)
        .eq("tenant_id", tenantId)
        .eq("installation_kind", "merchant")
        .in("authorization_status", ["active", "disabled", "revoked"])
        .order("updated_at", { ascending: false })
        .limit(1),
      InstallationSchema,
      "查询租户抖音小程序失败",
    );
  }

  findPreviousInstallation(tenantId: string, authorizerAppId: string) {
    return this.findOne(
      this.client.from("douyin_miniapp_installations")
        .select(SAFE_INSTALLATION_SELECT)
        .eq("tenant_id", tenantId)
        .eq("installation_kind", "merchant")
        .in("authorization_status", ["active", "disabled", "revoked"])
        .neq("authorizer_appid", authorizerAppId)
        .order("updated_at", { ascending: false })
        .limit(1),
      InstallationSchema,
      "查询租户历史抖音小程序失败",
    );
  }

  findProfile(tenantId: string) {
    return this.findOne(
      this.client.from("tenant_service_provider_profiles")
        .select(PROFILE_SELECT)
        .eq("tenant_id", tenantId),
      ProfileSchema,
      "查询小程序公开资料失败",
    );
  }

  async getPublicContentCounts(tenantId: string) {
    return execute("查询小程序公开内容统计失败", async () => {
      const [cases, sites, serviceAreas] = await Promise.all([
        this.client.from("projects")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .neq("visibility_status", "hidden")
          .or(
            `status.in.(${PUBLIC_PROJECT_STATUSES}),`
            + "visibility_status.eq.public",
          ),
        this.client.from("projects")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .neq("visibility_status", "hidden")
          .in("status", ["started", "constructing"]),
        this.client.from("tenant_service_areas")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "active"),
      ]);

      assertSuccess(cases);
      assertSuccess(sites);
      assertSuccess(serviceAreas);
      return {
        cases: parseCount(cases.count),
        sites: parseCount(sites.count),
        active_service_areas: parseCount(serviceAreas.count),
      };
    });
  }

  findLatestRelease(installationId: string) {
    return this.findOne(
      this.client.from("douyin_miniapp_releases")
        .select(SAFE_RELEASE_SELECT)
        .eq("installation_id", installationId)
        .order("created_at", { ascending: false })
        .limit(1),
      ReleaseSchema,
      "查询抖音小程序版本失败",
    );
  }

  private async findOne<Output>(
    query: TenantDouyinMiniappWorkspaceQuery,
    schema: z.ZodType<Output>,
    message: string,
  ): Promise<Output | null> {
    return execute(message, async () => {
      const result = await query.maybeSingle();
      assertSuccess(result);
      if (result.data === null) return null;
      const parsed = schema.safeParse(result.data);
      if (!parsed.success) throw invalidResponse();
      return parsed.data;
    });
  }
}

function assertSuccess(
  result: TenantDouyinMiniappWorkspaceDatabaseResult,
): void {
  if (result.error) throw repositoryError();
}

function parseCount(value: number | null | undefined): number {
  if (!Number.isInteger(value) || value === undefined || value === null || value < 0) {
    throw invalidResponse();
  }
  return value;
}

async function execute<Result>(
  message: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw Errors.business(
      500,
      message,
      "DOUYIN_TENANT_WORKSPACE_REPOSITORY_ERROR",
    );
  }
}

function repositoryError() {
  return Errors.business(
    500,
    "抖音小程序工作台查询失败",
    "DOUYIN_TENANT_WORKSPACE_REPOSITORY_ERROR",
  );
}

function invalidResponse() {
  return Errors.business(
    500,
    "抖音小程序工作台数据无效",
    "DOUYIN_TENANT_WORKSPACE_RESPONSE_INVALID",
  );
}

export const tenantDouyinMiniappWorkspaceRepository =
  new TenantDouyinMiniappWorkspaceRepository();
