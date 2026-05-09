import { Errors } from "@/errors/error-factory";
import {
  marketingPageRepository,
  type MarketingPageProjectOptionRow,
} from "@/repositories/marketing-pages";
import type {
  ConvertMarketingLeadInput,
  CreateMarketingPageInput,
  DuplicateMarketingPageInput,
  MarketingLeadListQuery,
  MarketingPageConfigInput,
  MarketingPageListQuery,
  MarketingPageProjectOptionQuery,
  PublicMarketingPageListQuery,
  SubmitMarketingLeadInput,
  TrackMarketingEventInput,
  UpdateMarketingLeadInput,
  UpdateMarketingPageInput,
} from "@/schema/marketing-pages";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  getH5MarketingTokenExpiresAt,
  signH5MarketingToken,
  verifyH5MarketingToken,
} from "@/utils/jwt";

function createDefaultConfig(title: string): MarketingPageConfigInput {
  return {
    schemaVersion: 1,
    title,
    blocks: [],
  };
}

function buildCopiedTitle(title: string) {
  const copiedTitle = `${title} 副本`;
  return copiedTitle.length > 120 ? copiedTitle.slice(0, 120) : copiedTitle;
}

function buildCopiedSlug(slug: string, suffix: string) {
  const maxBaseLength = 80 - suffix.length - 1;
  const base = slug.slice(0, Math.max(maxBaseLength, 1)).replace(/-+$/g, "");
  return `${base}-${suffix}`;
}

function getH5BaseUrl() {
  return (process.env.H5_MARKETING_BASE_URL || "https://h5.goodcms.cn")
    .replace(/\/+$/g, "");
}

function getPhoneTail(phone: string | null | undefined) {
  return phone ? phone.slice(-4) : null;
}

function getDedupSince() {
  const since = new Date();
  since.setHours(since.getHours() - 24);
  return since.toISOString();
}

