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

export async function getPublishedPageBySlug(this: any, slug: string, tenantSlug?: string | null) {
  const tenant = tenantSlug
    ? await marketingPageRepository.findTenantBySlug(tenantSlug)
    : null;
  if (tenantSlug && !tenant) {
    throw Errors.notFound("租户不存在或不可用");
  }

  const page = tenant
    ? await marketingPageRepository.findPageBySlugAndTenantId(slug, tenant.id)
    : await marketingPageRepository.findPageBySlugAndPlatform(slug);
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
    !page.tenant_id,
  );
  if (!version || version.status !== "published") {
    throw Errors.notFound("H5 活动页不存在或未发布");
  }

  return {
    page: resolveMarketingPageCover(page),
    tenant,
    version,
    config: version.config,
  };
}

export async function createH5Session(this: any, input: {
  authUserId: string;
  openid: string | null;
  slug: string;
  tenantSlug?: string | null;
  scene?: string | null;
}) {
  const publishedPage = await this.getPublishedPageBySlug(input.slug, input.tenantSlug);

  const customer = await marketingPageRepository.findCustomerByAuthUserId(
    input.authUserId,
    publishedPage.page.tenant_id,
  );
  const expiresAt = getH5MarketingTokenExpiresAt();
  const token = signH5MarketingToken({
    sub: input.authUserId,
    openid: input.openid ?? undefined,
    tenant_id: publishedPage.page.tenant_id,
    slug: input.slug,
    customer_id: customer?.id ?? null,
    scene: input.scene ?? null,
  });

  return {
    token,
    expires_at: expiresAt,
    tenant_id: publishedPage.page.tenant_id,
    tenant_slug: publishedPage.tenant?.slug ?? input.tenantSlug ?? null,
    identity_status: customer || input.openid ? "identified" : "anonymous",
    customer_id: customer?.id ?? null,
  };
}

export function resolveH5MarketingIdentity(this: any, 
  token: string | null | undefined,
  slug: string,
  tenantId: string | null,
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
    result.payload.slug !== slug ||
    (result.payload.tenant_id && result.payload.tenant_id !== tenantId)
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

export function isWithinDisplayWindow(this: any, page: {
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
