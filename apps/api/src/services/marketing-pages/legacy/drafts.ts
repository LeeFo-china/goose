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

export async function getDraft(this: any, authContext: AuthContext, id: string) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const page = await this.getExistingPage(id, tenantId);
  const draftVersion = await this.getOrCreateDraftVersion(
    page.id,
    page.tenant_id,
    createDefaultConfig(page.title),
    page.created_by,
  );

  return {
    page: resolveMarketingPageCover(page),
    draft_version: draftVersion,
  };
}

export async function getPlatformDraft(this: any, authContext: AuthContext, id: string) {
  this.assertPlatformSiteContentPermission(authContext, "platform.site_content.read");
  const page = await this.getExistingPage(id, null, true);
  const draftVersion = await this.getOrCreateDraftVersion(
    page.id,
    null,
    createDefaultConfig(page.title),
    page.created_by,
    true,
  );

  return {
    page: resolveMarketingPageCover(page),
    draft_version: draftVersion,
  };
}

export async function saveDraft(this: any, 
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
    page: resolveMarketingPageCover(
      await marketingPageRepository.findPageById(page.id, tenantId),
    ),
    draft_version: savedVersion,
  };
}

export async function savePlatformDraft(this: any, 
  authContext: AuthContext,
  id: string,
  config: MarketingPageConfigInput,
) {
  this.assertPlatformSiteContentPermission(authContext, "platform.site_content.manage");
  const page = await this.getExistingPage(id, null, true);
  const draftVersion = await this.getOrCreateDraftVersion(
    page.id,
    null,
    config,
    authContext.employeeId,
    true,
  );

  const savedVersion = await marketingPageRepository.updateDraftVersion({
    versionId: draftVersion.id,
    tenantId: null,
    platformScope: true,
    config,
  });

  await marketingPageRepository.updatePage(page.id, {
    title: config.title || page.title,
    tenantId: null,
    platformScope: true,
    employeeId: authContext.employeeId,
  });

  return {
    page: resolveMarketingPageCover(
      await marketingPageRepository.findPageById(page.id, null, true),
    ),
    draft_version: savedVersion,
  };
}

export async function publishPage(this: any, authContext: AuthContext, id: string) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  const page = await this.getExistingPage(id, tenantId);
  const draftVersion = await marketingPageRepository.findDraftVersion(page.id, tenantId);
  if (!draftVersion) {
    throw Errors.badRequest("请先保存草稿后再发布");
  }

  const publishedAt = new Date().toISOString();
  const nextVersionNo = await this.getNextVersionNo(page.id);
  const sortOrder = page.status === "published"
    ? null
    : await this.getNextActiveSortOrder(tenantId);

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
    sortOrder,
  });

  return {
    ...resolveMarketingPageCover(publishedPage),
    draft_version: draftVersion,
    published_version: publishedVersion,
  };
}

export async function publishPlatformPage(this: any, authContext: AuthContext, id: string) {
  this.assertPlatformSiteContentPermission(authContext, "platform.site_content.publish");
  const page = await this.getExistingPage(id, null, true);
  const draftVersion = await marketingPageRepository.findDraftVersion(page.id, null, true);
  if (!draftVersion) {
    throw Errors.badRequest("请先保存草稿后再发布");
  }

  const publishedAt = new Date().toISOString();
  const nextVersionNo = await this.getNextVersionNo(page.id);
  const sortOrder = page.status === "published"
    ? null
    : await this.getNextActiveSortOrder(null, true);

  await marketingPageRepository.archivePublishedVersions(page.id, null, true);

  const publishedVersion = await marketingPageRepository.createVersion({
    tenantId: null,
    pageId: page.id,
    versionNo: nextVersionNo,
    status: "published",
    config: draftVersion.config,
    employeeId: authContext.employeeId,
    publishedAt,
  });

  const publishedPage = await marketingPageRepository.markPagePublished({
    pageId: page.id,
    tenantId: null,
    platformScope: true,
    versionId: publishedVersion.id,
    employeeId: authContext.employeeId,
    publishedAt,
    sortOrder,
  });

  return {
    ...resolveMarketingPageCover(publishedPage),
    draft_version: draftVersion,
    published_version: publishedVersion,
  };
}

export async function duplicatePage(this: any, 
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
    ...resolveMarketingPageCover(page),
    draft_version: draftVersion,
    published_version: null,
  };
}

export async function duplicatePlatformPage(this: any, 
  authContext: AuthContext,
  id: string,
  input: DuplicateMarketingPageInput,
) {
  this.assertPlatformSiteContentPermission(authContext, "platform.site_content.manage");
  const sourcePage = await this.getExistingPage(id, null, true);
  const sourceDraft = await marketingPageRepository.findDraftVersion(id, null, true);
  const sourcePublished = sourcePage.published_version_id
    ? await marketingPageRepository.findVersionById(sourcePage.published_version_id, null, true)
    : null;
  const sourceConfig = sourceDraft?.config ??
    sourcePublished?.config ??
    createDefaultConfig(sourcePage.title);
  const title = input.title ?? buildCopiedTitle(sourcePage.title);
  const slug = input.slug ?? await this.generateCopySlug(sourcePage.slug);

  await this.assertSlugAvailable(slug);

  const page = await marketingPageRepository.createPage({
    tenantId: null,
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
    tenantId: null,
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
    ...resolveMarketingPageCover(page),
    draft_version: draftVersion,
    published_version: null,
  };
}

export async function getNextVersionNo(this: any, pageId: string) {
  return (await marketingPageRepository.getLatestVersionNo(pageId)) + 1;
}

export async function getOrCreateDraftVersion(this: any, 
  pageId: string,
  tenantId: string | null,
  config: MarketingPageConfigInput,
  employeeId: string | null,
  platformScope = false,
) {
  const existing = await marketingPageRepository.findDraftVersion(pageId, tenantId, platformScope);
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

export async function generateCopySlug(this: any, sourceSlug: string) {
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
