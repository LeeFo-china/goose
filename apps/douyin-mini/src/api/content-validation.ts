import type {
  BootstrapData,
  CompanyData,
  HomeBanner,
  PublicProject,
  PublicProjectPage,
  ServiceRegion,
} from "../models";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBootstrap(value: unknown): BootstrapData | null {
  if (!isRecord(value) || !isRecord(value.installation) || !isRecord(value.theme)
    || !isRecord(value.features) || !isRecord(value.content)) return null;
  const company = parseCompany(value.company);
  const homeBanners = parseHomeBanners(value.content.home_banners);
  const trustMetrics = parseMetrics(value.content.trust_metrics);
  const featuredCases = parseProjects(value.content.featured_cases, 6);
  const activeSites = parseProjects(value.content.active_sites, 6);
  if (!company || !homeBanners || !trustMetrics || !featuredCases || !activeSites
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
      featured_cases: featuredCases,
      active_sites: activeSites,
    },
    privacy_policy_version: value.privacy_policy_version,
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
    || !isNullableBoundedString(value.budget_band, 40)
    || !isBoundedString(value.community, 0, 120)
    || !isNullableBoundedString(value.city, 80)
    || !isNullableBoundedString(value.district, 80)
    || !isNullableBoundedString(value.status, 80)
    || !isNullableBoundedString(value.start_date, 40)
    || !isBoundedString(value.updated_at, 1, 80)
    || !isNullableBoundedString(value.description, 2_000)) return null;
  const publicImages = parseHttpsArray(value.public_images, 9);
  const styleTags = parseStringArray(value.style_tags, 12, 40);
  if (!publicImages || !styleTags) return null;
  return {
    id: value.id,
    title: value.title,
    cover_image_url: value.cover_image_url,
    public_images: publicImages,
    style_tags: styleTags,
    layout: value.layout,
    area: value.area,
    budget_band: value.budget_band,
    community: value.community,
    city: value.city,
    district: value.district,
    status: value.status,
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

function parseProjects(value: unknown, limit: number): PublicProject[] | null {
  if (!Array.isArray(value) || value.length > limit) return null;
  const projects = value.map(parseProject);
  return projects.every((project): project is PublicProject => project !== null)
    ? projects
    : null;
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
