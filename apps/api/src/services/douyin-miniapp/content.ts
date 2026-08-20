import { toDouyinProjectPhase } from "@gooes/domain";
import { Errors } from "@/errors/error-factory";
import {
  DouyinMiniappContentRepository,
  douyinMiniappContentRepository,
  type DouyinContentArea,
  type DouyinContentCompany,
  type DouyinContentInstallation,
  type DouyinContentLog,
  type DouyinContentProject,
  type DouyinContentProjectImageLog,
} from "@/repositories/douyin-miniapp-content";
import {
  DouyinRuntimeConfigSchema,
  type DouyinRuntimeConfig,
} from "@/schema/platform-douyin-miniapps";
import type {
  DouyinCaseListQuery,
  DouyinContentPageQuery,
  DouyinProjectListQuery,
} from "@/schema/douyin-miniapp";
import type { JwtPayload } from "@/utils/jwt";
import {
  ensurePlatformCosAccessConfigCache,
  resolveStoredFileUrlList,
} from "@/services/files/file-url-resolver";

type RepositoryPort = Pick<DouyinMiniappContentRepository,
  | "findActiveInstallation" | "findPublishedCompany" | "listServiceAreas"
  | "listCases" | "findCase" | "listSites" | "findSite" | "listSiteLogs"
  | "listProjectImageLogs" | "listProjects" | "findProject">;
type Dependencies = {
  readonly repository?: RepositoryPort;
  readonly prepareImageUrls?: () => Promise<void>;
  readonly resolveImageUrls?: (value: unknown) => string[];
};
type ContentContext = {
  tenantId: string;
  installation: DouyinContentInstallation;
  runtime: DouyinRuntimeConfig;
};

