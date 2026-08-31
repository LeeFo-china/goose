import type {
  BootstrapData,
  CompanyData,
  HomeBanner,
  PublicProject,
  PublicProjectPage,
  PublicProjectPhase,
  PublicSiteLog,
  PublicSiteLogPage,
  ServiceRegion,
} from "../models";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// The mini-program has no runtime dependency on the workspace domain package.
// Keep this single parser-boundary fallback for rolling backend compatibility.
export const DOUYIN_DEFAULT_CONTACT_SLA_TEXT =
  "工作人员将在营业时间内与你联系";

export function parseBootstrap(value: unknown): BootstrapData | null {
  if (!isRecord(value) || !isRecord(value.installation) || !isRecord(value.theme)
    || !isRecord(value.features) || !isRecord(value.content)) return null;
  const company = parseCompany(value.company);
  const homeBanners = parseHomeBanners(value.content.home_banners);
  const trustMetrics = parseMetrics(value.content.trust_metrics);
  const contactSlaText = parseContactSlaText(value.contact_sla_text);
  const hasProjectFeed = value.content.featured_projects !== undefined
    || value.content.featured_cases !== undefined
    || value.content.active_sites !== undefined;
  if (!hasProjectFeed) return null;
  const featuredCases = parseOptionalProjects(value.content.featured_cases, 6);
  const activeSites = parseOptionalProjects(value.content.active_sites, 6);
  if (!featuredCases || !activeSites) return null;
  const featuredProjects = value.content.featured_projects === undefined
    ? uniqueProjects([...featuredCases, ...activeSites]).slice(0, 6)
    : parseProjects(value.content.featured_projects, 6);
  if (!company || !homeBanners || !trustMetrics || !featuredProjects
    || contactSlaText === null
    || value.installation.status !== "active"
    || !isNullableString(value.installation.template_version)
    || typeof value.theme.primary_color !== "string"
    || !/^#[0-9a-f]{6}$/i.test(value.theme.primary_color)
    || (value.theme.navigation_text_color !== "black"
      && value.theme.navigation_text_color !== "white")
    || typeof value.features.cases !== "boolean"
    || typeof value.features.sites !== "boolean"
    || typeof value.features.sms_lead !== "boolean"
    || value.features.douyin_phone !== false
    || value.features.phone_capture_mode !== "sms"
    || !isBoundedString(value.privacy_policy_version, 1, 40)) return null;
  return {
    installation: {
      status: "active",
      template_version: value.installation.template_version,
    },
    company,
    theme: {
      primary_color: value.theme.primary_color,
      navigation_text_color: value.theme.navigation_text_color,
    },
    features: {
      cases: value.features.cases,
      sites: value.features.sites,
      sms_lead: value.features.sms_lead,
      douyin_phone: false,
      phone_capture_mode: "sms",
    },
    content: {
      home_banners: homeBanners,
      trust_metrics: trustMetrics,
      featured_projects: featuredProjects,
      featured_cases: featuredCases,
      active_sites: activeSites,
    },
    privacy_policy_version: value.privacy_policy_version,
    contact_sla_text: contactSlaText,
  };
}

export function parseCompany(value: unknown): CompanyData | null {
  if (!isRecord(value) || !isBoundedString(value.name, 1, 120)
    || !isHttpsOrNull(value.logo_url) || !isNullableBoundedString(value.summary, 2_000)
    || !isBoundedString(value.service_phone, 1, 40)
    || !isNullableBoundedString(value.public_address, 500)
    || !isRecord(value.address_region)) return null;
  const addressRegion = parseAddressRegion(value.address_region);
  const serviceRegions = parseServiceRegions(value.service_regions);
  const qualifications = parseQualifications(value.qualifications);
  if (!addressRegion || !serviceRegions || !qualifications) return null;
  return {
    name: value.name,
    logo_url: value.logo_url,
    summary: value.summary,
    service_phone: value.service_phone,
    public_address: value.public_address,
    address_region: addressRegion,
    service_regions: serviceRegions,
    qualifications,
  };
}

