import { Errors } from "@/errors/error-factory";
import { marketingPageRepository } from "@/repositories/marketing-pages";
import type {
  ConvertMarketingLeadInput,
  CreateMarketingPageInput,
  DuplicateMarketingPageInput,
  MarketingLeadListQuery,
  MarketingPageConfigInput,
  MarketingPageListQuery,
  PublicMarketingPageListQuery,
  SubmitMarketingLeadInput,
  TrackMarketingEventInput,
  UpdateMarketingLeadInput,
  UpdateMarketingPageInput,
} from "@/schema/marketing-pages";
import type { AuthContext } from "@/services/authorization";

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

class MarketingPageService {
  async listPages(query: MarketingPageListQuery) {
    return marketingPageRepository.listPages(query);
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

  async getPage(id: string) {
    const page = await this.getExistingPage(id);
    const [draftVersion, publishedVersion] = await Promise.all([
      marketingPageRepository.findDraftVersion(id),
      page.published_version_id
        ? marketingPageRepository.findVersionById(page.published_version_id)
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

    const page = await marketingPageRepository.createPage({
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
    const existing = await this.getExistingPage(id);

    if (input.slug && input.slug !== existing.slug) {
      await this.assertSlugAvailable(input.slug, id);
    }

    const page = await marketingPageRepository.updatePage(id, {
      ...input,
      employeeId: authContext.employeeId,
    });

    return this.getPage(page.id);
  }

  async archivePage(authContext: AuthContext, id: string) {
    await this.getExistingPage(id);
    return marketingPageRepository.archivePage(id, authContext.employeeId);
  }

  async getDraft(id: string) {
    const page = await this.getExistingPage(id);
    const draftVersion = await this.getOrCreateDraftVersion(
      page.id,
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
    const page = await this.getExistingPage(id);
    const draftVersion = await this.getOrCreateDraftVersion(
      page.id,
      config,
      authContext.employeeId,
    );

    const savedVersion = await marketingPageRepository.updateDraftVersion({
      versionId: draftVersion.id,
      config,
    });

    await marketingPageRepository.updatePage(page.id, {
      title: config.title || page.title,
      employeeId: authContext.employeeId,
    });

    return {
      page: await marketingPageRepository.findPageById(page.id),
      draft_version: savedVersion,
    };
  }

  async publishPage(authContext: AuthContext, id: string) {
    const page = await this.getExistingPage(id);
    const draftVersion = await marketingPageRepository.findDraftVersion(page.id);
    if (!draftVersion) {
      throw Errors.badRequest("请先保存草稿后再发布");
    }

    const publishedAt = new Date().toISOString();
    const nextVersionNo = await this.getNextVersionNo(page.id);

    await marketingPageRepository.archivePublishedVersions(page.id);

    const publishedVersion = await marketingPageRepository.createVersion({
      pageId: page.id,
      versionNo: nextVersionNo,
      status: "published",
      config: draftVersion.config,
      employeeId: authContext.employeeId,
      publishedAt,
    });

    const publishedPage = await marketingPageRepository.markPagePublished({
      pageId: page.id,
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
    await this.getExistingPage(id);
    return marketingPageRepository.setPageOffline(id, authContext.employeeId);
  }

  async duplicatePage(
    authContext: AuthContext,
    id: string,
    input: DuplicateMarketingPageInput,
  ) {
    const sourcePage = await this.getExistingPage(id);
    const sourceDraft = await marketingPageRepository.findDraftVersion(id);
    const sourcePublished = sourcePage.published_version_id
      ? await marketingPageRepository.findVersionById(sourcePage.published_version_id)
      : null;
    const sourceConfig = sourceDraft?.config ??
      sourcePublished?.config ??
      createDefaultConfig(sourcePage.title);
    const title = input.title ?? buildCopiedTitle(sourcePage.title);
    const slug = input.slug ?? await this.generateCopySlug(sourcePage.slug);

    await this.assertSlugAvailable(slug);

    const page = await marketingPageRepository.createPage({
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

  async submitLead(input: SubmitMarketingLeadInput & {
    slug: string;
    requestIp: string | null;
    userAgent: string | null;
  }) {
    const publishedPage = await this.getPublishedPageBySlug(input.slug);

    return marketingPageRepository.createLead({
      ...input,
      pageId: publishedPage.page.id,
      pageVersionId: publishedPage.version.id,
    });
  }

  async trackEvent(input: TrackMarketingEventInput & {
    slug: string;
    requestIp: string | null;
    userAgent: string | null;
  }) {
    const publishedPage = await this.getPublishedPageBySlug(input.slug);

    return marketingPageRepository.createEvent({
      ...input,
      pageId: publishedPage.page.id,
      pageVersionId: publishedPage.version.id,
    });
  }

  async listLeads(authContext: AuthContext, query: MarketingLeadListQuery) {
    return marketingPageRepository.listLeads(query);
  }

  async updateLead(
    authContext: AuthContext,
    id: string,
    input: UpdateMarketingLeadInput,
  ) {
    return marketingPageRepository.updateLead(id, {
      ...input,
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
      employeeId: authContext.employeeId,
    });
  }

  private async getExistingPage(id: string) {
    const page = await marketingPageRepository.findPageById(id);
    if (!page || page.status === "archived") {
      throw Errors.notFound("H5 活动页不存在");
    }

    return page;
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
    config: MarketingPageConfigInput,
    employeeId: string | null,
  ) {
    const existing = await marketingPageRepository.findDraftVersion(pageId);
    if (existing) {
      return existing;
    }

    return marketingPageRepository.createVersion({
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
