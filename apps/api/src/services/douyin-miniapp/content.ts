import { Errors } from "@/errors/error-factory";
import {
  DouyinMiniappContentRepository,
  douyinMiniappContentRepository,
  type DouyinContentArea,
  type DouyinContentCompany,
  type DouyinContentInstallation,
  type DouyinContentLog,
  type DouyinContentProject,
} from "@/repositories/douyin-miniapp-content";
import {
  DouyinRuntimeConfigSchema,
  type DouyinRuntimeConfig,
} from "@/schema/platform-douyin-miniapps";
import type {
  DouyinCaseListQuery,
  DouyinContentPageQuery,
} from "@/schema/douyin-miniapp";
import type { JwtPayload } from "@/utils/jwt";

type RepositoryPort = Pick<DouyinMiniappContentRepository,
  | "findActiveInstallation" | "findPublishedCompany" | "listServiceAreas"
  | "listCases" | "findCase" | "listSites" | "findSite" | "listSiteLogs">;
type Dependencies = { readonly repository?: RepositoryPort };
type ContentContext = {
  tenantId: string;
  installation: DouyinContentInstallation;
  runtime: DouyinRuntimeConfig;
};

export class DouyinMiniappContentService {
  private readonly repository: RepositoryPort;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? douyinMiniappContentRepository;
  }

  async bootstrap(user?: JwtPayload) {
    const context = await this.loadContext(user);
    const [profile, areas, cases, sites] = await Promise.all([
      this.repository.findPublishedCompany(context.tenantId),
      this.repository.listServiceAreas(context.tenantId),
      this.repository.listCases({ tenantId: context.tenantId, page: 1, pageSize: 6 }),
      this.repository.listSites({ tenantId: context.tenantId, page: 1, pageSize: 6 }),
    ]);
    const company = this.mapCompany(context.runtime, requireCompany(profile), areas);
    return {
      installation: {
        status: "active" as const,
        template_version: context.installation.template_version,
      },
      company,
      theme: context.runtime.theme,
      features: context.runtime.features,
      content: {
        home_banners: context.runtime.home_banners,
        trust_metrics: context.runtime.trust_metrics,
        featured_cases: cases.rows.map(mapProject),
        active_sites: sites.rows.map(mapProject),
      },
      privacy_policy_version: context.runtime.privacy_policy_version,
    };
  }

  async company(user?: JwtPayload) {
    const context = await this.loadContext(user);
    const [profile, areas] = await Promise.all([
      this.repository.findPublishedCompany(context.tenantId),
      this.repository.listServiceAreas(context.tenantId),
    ]);
    return this.mapCompany(context.runtime, requireCompany(profile), areas);
  }

  async listCases(user: JwtPayload | undefined, query: DouyinCaseListQuery) {
    const context = await this.loadContext(user);
    const result = await this.repository.listCases({ tenantId: context.tenantId, ...query });
    return page(result.rows.map(mapProject), query, result.total);
  }

  async getCase(user: JwtPayload | undefined, id: string) {
    const context = await this.loadContext(user);
    return mapProject(requireProject(await this.repository.findCase({
      tenantId: context.tenantId, id,
    })));
  }

  async listSites(user: JwtPayload | undefined, query: DouyinContentPageQuery) {
    const context = await this.loadContext(user);
    const result = await this.repository.listSites({ tenantId: context.tenantId, ...query });
    return page(result.rows.map(mapProject), query, result.total);
  }

  async getSite(user: JwtPayload | undefined, id: string) {
    const context = await this.loadContext(user);
    return mapProject(requireProject(await this.repository.findSite({
      tenantId: context.tenantId, id,
    })));
  }

  async listSiteLogs(
    user: JwtPayload | undefined,
    projectId: string,
    query: DouyinContentPageQuery,
  ) {
    const context = await this.loadContext(user);
    requireProject(await this.repository.findSite({ tenantId: context.tenantId, id: projectId }));
    const result = await this.repository.listSiteLogs({
      tenantId: context.tenantId, projectId, ...query,
    });
    return page(result.rows.map(mapLog), query, result.total);
  }

  private async loadContext(user?: JwtPayload): Promise<ContentContext> {
    if (
      user?.token_type !== "douyin_miniapp"
      || !user.tenant_id
      || !user.douyin_installation_id
      || !user.douyin_app_id
    ) {
      throw Errors.unauthorized("请使用抖音小程序会话");
    }
    const installation = await this.repository.findActiveInstallation({
      installationId: user.douyin_installation_id,
      tenantId: user.tenant_id,
      appId: user.douyin_app_id,
    });
    if (
      !installation
      || installation.tenant_id !== user.tenant_id
      || installation.tenant.id !== user.tenant_id
    ) {
      throw installationDisabled();
    }
    const runtime = DouyinRuntimeConfigSchema.safeParse(installation.runtime_config);
    if (!runtime.success) throw installationDisabled();
    return { tenantId: user.tenant_id, installation, runtime: runtime.data };
  }

  private mapCompany(
    runtime: DouyinRuntimeConfig,
    profile: DouyinContentCompany,
    areas: DouyinContentArea[],
  ) {
    return {
      name: profile.public_name,
      logo_url: runtime.brand.logo_url,
      summary: profile.introduction,
      service_phone: profile.public_phone,
      public_address: profile.address,
      address_region: {
        province: profile.address_province,
        city: profile.address_city,
        district: profile.address_district,
      },
      service_regions: areas.map((area) => ({
        province: area.province,
        city: area.city,
        district: area.district,
      })),
      qualifications: runtime.brand.qualifications,
    };
  }
}