export function parseProject(value: unknown): PublicProject | null {
  if (!isRecord(value) || typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || !isBoundedString(value.title, 1, 120) || !isHttpsOrNull(value.cover_image_url)
    || !isNullableBoundedString(value.layout, 80) || !isNonNegativeNumberOrNull(value.area)
    || !isNullableBoundedString(value.budget_band, 80)
    || (value.stage_label !== undefined && !isNullableBoundedString(value.stage_label, 80))
    || !isBoundedString(value.community, 0, 120)
    || !isNullableBoundedString(value.city, 80)
    || !isNullableBoundedString(value.district, 80)
    || (value.status !== undefined && !isNullableBoundedString(value.status, 80))
    || !isNullableBoundedString(value.start_date, 40)
    || !isBoundedString(value.updated_at, 1, 80)
    || !isNullableBoundedString(value.description, 2_000)) return null;
  const phase = parseProjectPhase(value.phase, value.status);
  const publicImages = parseHttpsArray(value.public_images, 9);
  const styleTags = parseStringArray(value.style_tags, 12, 40);
  if (!phase || !publicImages || !styleTags) return null;
  return {
    id: value.id,
    title: value.title,
    phase,
    stage_label: phase === "in_progress" ? value.stage_label ?? null : null,
    cover_image_url: value.cover_image_url,
    public_images: publicImages,
    style_tags: styleTags,
    layout: value.layout,
    area: value.area,
    budget_band: value.budget_band,
    community: value.community,
    city: value.city,
    district: value.district,
    status: value.status ?? null,
    start_date: value.start_date,
    updated_at: value.updated_at,
    description: value.description,
  };
}

export function parseProjectPage(value: unknown): PublicProjectPage | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.pagination)) return null;
  const projects = parseProjects(value.items, 100);
  const { page, pageSize, total, totalPages } = value.pagination;
  if (!projects || !isIntegerInRange(page, 1, 10_000)
    || !isIntegerInRange(pageSize, 1, 100) || !isIntegerInRange(total, 0, 10_000_000)
    || !isIntegerInRange(totalPages, 0, 10_000)
    || projects.length > pageSize
    || projects.length > total
    || (totalPages > 0 && page > totalPages)
    || totalPages !== (total === 0 ? 0 : Math.ceil(total / pageSize))) return null;
  return { items: projects, pagination: { page, pageSize, total, totalPages } };
}

export function isPublicContentId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseSiteLogPage(value: unknown): PublicSiteLogPage | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !isRecord(value.pagination)
    || value.items.length > 100) return null;
  const logs = value.items.map(parseSiteLog);
  const { page, pageSize, total, totalPages } = value.pagination;
  if (!logs.every((log): log is PublicSiteLog => log !== null)
    || !isIntegerInRange(page, 1, 10_000) || !isIntegerInRange(pageSize, 1, 100)
    || !isIntegerInRange(total, 0, 10_000_000)
    || !isIntegerInRange(totalPages, 0, 10_000)
    || logs.length > pageSize || logs.length > total
    || (totalPages > 0 && page > totalPages)
    || totalPages !== (total === 0 ? 0 : Math.ceil(total / pageSize))) return null;
  return { items: logs, pagination: { page, pageSize, total, totalPages } };
}

function parseSiteLog(value: unknown): PublicSiteLog | null {
  if (!isRecord(value) || typeof value.id !== "string" || !UUID_PATTERN.test(value.id)
    || !isNullableBoundedString(value.stage_code, 80)
    || (value.stage_label !== undefined
      && !isNullableBoundedString(value.stage_label, 80))
    || !isNullableBoundedString(value.node_name, 120)
    || !isBoundedString(value.created_at, 1, 80)) return null;
  const images = parseHttpsArray(value.images, 9);
  return images ? {
    id: value.id,
    stage_code: value.stage_code,
    stage_label: value.stage_label ?? null,
    node_name: value.node_name,
    images,
    created_at: value.created_at,
  } : null;
}