export class DouyinMiniappContentService {
  private readonly repository: RepositoryPort;
  private readonly prepareImageUrls: () => Promise<void>;
  private readonly resolveImageUrls: (value: unknown) => string[];

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? douyinMiniappContentRepository;
    this.prepareImageUrls = dependencies.prepareImageUrls ??
      ensurePlatformCosAccessConfigCache;
    this.resolveImageUrls = dependencies.resolveImageUrls ?? resolveStoredFileUrlList;
  }

  async bootstrap(user?: JwtPayload) {
    const context = await this.loadContext(user);
    const [profile, areas, projects] = await Promise.all([
      this.repository.findPublishedCompany(context.tenantId),
      this.repository.listServiceAreas(context.tenantId),
      this.repository.listProjects({ tenantId: context.tenantId, page: 1, pageSize: 6 }),
    ]);
    const company = this.mapCompany(context.runtime, requireCompany(profile), areas);
    const featuredProjects = await this.mapPublicProjects(projects.rows);
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
        featured_projects: featuredProjects,
        featured_cases: context.runtime.features.cases ? featuredProjects : [],
        active_sites: context.runtime.features.sites
          ? featuredProjects.filter((project) => project.phase === "in_progress")
          : [],
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
    requireContentFeature(context, "cases");
    const result = await this.repository.listCases({ tenantId: context.tenantId, ...query });
    const projectImages = await this.loadProjectImages(context.tenantId, result.rows);
    return page(result.rows.map((project) =>
      mapProject(project, projectImages.get(project.id))), query, result.total);
  }

  async getCase(user: JwtPayload | undefined, id: string) {
    const context = await this.loadContext(user);
    requireContentFeature(context, "cases");
    const project = requireProject(await this.repository.findCase({
      tenantId: context.tenantId, id,
    }));
    const projectImages = await this.loadProjectImages(context.tenantId, [project]);
    return mapProject(project, projectImages.get(project.id));
  }

  async listSites(user: JwtPayload | undefined, query: DouyinContentPageQuery) {
    const context = await this.loadContext(user);
    requireContentFeature(context, "sites");
    const result = await this.repository.listSites({ tenantId: context.tenantId, ...query });
    const projectImages = await this.loadProjectImages(context.tenantId, result.rows);
    return page(result.rows.map((project) =>
      mapSiteProject(project, projectImages.get(project.id))), query, result.total);
  }

  async getSite(user: JwtPayload | undefined, id: string) {
    const context = await this.loadContext(user);
    requireContentFeature(context, "sites");
    const project = requireProject(await this.repository.findSite({
      tenantId: context.tenantId, id,
    }));
    const projectImages = await this.loadProjectImages(context.tenantId, [project]);
    return mapSiteProject(project, projectImages.get(project.id));
  }

  async listProjects(user: JwtPayload | undefined, query: DouyinProjectListQuery) {
    const context = await this.loadContext(user);
    const result = await this.repository.listProjects({
      tenantId: context.tenantId,
      ...query,
    });
    return page(await this.mapPublicProjects(result.rows), query, result.count);
  }

  async getProject(user: JwtPayload | undefined, id: string) {
    const context = await this.loadContext(user);
    const project = requirePublicProject(await this.repository.findProject({
      tenantId: context.tenantId,
      id,
    }));
    const [mapped] = await this.mapPublicProjects([project]);
    if (!mapped) throw publicProjectNotFound();
    return mapped;
  }

  async listProjectLogs(
    user: JwtPayload | undefined,
    projectId: string,
    query: DouyinContentPageQuery,
  ) {
    const context = await this.loadContext(user);
    const project = requirePublicProject(await this.repository.findProject({
      tenantId: context.tenantId,
      id: projectId,
    }));
    if (toDouyinProjectPhase(project.status) !== "in_progress") {
      throw publicProjectNotFound();
    }
    const result = await this.repository.listSiteLogs({
      tenantId: context.tenantId,
      projectId,
      ...query,
    });
    if (result.rows.length > 0) await this.prepareImageUrls();
    return page(result.rows.map((log) => mapLog(log, this.resolveImageUrls)), query, result.total);
  }

  async listSiteLogs(
    user: JwtPayload | undefined,
    projectId: string,
    query: DouyinContentPageQuery,
  ) {
    const context = await this.loadContext(user);
    requireContentFeature(context, "sites");
    requireProject(await this.repository.findSite({ tenantId: context.tenantId, id: projectId }));
    const result = await this.repository.listSiteLogs({
      tenantId: context.tenantId, projectId, ...query,
    });
    if (result.rows.length > 0) await this.prepareImageUrls();
    return page(result.rows.map((log) => mapLog(log, this.resolveImageUrls)), query, result.total);
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
    if (installation.tenant.status !== "active") {
      throw Errors.business(403, "装修公司服务已暂停", "TENANT_NOT_AVAILABLE");
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

  private async loadProjectImages(
    tenantId: string,
    projects: readonly DouyinContentProject[],
  ): Promise<Map<string, string[]>> {
    const projectIds = [...new Set(projects.map((project) => project.id))];
    if (projectIds.length === 0) return new Map();
    const [logs] = await Promise.all([
      this.repository.listProjectImageLogs({ tenantId, projectIds }),
      this.prepareImageUrls(),
    ]);
    return projectImageMap(logs, this.resolveImageUrls);
  }

  private async mapPublicProjects(projects: readonly DouyinContentProject[]) {
    const uniqueProjects = [...new Map(projects.map((project) => [project.id, project])).values()];
    if (uniqueProjects.some((project) => project.public_profile.public_image_urls.length > 0)) {
      await this.prepareImageUrls();
    }
    return uniqueProjects.map((project) => mapPublicProject(project, this.resolveImageUrls));
  }
}

function mapPublicProject(
  project: DouyinContentProject,
  resolveImageUrls: (value: unknown) => string[],
) {
  const phase = toDouyinProjectPhase(project.status);
  if (!phase) throw publicProjectNotFound();
  const publicImages = resolvedPublicImages(
    project.public_profile.public_image_urls,
    resolveImageUrls,
  );
  return {
    id: project.id,
    title: project.public_profile.public_title,
    phase,
    cover_image_url: publicImages[0] ?? null,
    public_images: publicImages,
    style_tags: [...project.public_profile.style_tags],
    layout: project.property.layout,
    area: finiteNumber(project.property.area),
    budget_band: project.public_profile.budget_band,
    community: project.property.community,
    city: project.property.city,
    district: project.property.district,
    start_date: project.start_date,
    updated_at: project.updated_at,
    description: project.public_profile.public_description,
  };
}

function mapProject(project: DouyinContentProject, images: readonly string[] = []) {
  return {
    id: project.id,
    title: project.name?.trim() || "装修项目",
    cover_image_url: images[0] ?? null,
    public_images: [...images],
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

function mapSiteProject(project: DouyinContentProject, images: readonly string[] = []) {
  const mapped = mapProject(project, images);
  const community = project.property.community.trim();
  return {
    ...mapped,
    title: community || "公开在建工地",
    community,
  };
}

function mapLog(log: DouyinContentLog, resolveImageUrls: (value: unknown) => string[]) {
  return {
    id: log.id,
    stage_code: log.stage_code,
    node_name: log.node_name,
    images: resolvedHttpsImages(log.images, resolveImageUrls),
    created_at: log.created_at,
  };
}

function projectImageMap(
  logs: readonly DouyinContentProjectImageLog[],
  resolveImageUrls: (value: unknown) => string[],
) {
  const imagesByProject = new Map<string, string[]>();
  for (const log of logs) {
    const images = imagesByProject.get(log.project_id) ?? [];
    for (const image of resolvedHttpsImages(log.images, resolveImageUrls)) {
      if (!images.includes(image)) images.push(image);
      if (images.length >= 9) break;
    }
    if (images.length > 0) imagesByProject.set(log.project_id, images);
  }
  return imagesByProject;
}

function resolvedHttpsImages(
  value: unknown,
  resolveImageUrls: (value: unknown) => string[],
) {
  const publicReferences = stringArray(value, 100, 2048)
    .filter(isPublicImageReference);
  return stringArray(resolveImageUrls(publicReferences), 100, 2048)
    .filter(isHttpsUrl).slice(0, 9);
}

function resolvedPublicImages(
  value: unknown,
  resolveImageUrls: (value: unknown) => string[],
) {
  const publicReferences = stringArray(value, 30, 2048).filter(isPublicImageReference);
  return stringArray(resolveImageUrls(publicReferences), 30, 2048)
    .filter(isHttpsUrl);
}

function isPublicImageReference(value: string) {
  return isHttpsUrl(value) || /^(?:tenants|public|system)\//.test(value);
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
function requirePublicProject(value: DouyinContentProject | null) {
  if (!value || !toDouyinProjectPhase(value.status)) throw publicProjectNotFound();
  return value;
}
function publicProjectNotFound() {
  return Errors.business(404, "公开项目不存在", "DOUYIN_PROJECT_NOT_FOUND");
}
function requireContentFeature(context: ContentContext, feature: "cases" | "sites") {
  if (!context.runtime.features[feature]) {
    throw Errors.business(404, "公开内容模块未开放", "DOUYIN_CONTENT_FEATURE_DISABLED");
  }
}
function installationDisabled() {
  return Errors.business(409, "抖音小程序服务已暂停", "DOUYIN_INSTALLATION_DISABLED");
}

let defaultService: DouyinMiniappContentService | undefined;

export function getDouyinMiniappContentService(): DouyinMiniappContentService {
  defaultService ??= new DouyinMiniappContentService();
  return defaultService;
}
