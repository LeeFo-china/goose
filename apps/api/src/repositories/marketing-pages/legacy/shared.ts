import { Errors } from "@/errors/error-factory";
import type {
  ConvertMarketingLeadInput,
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

export type MarketingPageRecord = {
  id: string;
  tenant_id: string | null;
  title: string;
  slug: string;
  status: "draft" | "published" | "offline" | "archived";
  description: string | null;
  cover_image: string | null;
  display_scene: "all" | "home" | "customer_home" | "project_detail" | "marketing_list";
  sort_order: number;
  start_at: string | null;
  end_at: string | null;
  published_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingPageVersionRecord = {
  id: string;
  tenant_id: string | null;
  page_id: string;
  version_no: number;
  status: "draft" | "published" | "archived";
  schema_version: number;
  config: MarketingPageConfigInput;
  created_by: string | null;
  created_at: string;
  published_at: string | null;
};

export type MarketingLeadRecord = {
  id: string;
  tenant_id: string | null;
  page_id: string | null;
  page_version_id: string | null;
  name: string | null;
  phone: string | null;
  community: string | null;
  city: string | null;
  form_data: Record<string, unknown>;
  source: string;
  lead_status: "new" | "contacted" | "converted" | "invalid";
  follow_remark: string | null;
  followed_by: string | null;
  followed_at: string | null;
  wx_openid: string | null;
  customer_id: string | null;
  request_ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export type MarketingEventRecord = {
  id: string;
  tenant_id: string | null;
  page_id: string | null;
  page_version_id: string | null;
  event_name: string;
  block_id: string | null;
  payload: Record<string, unknown>;
  wx_openid: string | null;
  customer_id: string | null;
  request_ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export type MarketingPageProjectOptionRow = Record<string, unknown>;

export type MarketingCustomerRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  owner_id: string | null;
};

export type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  delete: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  neq: (...args: unknown[]) => UntypedTable;
  is: (...args: unknown[]) => UntypedTable;
  lte: (...args: unknown[]) => UntypedTable;
  gte: (...args: unknown[]) => UntypedTable;
  ilike: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  single: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

export function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "未知数据库错误";
}

export function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

export function isCurrentPublishedPage(page: MarketingPageRecord, now = Date.now()) {
  if (page.status !== "published") {
    return false;
  }

  const startAt = page.start_at ? new Date(page.start_at).getTime() : null;
  const endAt = page.end_at ? new Date(page.end_at).getTime() : null;

  if (startAt != null && !Number.isNaN(startAt) && startAt > now) {
    return false;
  }

  if (endAt != null && !Number.isNaN(endAt) && endAt < now) {
    return false;
  }

  return true;
}

export function compareMarketingPageListOrder(a: MarketingPageRecord, b: MarketingPageRecord) {
  const now = Date.now();
  const aActive = isCurrentPublishedPage(a, now);
  const bActive = isCurrentPublishedPage(b, now);

  if (aActive !== bActive) {
    return aActive ? -1 : 1;
  }

  if (aActive && bActive) {
    const sortDiff = (a.sort_order ?? 100) - (b.sort_order ?? 100);
    if (sortDiff !== 0) return sortDiff;

    return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
  }

  return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
}

export const PROJECT_OPTION_SELECT = `
  id,
  name,
  status,
  address,
  style_tags,
  property:properties!projects_property_id_fkey(
    community,
    building_info,
    area,
    layout
  ),
  customer:customers!projects_customer_id_fkey(
    name
  )
`;

export { Errors };

export type {
  ConvertMarketingLeadInput,
  MarketingLeadListQuery,
  MarketingPageConfigInput,
  MarketingPageListQuery,
  MarketingPageProjectOptionQuery,
  PublicMarketingPageListQuery,
  SubmitMarketingLeadInput,
  TrackMarketingEventInput,
  UpdateMarketingLeadInput,
  UpdateMarketingPageInput,
};
