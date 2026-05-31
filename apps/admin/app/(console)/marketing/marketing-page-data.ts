import { campaignStatusOptions } from "@/components/marketing/marketing-constants";
import type { H5MarketingLeadRecord, H5MarketingPageRecord, MarketingCampaignRecord, MarketingProjectOption, Pagination } from "@/components/marketing/marketing-types";
import type { MarketingTabValue } from "@/components/marketing/marketing-tabs-nav";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type MarketingPageSearchParams = {
  tab?: string;
  page?: string;
  campaign_type?: string;
  status?: string;
  keyword?: string;
  lead_page?: string;
  lead_status?: string;
  lead_keyword?: string;
  lead_page_id?: string;
  lead_created_from?: string;
  lead_created_to?: string;
};

export type MarketingTab = MarketingTabValue;

export type CampaignListData = {
  list: MarketingCampaignRecord[];
  pagination: Pagination;
};

export type ProjectListData = {
  list: Array<{
    id: string;
    name: string | null;
    title?: string | null;
    subtitle?: string | null;
    status?: string | null;
    address?: string | null;
  }>;
  pagination: Pagination;
};

export type H5PageListData = {
  list: H5MarketingPageRecord[];
  pagination: Pagination;
};

export type H5LeadListData = {
  list: H5MarketingLeadRecord[];
  pagination: Pagination;
};

export function isCurrentPublishedH5Page(page: H5MarketingPageRecord, now = Date.now()) {
  if (page.status !== "published") return false;
  const startAt = page.start_at ? new Date(page.start_at).getTime() : null;
  const endAt = page.end_at ? new Date(page.end_at).getTime() : null;

  if (startAt != null && !Number.isNaN(startAt) && startAt > now) return false;
  if (endAt != null && !Number.isNaN(endAt) && endAt < now) return false;

  return true;
}

export function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

export function normalizeTab(value: string | undefined): MarketingTab {
  if (value === "h5" || value === "leads") {
    return value;
  }

  return "campaigns";
}

export function dateStartToIso(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function dateEndToIso(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function buildTabHref(tab: MarketingTab, params: MarketingPageSearchParams) {
  const query = new URLSearchParams();
  query.set("tab", tab);

  if (tab === "campaigns") {
    if (params.page) query.set("page", params.page);
    if (params.campaign_type) query.set("campaign_type", params.campaign_type);
    if (params.status) query.set("status", params.status);
    if (params.keyword) query.set("keyword", params.keyword);
  } else if (tab === "leads") {
    if (params.lead_page) query.set("lead_page", params.lead_page);
    if (params.lead_status) query.set("lead_status", params.lead_status);
    if (params.lead_keyword) query.set("lead_keyword", params.lead_keyword);
    if (params.lead_page_id) query.set("lead_page_id", params.lead_page_id);
    if (params.lead_created_from) query.set("lead_created_from", params.lead_created_from);
    if (params.lead_created_to) query.set("lead_created_to", params.lead_created_to);
  }

  return `/marketing?${query.toString()}`;
}

export async function fetchBackendData<T>(token: string, path: string) {
  const response = await fetch(buildBackendUrl(path), {
    headers: {
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await parseBackendJson<T>(response);
  return payload.data as T;
}

export async function getCampaigns(token: string | null, params: MarketingPageSearchParams) {
  const page = normalizePage(params.page);
  if (!token) {
    return {
      list: [] as MarketingCampaignRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  const campaignType = params.campaign_type?.trim() || "";
  const status = params.status?.trim() || "";
  const keyword = params.keyword?.trim() || "";
  if (campaignType) query.set("campaign_type", campaignType);
  if (status) query.set("status", status);
  if (keyword) query.set("keyword", keyword);

  try {
    const data = await fetchBackendData<CampaignListData>(
      token,
      `/employee/marketing-center/campaigns?${query}`,
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page, pageSize: 20, total: 0, totalPages: 0 },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as MarketingCampaignRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "营销活动列表加载失败",
    };
  }
}

export async function getProjects(token: string | null) {
  if (!token) return [] as MarketingProjectOption[];

  try {
    const pageSize = 8;
    const data = await fetchBackendData<ProjectListData>(
      token,
      `/marketing-pages/project-options?page=1&pageSize=${pageSize}`,
    );
    return (data?.list || []).map((project) => ({
      id: project.id,
      name: project.name || project.title || project.id,
      status: project.status || null,
      address: project.address || project.subtitle || null,
    }));
  } catch {
    return [] as MarketingProjectOption[];
  }
}

export async function getH5Pages(token: string | null) {
  if (!token) {
    return {
      list: [] as H5MarketingPageRecord[],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const data = await fetchBackendData<H5PageListData>(
      token,
      "/marketing-pages?page=1&pageSize=100",
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as H5MarketingPageRecord[],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "H5 活动页列表加载失败",
    };
  }
}

export async function getH5Leads(token: string | null, params: MarketingPageSearchParams) {
  const page = normalizePage(params.lead_page);
  if (!token) {
    return {
      list: [] as H5MarketingLeadRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  const status = params.lead_status?.trim() || "";
  const keyword = params.lead_keyword?.trim() || "";
  const pageId = params.lead_page_id?.trim() || "";
  const createdFrom = params.lead_created_from?.trim() || "";
  const createdTo = params.lead_created_to?.trim() || "";
  if (status) query.set("status", status);
  if (keyword) query.set("keyword", keyword);
  if (pageId) query.set("page_id", pageId);
  if (createdFrom) query.set("created_from", dateStartToIso(createdFrom));
  if (createdTo) query.set("created_to", dateEndToIso(createdTo));

  try {
    const data = await fetchBackendData<H5LeadListData>(
      token,
      `/marketing-leads?${query.toString()}`,
    );
    return {
      list: data?.list || [],
      pagination: data?.pagination || { page, pageSize: 20, total: 0, totalPages: 0 },
      error: null,
    };
  } catch (error) {
    return {
      list: [] as H5MarketingLeadRecord[],
      pagination: { page, pageSize: 20, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "H5 营销线索加载失败",
    };
  }
}

export const statusLabel = Object.fromEntries(campaignStatusOptions);
