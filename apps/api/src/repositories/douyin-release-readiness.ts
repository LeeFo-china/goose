import { toDouyinProjectPhase } from "@gooes/domain";
import { z } from "zod";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { DouyinReleaseReadinessFacts } from "@/services/douyin-release-readiness";
import {
  getAliyunTemplateCode,
  getSmsChannel,
  getTencentTemplateId,
  requireSmsConfig,
} from "@/services/sms/legacy/config";
import { SupabaseDB } from "@/utils/supabase";

const TENANT_SELECT = "id,name,status";
const INSTALLATION_SELECT = [
  "id",
  "authorization_status",
  "installation_kind",
  "runtime_config",
].join(",");
const PROFILE_SELECT = [
  "status",
  "public_name",
  "introduction",
  "public_phone",
].join(",");
const PROJECT_SELECT = [
  "id",
  "status",
  "property:properties!inner(area,layout)",
  "public_profile:douyin_project_public_profiles!inner(public_title,"
    + "public_description,public_image_urls,style_tags,budget_band,"
    + "publication_status)",
].join(",");
const LOG_SELECT = "project_id";
const PRICING_SELECT = "id,tenant_id,version_no,disclaimer";
const PROJECT_LIMIT = 100;
const LOG_LIMIT = 2_000;

const TenantSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1),
  status: z.enum(["active", "suspended", "archived"]),
});
const RuntimeConfigReadinessSchema = z.object({
  brand: z.object({
    logo_url: z.string().trim().min(1).nullable().optional(),
  }).passthrough().optional(),
  privacy_policy_version: z.string().trim().min(1).nullable().optional(),
}).passthrough();
const InstallationSchema = z.strictObject({
  id: z.uuid(),
  authorization_status: z.enum(["active", "disabled", "revoked"]),
  installation_kind: z.enum(["merchant", "template_development"]),
  runtime_config: z.unknown(),
});
const ProfileSchema = z.strictObject({
  status: z.enum(["draft", "pending_review", "published", "suspended"]),
  public_name: z.string().nullable(),
  introduction: z.string().nullable(),
  public_phone: z.string().nullable(),
});
const PropertySchema = z.strictObject({
  area: z.union([z.number(), z.string()]).nullable(),
  layout: z.string().nullable(),
});
const PublicProfileSchema = z.strictObject({
  public_title: z.string().nullable(),
  public_description: z.string().nullable(),
  public_image_urls: z.array(z.string()),
  style_tags: z.array(z.string()),
  budget_band: z.string().nullable(),
  publication_status: z.literal("published"),
});
const ProjectSchema = z.strictObject({
  id: z.uuid(),
  status: z.string().nullable(),
  property: PropertySchema,
  public_profile: PublicProfileSchema,
});
const LogSchema = z.strictObject({ project_id: z.uuid() });
const PricingSchema = z.strictObject({
  id: z.uuid(),
  tenant_id: z.uuid(),
  version_no: z.int().min(1),
  disclaimer: z.string().nullable(),
});

type DatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

export interface DouyinReleaseReadinessQuery
  extends PromiseLike<DatabaseResult> {
  select(columns: string, options?: Record<string, unknown>): DouyinReleaseReadinessQuery;
  eq(column: string, value: unknown): DouyinReleaseReadinessQuery;
  in(column: string, values: readonly string[]): DouyinReleaseReadinessQuery;
  lte(column: string, value: unknown): DouyinReleaseReadinessQuery;
  or(filters: string): DouyinReleaseReadinessQuery;
  order(column: string, options: Record<string, unknown>): DouyinReleaseReadinessQuery;
  limit(count: number): DouyinReleaseReadinessQuery;
  maybeSingle(): Promise<DatabaseResult>;
}

export interface DouyinReleaseReadinessDatabaseClient {
  from(table: string): DouyinReleaseReadinessQuery;
}

interface Dependencies {
  readonly resolveSmsReady?: (tenantId: string) => Promise<boolean>;
}

export class DouyinReleaseReadinessRepository {
  private readonly resolveSmsReady: (tenantId: string) => Promise<boolean>;