function mapProject(project: DouyinContentProject) {
  return {
    id: project.id,
    title: project.name?.trim() || "装修项目",
    cover_image_url: null,
    public_images: [] as string[],
    style_tags: stringArray(project.style_tags, 12, 40),
    layout: project.property.layout,
    area: finiteNumber(project.property.area),
    budget_band: budgetBand(project.budget),
    community: project.property.community,
    city: project.property.city,
    district: project.property.district,
    status: project.status,
    start_date: project.start_date,
    updated_at: project.updated_at,
    description: null,
  };
}

function mapLog(log: DouyinContentLog) {
  return {
    id: log.id,
    stage_code: log.stage_code,
    node_name: log.node_name,
    images: stringArray(log.images, 100, 2048).filter(isHttpsUrl).slice(0, 9),
    created_at: log.created_at,
  };
}

function stringArray(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string =>
    typeof item === "string" && item.trim().length > 0 && item.trim().length <= maxLength)
    .map((item) => item.trim()))].slice(0, limit);
}
function isHttpsUrl(value: string) {
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}
function finiteNumber(value: number | string | null) {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function budgetBand(value: number | string | null) {
  const budget = finiteNumber(value);
  if (budget === null) return null;
  if (budget < 100_000) return "10万以内";
  if (budget < 200_000) return "10-20万";
  if (budget < 300_000) return "20-30万";
  if (budget < 500_000) return "30-50万";
  return "50万以上";
}
function page<T>(items: T[], query: DouyinContentPageQuery, total: number) {
  return { items, pagination: {
    page: query.page, pageSize: query.pageSize, total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  } };
}
function requireCompany(value: DouyinContentCompany | null) {
  if (!value) throw Errors.business(404, "装修公司公开资料不存在", "DOUYIN_COMPANY_NOT_FOUND");
  return value;
}
function requireProject(value: DouyinContentProject | null) {
  if (!value) throw Errors.business(404, "公开内容不存在", "DOUYIN_CONTENT_NOT_FOUND");
  return value;
}
function installationDisabled() {
  return Errors.business(409, "抖音小程序服务已暂停", "DOUYIN_INSTALLATION_DISABLED");
}

let defaultService: DouyinMiniappContentService | undefined;

export function getDouyinMiniappContentService(): DouyinMiniappContentService {
  defaultService ??= new DouyinMiniappContentService();
  return defaultService;
}
