import {
  Errors,
  accessPolicyService,
  buildCopiedSlug,
  buildCopiedTitle,
  createDefaultConfig,
  createProjectImageMap,
  getDedupSince,
  getH5BaseUrl,
  getH5MarketingTokenExpiresAt,
  getPhoneTail,
  getSortStep,
  marketingPageRepository,
  resolveMarketingPageCover,
  resolveStoredFileUrl,
  serializeProjectOption,
  signH5MarketingToken,
  verifyH5MarketingToken,
  type AuthContext,
  type ConvertMarketingLeadInput,
  type CreateMarketingPageInput,
  type DuplicateMarketingPageInput,
  type H5MarketingIdentity,
  type MarketingLeadListQuery,
  type MarketingPageConfigInput,
  type MarketingPageListQuery,
  type MarketingPageProjectOptionQuery,
  type PublicMarketingPageListQuery,
  type ReorderMarketingPageInput,
  type SubmitMarketingLeadInput,
  type TrackMarketingEventInput,
  type UpdateMarketingLeadInput,
  type UpdateMarketingPageInput,
} from "./shared";

export function assertPlatformAdmin(this: any, authContext: AuthContext) {
  if (!authContext.isPlatformAdmin) {
    throw Errors.forbidden();
  }
}

export async function listPages(this: any, authContext: AuthContext, query: MarketingPageListQuery) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const result = await marketingPageRepository.listPages(query, tenantId);
  return {
    ...result,
    list: result.list.map((page) => resolveMarketingPageCover(page)),
  };
}

export async function listPlatformPages(this: any, authContext: AuthContext, query: MarketingPageListQuery) {
  this.assertPlatformAdmin(authContext);
  const result = await marketingPageRepository.listPages(query, null, true);
  return {
    ...result,
    list: result.list.map((page) => resolveMarketingPageCover(page)),
  };
}

export async function getNextActiveSortOrder(this: any, tenantId?: string | null, platformScope = false) {
  const activePages = await marketingPageRepository.listActivePublishedPages(
    tenantId,
    platformScope,
  );
  return Math.min(9999, (activePages.length + 1) * 100);
}

export async function reorderActivePages(this: any, input: {
  pageId: string;
  tenantId?: string | null;
  platformScope?: boolean;
  employeeId: string | null;
  action: ReorderMarketingPageInput["action"];
}) {
  const activePages = await marketingPageRepository.listActivePublishedPages(
    input.tenantId,
    input.platformScope,
  );
  const currentIndex = activePages.findIndex((page) => page.id === input.pageId);

  if (currentIndex < 0) {
    throw Errors.badRequest("只有已发布且当前有效的 H5 活动页可以调整展示顺序");
  }

  const reordered = [...activePages];
  if (input.action === "pin_top" && currentIndex > 0) {
    const [current] = reordered.splice(currentIndex, 1);
    reordered.unshift(current!);
  }

  if (input.action === "move_up" && currentIndex > 0) {
    [reordered[currentIndex - 1], reordered[currentIndex]] = [
      reordered[currentIndex]!,
      reordered[currentIndex - 1]!,
    ];
  }

  if (input.action === "move_down" && currentIndex < reordered.length - 1) {
    [reordered[currentIndex], reordered[currentIndex + 1]] = [
      reordered[currentIndex + 1]!,
      reordered[currentIndex]!,
    ];
  }

  const step = getSortStep(reordered.length);
  await Promise.all(reordered.map((page, index) =>
    marketingPageRepository.updatePageSortOrder({
      id: page.id,
      sortOrder: Math.min(9999, (index + 1) * step),
      tenantId: input.tenantId,
      platformScope: input.platformScope,
      employeeId: input.employeeId,
    })
  ));

  const newIndex = reordered.findIndex((page) => page.id === input.pageId);
  const page = input.platformScope
    ? await marketingPageRepository.findPageById(input.pageId, null, true)
    : await marketingPageRepository.findPageById(input.pageId, input.tenantId);

  return {
    page: resolveMarketingPageCover(page),
    order: newIndex >= 0 ? newIndex + 1 : null,
    total: reordered.length,
  };
}

export async function listPublishedEntries(this: any, query: PublicMarketingPageListQuery = {}) {
  const tenant = query.tenant_slug
    ? await marketingPageRepository.findTenantBySlug(query.tenant_slug)
    : null;
  if (query.tenant_slug && !tenant) {
    throw Errors.notFound("租户不存在或不可用");
  }

  const pages = await marketingPageRepository.listPublishedPageEntries(
    query,
    tenant?.id ?? null,
  );
  const h5BaseUrl = getH5BaseUrl();

  return {
    list: pages.map((page) => ({
      id: page.id,
      title: page.title,
      slug: page.slug,
      description: page.description,
      cover_image: resolveStoredFileUrl(page.cover_image),
      display_scene: page.display_scene,
      sort_order: page.sort_order,
      tenant_slug: tenant?.slug ?? null,
      url: tenant
        ? `${h5BaseUrl}/t/${encodeURIComponent(tenant.slug)}/p/${encodeURIComponent(page.slug)}`
        : `${h5BaseUrl}/p/${encodeURIComponent(page.slug)}`,
      start_at: page.start_at,
      end_at: page.end_at,
      published_at: page.published_at,
      updated_at: page.updated_at,
    })),
  };
}

export async function listProjectOptions(this: any, 
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

export async function reorderPage(this: any, 
  authContext: AuthContext,
  id: string,
  input: ReorderMarketingPageInput,
) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  await this.getExistingPage(id, tenantId);

  return this.reorderActivePages({
    pageId: id,
    tenantId,
    employeeId: authContext.employeeId,
    action: input.action,
  });
}

export async function reorderPlatformPage(this: any, 
  authContext: AuthContext,
  id: string,
  input: ReorderMarketingPageInput,
) {
  this.assertPlatformAdmin(authContext);
  await this.getExistingPage(id, null, true);

  return this.reorderActivePages({
    pageId: id,
    tenantId: null,
    platformScope: true,
    employeeId: authContext.employeeId,
    action: input.action,
  });
}