  constructor(
    private readonly client: DouyinReleaseReadinessDatabaseClient =
      SupabaseDB.getAdminClient() as unknown as
        DouyinReleaseReadinessDatabaseClient,
    dependencies: Dependencies = {},
  ) {
    this.resolveSmsReady = dependencies.resolveSmsReady
      ?? resolveDouyinLeadSmsReady;
  }

  async loadFacts(input: {
    readonly tenantId: string;
    readonly now: string;
    readonly requiredHosts: readonly string[];
  }): Promise<DouyinReleaseReadinessFacts> {
    return execute(async () => {
      const tenant = await this.loadTenant(input.tenantId);
      const installation = await this.loadInstallation(input.tenantId);
      const runtime = parseRuntime(installation?.runtime_config);
      const profile = await this.loadProfile(input.tenantId);
      const activeServiceAreaCount = await this.countActiveServiceAreas(
        input.tenantId,
      );
      const projects = await this.loadProjects(input.tenantId);
      const projectLogCounts = await this.loadProjectLogCounts(
        input.tenantId,
        projects.map((project) => project.id),
      );
      const activePricingVersion = await this.loadActivePricing(
        input.tenantId,
        input.now,
      );
      const smsReady = await this.resolveSmsReady(input.tenantId);

      return {
        tenant,
        installation: installation
          ? {
            id: installation.id,
            authorizationStatus: installation.authorization_status,
            installationKind: installation.installation_kind,
          }
          : null,
        profile: profile
          ? {
            status: profile.status,
            publicName: profile.public_name,
            introduction: profile.introduction,
            publicPhone: profile.public_phone,
            logoUrl: runtime.logoUrl,
          }
          : null,
        activeServiceAreaCount,
        projects: projects.map((project) => mapProject(
          project,
          projectLogCounts.get(project.id) ?? 0,
        )),
        activePricingVersion,
        smsReady,
        privacyVersion: runtime.privacyVersion,
        requiredHosts: [...input.requiredHosts],
      };
    });
  }

  private async loadTenant(tenantId: string) {
    const result = await this.client.from("tenants")
      .select(TENANT_SELECT)
      .eq("id", tenantId)
      .maybeSingle();
    return parseOne(TenantSchema, result);
  }

  private async loadInstallation(tenantId: string) {
    const result = await this.client.from("douyin_miniapp_installations")
      .select(INSTALLATION_SELECT)
      .eq("tenant_id", tenantId)
      .eq("installation_kind", "merchant")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return parseNullable(InstallationSchema, result);
  }

  private async loadProfile(tenantId: string) {
    const result = await this.client.from("tenant_service_provider_profiles")
      .select(PROFILE_SELECT)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return parseNullable(ProfileSchema, result);
  }

  private async countActiveServiceAreas(tenantId: string): Promise<number> {
    const result = await this.client.from("tenant_service_areas")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active");
    assertSuccess(result);
    return validCount(result.count);
  }

  private async loadProjects(tenantId: string) {
    const result = await this.client.from("projects")
      .select(PROJECT_SELECT)
      .eq("tenant_id", tenantId)
      .eq("public_profile.publication_status", "published")
      .in("status", ["started", "constructing", "acceptance"])
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PROJECT_LIMIT);
    return parseRows(ProjectSchema, result);
  }

  private async loadProjectLogCounts(
    tenantId: string,
    projectIds: readonly string[],
  ): Promise<Map<string, number>> {
    const uniqueProjectIds = [...new Set(projectIds)];
    if (uniqueProjectIds.length === 0) return new Map();
    const result = await this.client.from("project_logs")
      .select(LOG_SELECT)
      .eq("tenant_id", tenantId)
      .in("project_id", uniqueProjectIds)
      .order("created_at", { ascending: false })
      .limit(LOG_LIMIT);
    const rows = parseRows(LogSchema, result);
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
    }
    return counts;
  }

  private async loadActivePricing(tenantId: string, now: string) {
    const result = await this.client.from("douyin_budget_pricing_versions")
      .select(PRICING_SELECT)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .lte("effective_from", now)
      .or(`effective_to.is.null,effective_to.gt.${now}`)
      .order("effective_from", { ascending: false })
      .order("id", { ascending: true })
      .limit(2);
    const rows = parseRows(PricingSchema, result);
    if (rows.length > 1) throw responseInvalid();
    const pricing = rows[0];
    if (!pricing) return null;
    if (pricing.tenant_id !== tenantId) throw responseInvalid();
    return {
      id: pricing.id,
      versionNo: pricing.version_no,
      disclaimer: pricing.disclaimer,
    };
  }
}