function normalizeRelation<T extends Record<string, unknown>>(
  value: unknown,
  fallback: T,
): T {
  if (Array.isArray(value)) {
    const first = value[0];
    if (first && typeof first === "object") {
      return { ...fallback, ...(first as T) };
    }

    return fallback;
  }

  if (value && typeof value === "object") {
    return { ...fallback, ...(value as T) };
  }

  return fallback;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProjectLogImages(images: unknown) {
  if (!Array.isArray(images)) {
    return [] as string[];
  }

  return images
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createProjectImageMap(rows: MarketingPageProjectOptionRow[]) {
  const imageMap = new Map<string, string[]>();

  for (const row of rows) {
    const projectId = typeof row.project_id === "string" ? row.project_id : "";
    if (!projectId) {
      continue;
    }

    const currentImages = imageMap.get(projectId) || [];
    if (currentImages.length >= 8) {
      continue;
    }

    for (const imageUrl of normalizeProjectLogImages(row.images)) {
      if (!currentImages.includes(imageUrl)) {
        currentImages.push(imageUrl);
      }

      if (currentImages.length >= 8) {
        break;
      }
    }

    if (currentImages.length > 0) {
      imageMap.set(projectId, currentImages);
    }
  }

  return imageMap;
}

function formatArea(value: unknown) {
  if (typeof value === "number") {
    return `${value}m²`;
  }

  if (typeof value === "string" && value.trim()) {
    return `${value.trim()}m²`;
  }

  return null;
}

function serializeProjectOption(
  row: MarketingPageProjectOptionRow,
  imageMap: Map<string, string[]>,
) {
  const property = normalizeRelation(row.property, {
    community: null,
    building_info: null,
    area: null,
    layout: null,
  });
  const customer = normalizeRelation(row.customer, {
    name: null,
  });
  const projectId = typeof row.id === "string" ? row.id : "";
  const imageUrls = imageMap.get(projectId) || [];
  const propertyParts = [
    property.community,
    property.layout,
    formatArea(property.area),
  ].filter(Boolean);

  return {
    id: projectId,
    projectId,
    title: typeof row.name === "string" && row.name.trim()
      ? row.name
      : "未命名项目",
    subtitle: propertyParts.join(" · ") || (typeof row.address === "string" ? row.address : ""),
    imageUrl: imageUrls[0] || "",
    imageUrls,
    status: typeof row.status === "string" ? row.status : null,
    customer_name: typeof customer.name === "string" ? customer.name : null,
    property,
    style_tags: normalizeStringArray(row.style_tags),
  };
}

type H5IdentityStatus = "identified" | "expired" | "anonymous";

type H5MarketingIdentity = {
  status: H5IdentityStatus;
  customerId: string | null;
  wxOpenid: string | null;
};

class MarketingPageService {
  async listPages(authContext: AuthContext, query: MarketingPageListQuery) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    return marketingPageRepository.listPages(query, tenantId);
  }

  async listPublishedEntries(query: PublicMarketingPageListQuery = {}) {
    const pages = await marketingPageRepository.listPublishedPageEntries(query);
    const h5BaseUrl = getH5BaseUrl();

    return {
      list: pages.map((page) => ({
        id: page.id,
        title: page.title,
        slug: page.slug,
        description: page.description,
        cover_image: page.cover_image,
        display_scene: page.display_scene,
        sort_order: page.sort_order,
        url: `${h5BaseUrl}/p/${encodeURIComponent(page.slug)}`,
        start_at: page.start_at,
        end_at: page.end_at,
        published_at: page.published_at,
        updated_at: page.updated_at,
      })),
    };
  }

  async listProjectOptions(
    authContext: AuthContext,
    query: MarketingPageProjectOptionQuery,
  ) {
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project.read",
    );
    const data = await marketingPageRepository.listProjectOptions(
      query,
      visibleProjectIds,
      authContext.tenantId,
    );
    const projectIds = data.list
      .map((item) => typeof item.id === "string" ? item.id : "")
      .filter(Boolean);
    const imageMap = createProjectImageMap(
      await marketingPageRepository.listLatestProjectLogCoverImages(
        projectIds,
        authContext.tenantId,
      ),
    );

    return {
      list: data.list.map((item) => serializeProjectOption(item, imageMap)),
      pagination: data.pagination,
    };
  }

  async getPage(authContext: AuthContext, id: string) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const page = await this.getExistingPage(id, tenantId);
    const [draftVersion, publishedVersion] = await Promise.all([
      marketingPageRepository.findDraftVersion(id, tenantId),
      page.published_version_id
        ? marketingPageRepository.findVersionById(page.published_version_id, tenantId)
        : Promise.resolve(null),
    ]);

    return {
      ...page,
      draft_version: draftVersion,
      published_version: publishedVersion,
    };
  }

  async createPage(authContext: AuthContext, input: CreateMarketingPageInput) {
    await this.assertSlugAvailable(input.slug);
    const tenantId = accessPolicyService.assertTenantId(authContext);

    const page = await marketingPageRepository.createPage({
      tenantId,
      title: input.title,
      slug: input.slug,
      description: input.description ?? null,
      cover_image: input.cover_image ?? null,
      display_scene: input.display_scene ?? "all",
      sort_order: input.sort_order ?? 100,
      start_at: input.start_at ?? null,
      end_at: input.end_at ?? null,
      employeeId: authContext.employeeId,
    });

    const config = input.config ?? createDefaultConfig(input.title);
    const draftVersion = await marketingPageRepository.createVersion({
      tenantId,
      pageId: page.id,
      versionNo: 1,
      status: "draft",
      config,
      employeeId: authContext.employeeId,
    });

    return {
      ...page,
      draft_version: draftVersion,
      published_version: null,
    };
  }

  async updatePage(
    authContext: AuthContext,
    id: string,
    input: UpdateMarketingPageInput,
  ) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const existing = await this.getExistingPage(id, tenantId);

    if (input.slug && input.slug !== existing.slug) {
      await this.assertSlugAvailable(input.slug, id);
    }

    const page = await marketingPageRepository.updatePage(id, {
      ...input,
      tenantId,
      employeeId: authContext.employeeId,
    });

    return this.getPage(authContext, page.id);
  }

  async archivePage(authContext: AuthContext, id: string) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    await this.getExistingPage(id, tenantId);
    return marketingPageRepository.archivePage(id, authContext.employeeId, tenantId);
  }

  async getDraft(authContext: AuthContext, id: string) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const page = await this.getExistingPage(id, tenantId);
    const draftVersion = await this.getOrCreateDraftVersion(
      page.id,
      page.tenant_id,
      createDefaultConfig(page.title),
      page.created_by,
    );

    return {
      page,
      draft_version: draftVersion,
    };
  }

  async saveDraft(
    authContext: AuthContext,
    id: string,
    config: MarketingPageConfigInput,
  ) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const page = await this.getExistingPage(id, tenantId);
    const draftVersion = await this.getOrCreateDraftVersion(
      page.id,
      page.tenant_id,
      config,
      authContext.employeeId,
    );

    const savedVersion = await marketingPageRepository.updateDraftVersion({
      versionId: draftVersion.id,
      tenantId,
      config,
    });

    await marketingPageRepository.updatePage(page.id, {
      title: config.title || page.title,
      tenantId,
      employeeId: authContext.employeeId,
    });

    return {
      page: await marketingPageRepository.findPageById(page.id, tenantId),
      draft_version: savedVersion,
    };
  }

  async publishPage(authContext: AuthContext, id: string) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const page = await this.getExistingPage(id, tenantId);
    const draftVersion = await marketingPageRepository.findDraftVersion(page.id, tenantId);
    if (!draftVersion) {
      throw Errors.badRequest("请先保存草稿后再发布");
    }

    const publishedAt = new Date().toISOString();
    const nextVersionNo = await this.getNextVersionNo(page.id);

    await marketingPageRepository.archivePublishedVersions(page.id, tenantId);

    const publishedVersion = await marketingPageRepository.createVersion({
      tenantId,
      pageId: page.id,
      versionNo: nextVersionNo,
      status: "published",
      config: draftVersion.config,
      employeeId: authContext.employeeId,
      publishedAt,
    });

    const publishedPage = await marketingPageRepository.markPagePublished({
      pageId: page.id,
      tenantId,
      versionId: publishedVersion.id,
      employeeId: authContext.employeeId,
      publishedAt,
    });

    return {
      ...publishedPage,
      draft_version: draftVersion,
      published_version: publishedVersion,
    };
  }

  async offlinePage(authContext: AuthContext, id: string) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    await this.getExistingPage(id, tenantId);
    return marketingPageRepository.setPageOffline(id, authContext.employeeId, tenantId);
  }

  async duplicatePage(
    authContext: AuthContext,
    id: string,
    input: DuplicateMarketingPageInput,
  ) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const sourcePage = await this.getExistingPage(id, tenantId);
    const sourceDraft = await marketingPageRepository.findDraftVersion(id, tenantId);
    const sourcePublished = sourcePage.published_version_id
      ? await marketingPageRepository.findVersionById(sourcePage.published_version_id, tenantId)
      : null;
    const sourceConfig = sourceDraft?.config ??
      sourcePublished?.config ??
      createDefaultConfig(sourcePage.title);
    const title = input.title ?? buildCopiedTitle(sourcePage.title);
    const slug = input.slug ?? await this.generateCopySlug(sourcePage.slug);

    await this.assertSlugAvailable(slug);

    const page = await marketingPageRepository.createPage({
      tenantId,
      title,
      slug,
      description: sourcePage.description,
      cover_image: sourcePage.cover_image,
      display_scene: sourcePage.display_scene,
      sort_order: sourcePage.sort_order,
      start_at: sourcePage.start_at,
      end_at: sourcePage.end_at,
      employeeId: authContext.employeeId,
    });

    const draftVersion = await marketingPageRepository.createVersion({
      tenantId,
      pageId: page.id,
      versionNo: 1,
      status: "draft",
      config: {
        ...sourceConfig,
        title,
      },
      employeeId: authContext.employeeId,
    });

    return {
      ...page,
      draft_version: draftVersion,
      published_version: null,
    };
  }

  async getPublishedPageBySlug(slug: string) {
    const page = await marketingPageRepository.findPageBySlug(slug);
    if (
      !page ||
      page.status !== "published" ||
      !page.published_version_id ||
      !this.isWithinDisplayWindow(page)
    ) {
      throw Errors.notFound("H5 活动页不存在或未发布");
    }

    const version = await marketingPageRepository.findVersionById(
      page.published_version_id,
      page.tenant_id,
    );
    if (!version || version.status !== "published") {
      throw Errors.notFound("H5 活动页不存在或未发布");
    }

    return {
      page,
      version,
      config: version.config,
    };
  }

  async createH5Session(input: {
    authUserId: string;
    openid: string | null;
    slug: string;
    scene?: string | null;
  }) {
    const publishedPage = await this.getPublishedPageBySlug(input.slug);

    const customer = await marketingPageRepository.findCustomerByAuthUserId(
      input.authUserId,
      publishedPage.page.tenant_id,
    );
    const expiresAt = getH5MarketingTokenExpiresAt();
    const token = signH5MarketingToken({
      sub: input.authUserId,
      openid: input.openid ?? undefined,
      slug: input.slug,
      customer_id: customer?.id ?? null,
      scene: input.scene ?? null,
    });

    return {
      token,
      expires_at: expiresAt,
      identity_status: customer || input.openid ? "identified" : "anonymous",
      customer_id: customer?.id ?? null,
    };
  }

  async submitLead(input: SubmitMarketingLeadInput & {
    slug: string;
    requestIp: string | null;
    userAgent: string | null;
  }) {
    const publishedPage = await this.getPublishedPageBySlug(input.slug);
    const phone = input.phone?.trim() || null;
    const identity = this.resolveH5MarketingIdentity(input.token, input.slug);

    if (!phone) {
      throw Errors.badRequest("请输入有效的手机号");
    }

    const existingLead = await marketingPageRepository.findRecentLeadByPageAndPhone({
      tenantId: publishedPage.page.tenant_id,
      pageId: publishedPage.page.id,
      phone,
      since: getDedupSince(),
    });

    if (existingLead) {
      const lead = await marketingPageRepository.updateRecentLeadSubmission(
        existingLead.id,
        {
          ...input,
          phone,
          tenantId: publishedPage.page.tenant_id,
          pageVersionId: publishedPage.version.id,
          customerId: identity.customerId,
          wxOpenid: identity.wxOpenid,
        },
      );

      return {
        lead_id: lead.id,
        already_submitted: true,
        updated_existing: true,
        phone_tail: getPhoneTail(lead.phone),
        identity_status: identity.status,
        message: "你已提交预约",
        lead,
      };
    }

    const lead = await marketingPageRepository.createLead({
      ...input,
      phone,
      tenantId: publishedPage.page.tenant_id,
      pageId: publishedPage.page.id,
      pageVersionId: publishedPage.version.id,
      customerId: identity.customerId,
      wxOpenid: identity.wxOpenid,
    });

    return {
      lead_id: lead.id,
      already_submitted: false,
      updated_existing: false,
      phone_tail: getPhoneTail(lead.phone),
      identity_status: identity.status,
      message: "预约已提交",
      lead,
    };
  }

  async trackEvent(input: TrackMarketingEventInput & {
    slug: string;
    requestIp: string | null;
    userAgent: string | null;
  }) {
    const publishedPage = await this.getPublishedPageBySlug(input.slug);
    const identity = this.resolveH5MarketingIdentity(input.token, input.slug);

    return marketingPageRepository.createEvent({
      ...input,
      tenantId: publishedPage.page.tenant_id,
      pageId: publishedPage.page.id,
      pageVersionId: publishedPage.version.id,
      payload: {
        ...input.payload,
        identity_status: identity.status,
      },
      customerId: identity.customerId,
      wxOpenid: identity.wxOpenid,
    });
  }

  async listLeads(authContext: AuthContext, query: MarketingLeadListQuery) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    return marketingPageRepository.listLeads(query, tenantId);
  }

  async updateLead(
    authContext: AuthContext,
    id: string,
    input: UpdateMarketingLeadInput,
  ) {
    return marketingPageRepository.updateLead(id, {
      ...input,
      tenantId: accessPolicyService.assertTenantId(authContext),
      employeeId: authContext.employeeId,
    });
  }

  async convertLeadToCustomer(
    authContext: AuthContext,
    id: string,
    input: ConvertMarketingLeadInput,
  ) {
    return marketingPageRepository.convertLeadToCustomer(id, {
      ...input,
      tenantId: accessPolicyService.assertTenantId(authContext),
      employeeId: authContext.employeeId,
    });
  }

  private async getExistingPage(id: string, tenantId?: string | null) {
    const page = await marketingPageRepository.findPageById(id, tenantId);
    if (!page || page.status === "archived") {
      throw Errors.notFound("H5 活动页不存在");
    }

    return page;
  }

  private resolveH5MarketingIdentity(
    token: string | null | undefined,
    slug: string,
  ): H5MarketingIdentity {
    if (!token) {
      return {
        status: "anonymous",
        customerId: null,
        wxOpenid: null,
      };
    }

    const result = verifyH5MarketingToken(token);
    if (result.reason === "expired") {
      return {
        status: "expired",
        customerId: null,
        wxOpenid: null,
      };
    }

    if (
      result.reason !== "valid" ||
      !result.payload ||
      result.payload.slug !== slug
    ) {
      return {
        status: "anonymous",
        customerId: null,
        wxOpenid: null,
      };
    }

    return {
      status: "identified",
      customerId: result.payload.customer_id ?? null,
      wxOpenid: result.payload.openid ?? null,
    };
  }

  private async assertSlugAvailable(slug: string, excludeId?: string) {
    const existing = await marketingPageRepository.findPageBySlug(slug);
    if (existing && existing.id !== excludeId) {
      throw Errors.badRequest("页面路径已存在");
    }
  }

  private async getNextVersionNo(pageId: string) {
    return (await marketingPageRepository.getLatestVersionNo(pageId)) + 1;
  }

  private async getOrCreateDraftVersion(
    pageId: string,
    tenantId: string | null,
    config: MarketingPageConfigInput,
    employeeId: string | null,
  ) {
    const existing = await marketingPageRepository.findDraftVersion(pageId, tenantId);
    if (existing) {
      return existing;
    }

    return marketingPageRepository.createVersion({
      tenantId,
      pageId,
      versionNo: await this.getNextVersionNo(pageId),
      status: "draft",
      config,
      employeeId,
    });
  }

  private async generateCopySlug(sourceSlug: string) {
    for (let index = 1; index <= 20; index += 1) {
      const suffix = index === 1 ? "copy" : `copy-${index}`;
      const candidate = buildCopiedSlug(sourceSlug, suffix);
      const existing = await marketingPageRepository.findPageBySlug(candidate);
      if (!existing) {
        return candidate;
      }
    }

    return buildCopiedSlug(sourceSlug, `copy-${Date.now().toString(36)}`);
  }

  private isWithinDisplayWindow(page: {
    start_at: string | null;
    end_at: string | null;
  }) {
    const now = Date.now();
    const startTime = page.start_at ? new Date(page.start_at).getTime() : null;
    const endTime = page.end_at ? new Date(page.end_at).getTime() : null;

    if (startTime && Number.isFinite(startTime) && startTime > now) {
      return false;
    }

    if (endTime && Number.isFinite(endTime) && endTime < now) {
      return false;
    }

    return true;
  }
}

export const marketingPageService = new MarketingPageService();
