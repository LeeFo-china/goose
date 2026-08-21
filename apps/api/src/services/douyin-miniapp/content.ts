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
  | "listProjects" | "findProject">;
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
    const emptyProjects = Promise.resolve({
      rows: [] as DouyinContentProject[],
      count: 0,
    });
    const [profile, areas, projects, activeSites] = await Promise.all([
      this.repository.findPublishedCompany(context.tenantId),
      this.repository.listServiceAreas(context.tenantId),
      this.repository.listProjects({ tenantId: context.tenantId, page: 1, pageSize: 6 }),
      context.runtime.features.sites
        ? this.repository.listProjects({
          tenantId: context.tenantId,
          phase: "in_progress",
          page: 1,
          pageSize: 6,
        })
        : emptyProjects,
    ]);
    const company = this.mapCompany(context.runtime, requireCompany(profile), areas);
    const mappedProjects = await this.mapPublicProjects([
      ...projects.rows,
      ...activeSites.rows,
    ]);
    const mappedById = new Map(mappedProjects.map((project) => [project.id, project]));
    const featuredProjects = selectPublicProjects(projects.rows, mappedById);
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
        featured_cases: context.runtime.features.cases
          ? compatibilityProjects(projects.rows, mappedById, false)
          : [],
        active_sites: context.runtime.features.sites
          ? compatibilityProjects(activeSites.rows, mappedById, true)
          : [],
      },
      privacy_policy_version: context.runtime.privacy_policy_version,
      contact_sla_text: context.runtime.contact_sla_text,
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
    const projects = await this.mapCompatibilityProjects(result.rows, false);
    return page(projects, query, result.total);
  }

  async getCase(user: JwtPayload | undefined, id: string) {
    const context = await this.loadContext(user);
    requireContentFeature(context, "cases");
    const project = requireProject(await this.repository.findCase({
      tenantId: context.tenantId, id,
    }));
    return this.mapCompatibilityProject(project, false);
  }

  async listSites(user: JwtPayload | undefined, query: DouyinContentPageQuery) {
    const context = await this.loadContext(user);
    requireContentFeature(context, "sites");
    const result = await this.repository.listSites({ tenantId: context.tenantId, ...query });
    const projects = await this.mapCompatibilityProjects(result.rows, true);
    return page(projects, query, result.total);
  }

  async getSite(user: JwtPayload | undefined, id: string) {
    const context = await this.loadContext(user);
    requireContentFeature(context, "sites");
    const project = requireProject(await this.repository.findSite({
      tenantId: context.tenantId, id,
    }));
    return this.mapCompatibilityProject(project, true);
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
    const project = await this.repository.findProject({
      tenantId: context.tenantId,
      id,
    });
    if (!project) throw publicProjectNotFound();
    return this.mapOnePublicProject(project);
  }

  async listProjectLogs(
    user: JwtPayload | undefined,
    projectId: string,
    query: DouyinContentPageQuery,
  ) {
    const context = await this.loadContext(user);
    const project = await this.repository.findProject({
      tenantId: context.tenantId,
      id: projectId,
    });
    if (!project || toDouyinProjectPhase(project.status) !== "in_progress") {
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

  private async mapPublicProjects(projects: readonly DouyinContentProject[]) {
    const uniqueProjects = [...new Map(projects.map((project) => [project.id, project])).values()];
    if (uniqueProjects.some((project) => project.public_profile.public_image_urls.length > 0)) {
      await this.prepareImageUrls();
    }
    return uniqueProjects.map((project) => mapPublicProject(project, this.resolveImageUrls));
  }

  private async mapOnePublicProject(project: DouyinContentProject) {
    if (project.public_profile.public_image_urls.length > 0) {
      await this.prepareImageUrls();
    }
    return mapPublicProject(project, this.resolveImageUrls);
  }

  private async mapCompatibilityProjects(
    projects: readonly DouyinContentProject[],
    useSiteTitle: boolean,
  ) {
    const mapped = await this.mapPublicProjects(projects);
    const mappedById = new Map(mapped.map((project) => [project.id, project]));
    return compatibilityProjects(projects, mappedById, useSiteTitle);
  }

  private async mapCompatibilityProject(
    project: DouyinContentProject,
    useSiteTitle: boolean,
  ) {
    const mapped = await this.mapOnePublicProject(project);
    return compatibilityProject(project, mapped, useSiteTitle);
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

type PublicProjectDto = ReturnType<typeof mapPublicProject>;

function selectPublicProjects(
  projects: readonly DouyinContentProject[],
  mappedById: ReadonlyMap<string, PublicProjectDto>,
) {
  const selected: PublicProjectDto[] = [];
  const selectedIds = new Set<string>();
  for (const project of projects) {
    const mapped = mappedById.get(project.id);
    if (!mapped || selectedIds.has(project.id)) continue;
    selectedIds.add(project.id);
    selected.push(mapped);
  }
  return selected;
}

function compatibilityProjects(
  projects: readonly DouyinContentProject[],
  mappedById: ReadonlyMap<string, PublicProjectDto>,
  useSiteTitle: boolean,
) {
  const sourceById = new Map(projects.map((project) => [project.id, project]));
  return selectPublicProjects(projects, mappedById).flatMap((project) => {
    const source = sourceById.get(project.id);
    if (!source) return [];
    return [compatibilityProject(source, project, useSiteTitle)];
  });
}

function compatibilityProject(
  source: DouyinContentProject,
  project: PublicProjectDto,
  useSiteTitle: boolean,
) {
  const community = project.community.trim().slice(0, 120);
  const title = useSiteTitle ? community || "公开在建工地" : project.title;
  return {
    id: project.id,
    title: title.slice(0, 120),
    cover_image_url: project.cover_image_url,
    public_images: project.public_images.slice(0, 9),
    style_tags: stringArray(project.style_tags, 12, 40),
    layout: project.layout?.slice(0, 80) ?? null,
    area: project.area,
    budget_band: project.budget_band?.slice(0, 40) ?? null,
    community,
    city: project.city?.slice(0, 80) ?? null,
    district: project.district?.slice(0, 80) ?? null,
    status: source.status?.slice(0, 80) ?? null,
    start_date: project.start_date,
    updated_at: project.updated_at,
    description: project.description.slice(0, 2_000),
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