function parseRuntime(input: unknown): {
  readonly logoUrl: string | null;
  readonly privacyVersion: string | null;
} {
  const parsed = RuntimeConfigReadinessSchema.safeParse(input ?? {});
  if (!parsed.success) return { logoUrl: null, privacyVersion: null };
  return {
    logoUrl: parsed.data.brand?.logo_url ?? null,
    privacyVersion: parsed.data.privacy_policy_version ?? null,
  };
}

function mapProject(
  project: z.infer<typeof ProjectSchema>,
  publicLogCount: number,
) {
  const phase = toDouyinProjectPhase(project.status);
  if (phase !== "in_progress" && phase !== "completed") {
    throw responseInvalid();
  }
  return {
    id: project.id,
    phase,
    title: project.public_profile.public_title,
    description: project.public_profile.public_description,
    area: numberOrNull(project.property.area),
    layout: project.property.layout,
    style: project.public_profile.style_tags[0] ?? null,
    budgetBand: project.public_profile.budget_band,
    imageCount: project.public_profile.public_image_urls.length,
    publicLogCount,
  } as const;
}

function numberOrNull(value: string | number | null): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function resolveDouyinLeadSmsReady(tenantId: string): Promise<boolean> {
  try {
    const channel = await getSmsChannel(tenantId);
    if (channel.provider === "disabled" || channel.provider === "mock") {
      return false;
    }
    if (channel.provider === "aliyun") {
      await Promise.all([
        requireSmsConfig(channel, "ALIBABA_CLOUD_ACCESS_KEY_ID"),
        requireSmsConfig(channel, "ALIBABA_CLOUD_ACCESS_KEY_SECRET"),
        requireSmsConfig(channel, "ALIYUN_SMS_SIGN_NAME"),
        getAliyunTemplateCode(channel, "douyin_lead"),
      ]);
      return true;
    }
    if (channel.provider === "tencent") {
      await Promise.all([
        requireSmsConfig(channel, "TENCENT_SMS_SECRET_ID"),
        requireSmsConfig(channel, "TENCENT_SMS_SECRET_KEY"),
        requireSmsConfig(channel, "TENCENT_SMS_SDK_APP_ID"),
        requireSmsConfig(channel, "TENCENT_SMS_SIGN_NAME"),
        getTencentTemplateId(channel, "douyin_lead"),
      ]);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function parseRows<T>(schema: z.ZodType<T>, result: DatabaseResult): T[] {
  assertSuccess(result);
  const parsed = z.array(schema).safeParse(result.data ?? []);
  if (!parsed.success) throw responseInvalid();
  return parsed.data;
}

function parseOne<T>(schema: z.ZodType<T>, result: DatabaseResult): T {
  assertSuccess(result);
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw responseInvalid();
  return parsed.data;
}

function parseNullable<T>(
  schema: z.ZodType<T>,
  result: DatabaseResult,
): T | null {
  assertSuccess(result);
  if (result.data === null) return null;
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) throw responseInvalid();
  return parsed.data;
}

function validCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw responseInvalid();
  }
  return value;
}

function assertSuccess(result: DatabaseResult): void {
  if (result.error) throw repositoryError();
}

async function execute<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw repositoryError();
  }
}

function repositoryError() {
  return Errors.business(
    500,
    "抖音提审就绪数据查询失败",
    "DOUYIN_RELEASE_READINESS_REPOSITORY_ERROR",
  );
}

function responseInvalid() {
  return Errors.business(
    500,
    "抖音提审就绪数据无效",
    "DOUYIN_RELEASE_READINESS_RESPONSE_INVALID",
  );
}

export const douyinReleaseReadinessRepository =
  new DouyinReleaseReadinessRepository();
