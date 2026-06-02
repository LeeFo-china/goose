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

export async function getPage(this: any, authContext: AuthContext, id: string) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const page = await this.getExistingPage(id, tenantId);
  const [draftVersion, publishedVersion] = await Promise.all([
    marketingPageRepository.findDraftVersion(id, tenantId),
    page.published_version_id
      ? marketingPageRepository.findVersionById(page.published_version_id, tenantId)
      : Promise.resolve(null),
  ]);

  return {
    ...resolveMarketingPageCover(page),
    draft_version: draftVersion,
    published_version: publishedVersion,
  };
}

export async function getPlatformPage(this: any, authContext: AuthContext, id: string) {
  this.assertPlatformAdmin(authContext);
  const page = await this.getExistingPage(id, null, true);
  const [draftVersion, publishedVersion] = await Promise.all([
    marketingPageRepository.findDraftVersion(id, null, true),
    page.published_version_id
      ? marketingPageRepository.findVersionById(page.published_version_id, null, true)
      : Promise.resolve(null),
  ]);

  return {
    ...resolveMarketingPageCover(page),
    draft_version: draftVersion,
    published_version: publishedVersion,
  };
}

export async function createPage(this: any, authContext: AuthContext, input: CreateMarketingPageInput) {
  await this.assertSlugAvailable(input.slug);
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const sortOrder = input.sort_order ?? await this.getNextActiveSortOrder(tenantId);

  const page = await marketingPageRepository.createPage({
    tenantId,
    title: input.title,
    slug: input.slug,
    description: input.description ?? null,
    cover_image: input.cover_image ?? null,
    display_scene: input.display_scene ?? "all",
    sort_order: sortOrder,
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
    ...resolveMarketingPageCover(page),
    draft_version: draftVersion,
    published_version: null,
  };
}

export async function createPlatformPage(this: any, authContext: AuthContext, input: CreateMarketingPageInput) {
  this.assertPlatformAdmin(authContext);
  await this.assertSlugAvailable(input.slug);
  const sortOrder = input.sort_order ?? await this.getNextActiveSortOrder(null, true);

  const page = await marketingPageRepository.createPage({
    tenantId: null,
    title: input.title,
    slug: input.slug,
    description: input.description ?? null,
    cover_image: input.cover_image ?? null,
    display_scene: input.display_scene ?? "all",
    sort_order: sortOrder,
    start_at: input.start_at ?? null,
    end_at: input.end_at ?? null,
    employeeId: authContext.employeeId,
  });

  const config = input.config ?? createDefaultConfig(input.title);
  const draftVersion = await marketingPageRepository.createVersion({
    tenantId: null,
    pageId: page.id,
    versionNo: 1,
    status: "draft",
    config,
    employeeId: authContext.employeeId,
  });

  return {
    ...resolveMarketingPageCover(page),
    draft_version: draftVersion,
    published_version: null,
  };
}

export async function updatePage(this: any, 
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

export async function updatePlatformPage(this: any, 
  authContext: AuthContext,
  id: string,
  input: UpdateMarketingPageInput,
) {
  this.assertPlatformAdmin(authContext);
  const existing = await this.getExistingPage(id, null, true);

  if (input.slug && input.slug !== existing.slug) {
    await this.assertSlugAvailable(input.slug, id);
  }

  const page = await marketingPageRepository.updatePage(id, {
    ...input,
    tenantId: null,
    platformScope: true,
    employeeId: authContext.employeeId,
  });

  return this.getPlatformPage(authContext, page.id);
}

export async function archivePage(this: any, authContext: AuthContext, id: string) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  await this.getExistingPage(id, tenantId);
  return resolveMarketingPageCover(
    await marketingPageRepository.archivePage(id, authContext.employeeId, tenantId),
  );
}

export async function archivePlatformPage(this: any, authContext: AuthContext, id: string) {
  this.assertPlatformAdmin(authContext);
  await this.getExistingPage(id, null, true);
  return resolveMarketingPageCover(
    await marketingPageRepository.archivePage(id, authContext.employeeId, null, true),
  );
}

export async function offlinePage(this: any, authContext: AuthContext, id: string) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  await this.getExistingPage(id, tenantId);
  return resolveMarketingPageCover(
    await marketingPageRepository.setPageOffline(id, authContext.employeeId, tenantId),
  );
}

export async function offlinePlatformPage(this: any, authContext: AuthContext, id: string) {
  this.assertPlatformAdmin(authContext);
  await this.getExistingPage(id, null, true);
  return resolveMarketingPageCover(
    await marketingPageRepository.setPageOffline(id, authContext.employeeId, null, true),
  );
}

export async function getExistingPage(this: any, 
  id: string,
  tenantId?: string | null,
  platformScope = false,
) {
  const page = await marketingPageRepository.findPageById(id, tenantId, platformScope);
  if (!page || page.status === "archived") {
    throw Errors.notFound("H5 活动页不存在");
  }

  return page;
}

export async function assertSlugAvailable(this: any, slug: string, excludeId?: string) {
  const existing = await marketingPageRepository.findPageBySlug(slug);
  if (existing && existing.id !== excludeId) {
    throw Errors.badRequest("页面路径已存在");
  }
}