function parseProjects(value: unknown, limit: number): PublicProject[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const projects = value.map(parseProject);
  return projects.every((project): project is PublicProject => project !== null)
    ? projects
    : null;
}

function parseOptionalProjects(value: unknown, limit: number): PublicProject[] | null {
  return value === undefined ? [] : parseProjects(value, limit);
}

function uniqueProjects(projects: PublicProject[]): PublicProject[] {
  return [...new Map(projects.map((project) => [project.id, project])).values()];
}

function parseProjectPhase(
  phase: unknown,
  legacyStatus: unknown,
): PublicProjectPhase | null {
  if (phase !== undefined) {
    return phase === "in_progress" || phase === "completed" ? phase : null;
  }
  if (legacyStatus === "started" || legacyStatus === "constructing") {
    return "in_progress";
  }
  return legacyStatus === "acceptance" ? "completed" : null;
}

function parseHomeBanners(value: unknown): HomeBanner[] | null {
  if (!Array.isArray(value) || value.length > 5) return null;
  const banners: HomeBanner[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isHttps(item.image_url)
      || !isBoundedString(item.title, 0, 40)
      || !isBoundedString(item.subtitle, 0, 80)) return null;
    banners.push({ image_url: item.image_url, title: item.title, subtitle: item.subtitle });
  }
  return banners;
}

function parseMetrics(value: unknown): Array<{ label: string; value: string }> | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const metrics: Array<{ label: string; value: string }> = [];
  for (const item of value) {
    if (!isRecord(item) || !isBoundedString(item.label, 0, 16)
      || !isBoundedString(item.value, 0, 16)) return null;
    metrics.push({ label: item.label, value: item.value });
  }
  return metrics;
}

function parseAddressRegion(value: Record<string, unknown>) {
  if (!isNullableBoundedString(value.province, 80)
    || !isNullableBoundedString(value.city, 80)
    || !isNullableBoundedString(value.district, 80)) return null;
  return { province: value.province, city: value.city, district: value.district };
}

function parseServiceRegions(value: unknown): ServiceRegion[] | null {
  if (!Array.isArray(value) || value.length > 50) return null;
  const regions: ServiceRegion[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isNullableBoundedString(item.province, 80)
      || !isBoundedString(item.city, 1, 80)
      || !isNullableBoundedString(item.district, 80)) return null;
    regions.push({ province: item.province, city: item.city, district: item.district });
  }
  return regions;
}

function parseQualifications(value: unknown) {
  if (!Array.isArray(value) || value.length > 12) return null;
  const qualifications: Array<{ title: string; image_url: string | null }> = [];
  const titles = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !isBoundedString(item.title, 1, 40)
      || !isHttpsOrNull(item.image_url)) return null;
    if (titles.has(item.title)) continue;
    titles.add(item.title);
    qualifications.push({ title: item.title, image_url: item.image_url });
  }
  return qualifications;
}

function parseHttpsArray(value: unknown, limit: number): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  return [...new Set(value.filter(isHttps))].slice(0, limit);
}

function parseStringArray(value: unknown, limit: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const result: string[] = [];
  for (const item of value) {
    if (!isBoundedString(item, 1, maxLength)) return null;
    if (!result.includes(item)) result.push(item);
  }
  return result.slice(0, limit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHttps(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/[^\s]+$/i.test(value);
}

function isHttpsOrNull(value: unknown): value is string | null {
  return value === null || isHttps(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseContactSlaText(value: unknown): string | null {
  if (value === undefined) return DOUYIN_DEFAULT_CONTACT_SLA_TEXT;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 80
    ? normalized
    : null;
}

function isBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isNullableBoundedString(value: unknown, max: number): value is string | null {
  return value === null || isBoundedString(value, 0, max);
}

function isNonNegativeNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
