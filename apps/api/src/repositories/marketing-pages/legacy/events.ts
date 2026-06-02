import {
  Errors,
  PROJECT_OPTION_SELECT,
  compareMarketingPageListOrder,
  escapeSupabaseOrValue,
  getErrorMessage,
  type ConvertMarketingLeadInput,
  type MarketingCustomerRecord,
  type MarketingEventRecord,
  type MarketingLeadListQuery,
  type MarketingLeadRecord,
  type MarketingPageConfigInput,
  type MarketingPageListQuery,
  type MarketingPageProjectOptionQuery,
  type MarketingPageProjectOptionRow,
  type MarketingPageRecord,
  type MarketingPageVersionRecord,
  type PublicMarketingPageListQuery,
  type SubmitMarketingLeadInput,
  type TrackMarketingEventInput,
  type UpdateMarketingLeadInput,
  type UpdateMarketingPageInput,
} from "./shared";

export async function createEvent(this: any, input: TrackMarketingEventInput & {
  tenantId: string | null;
  pageId: string;
  pageVersionId: string;
  requestIp: string | null;
  userAgent: string | null;
  customerId?: string | null;
  wxOpenid?: string | null;
}) {
  const { data, error } = await this.events()
    .insert({
      tenant_id: input.tenantId,
      page_id: input.pageId,
      page_version_id: input.pageVersionId,
      event_name: input.event_name,
      block_id: input.block_id ?? null,
      payload: input.payload,
      customer_id: input.customerId ?? null,
      wx_openid: input.wxOpenid ?? null,
      request_ip: input.requestIp,
      user_agent: input.userAgent,
    })
    .select("*")
    .single();

  if (error) {
    throw Errors.dbError("记录 H5 营销埋点失败", error);
  }

  return data as MarketingEventRecord;
}

export function ensureUniqueViolation(this: any, error: unknown, message: string) {
  if (getErrorMessage(error).includes("duplicate key")) {
    throw Errors.badRequest(message);
  }
}
