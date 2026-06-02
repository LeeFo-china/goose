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

export async function submitLead(this: any, input: SubmitMarketingLeadInput & {
  slug: string;
  tenantSlug?: string | null;
  requestIp: string | null;
  userAgent: string | null;
}) {
  const publishedPage = await this.getPublishedPageBySlug(input.slug, input.tenantSlug);
  const phone = input.phone?.trim() || null;
  const identity = this.resolveH5MarketingIdentity(
    input.token,
    input.slug,
    publishedPage.page.tenant_id,
  );

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

export async function trackEvent(this: any, input: TrackMarketingEventInput & {
  slug: string;
  tenantSlug?: string | null;
  requestIp: string | null;
  userAgent: string | null;
}) {
  const publishedPage = await this.getPublishedPageBySlug(input.slug, input.tenantSlug);
  const identity = this.resolveH5MarketingIdentity(
    input.token,
    input.slug,
    publishedPage.page.tenant_id,
  );

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

export async function listLeads(this: any, authContext: AuthContext, query: MarketingLeadListQuery) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  return marketingPageRepository.listLeads(query, tenantId);
}

export async function updateLead(this: any, 
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

export async function convertLeadToCustomer(this: any, 
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
