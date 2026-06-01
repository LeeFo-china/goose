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

export async function listPages(this: any, 
  query: MarketingPageListQuery,
  tenantId?: string | null,
  platformScope = false,
) {
  const { page, pageSize, status, keyword } = query;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = this.pages()
    .select("*", { count: "exact" })
    .neq("status", "archived");

  request = this.applyTenantScope(request, { tenantId, platformScope });

  if (status) {
    request = request.eq("status", status);
  }

  if (keyword) {
    const escapedKeyword = escapeSupabaseOrValue(keyword);
    request = request.or(
      `title.ilike.%${escapedKeyword}%,slug.ilike.%${escapedKeyword}%`,
    );
  }

  const { data, error, count } = await request;

  if (error) {
    throw Errors.dbError("查询 H5 活动页列表失败", error);
  }

  const sortedList = ((data || []) as MarketingPageRecord[])
    .sort(compareMarketingPageListOrder);

  return {
    list: sortedList.slice(from, to + 1),
    pagination: {
      page,
      pageSize,
      total: count || 0,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    },
  };
}

export async function listPublishedPageEntries(this: any, query: PublicMarketingPageListQuery = {}, tenantId?: string | null) {
  const now = new Date().toISOString();
  let request = this.pages()
    .select("id,tenant_id,title,slug,description,cover_image,display_scene,sort_order,start_at,end_at,published_at,updated_at")
    .eq("status", "published")
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`);

  if (tenantId) {
    request = request.eq("tenant_id", tenantId);
  } else {
    request = request.is("tenant_id", null);
  }

  if (query.scene) {
    request = request.or(`display_scene.eq.all,display_scene.eq.${query.scene}`);
  }

  const { data, error } = await request
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false });

  if (error) {
    throw Errors.dbError("查询公开 H5 活动页列表失败", error);
  }

  return (data || []) as Pick<
    MarketingPageRecord,
    | "id"
    | "tenant_id"
    | "title"
    | "slug"
    | "description"
    | "cover_image"
    | "display_scene"
    | "sort_order"
    | "start_at"
    | "end_at"
    | "published_at"
    | "updated_at"
  >[];
}

export async function listActivePublishedPages(this: any, tenantId?: string | null, platformScope = false) {
  const now = new Date().toISOString();
  let request = this.pages()
    .select("*")
    .eq("status", "published")
    .or(`start_at.is.null,start_at.lte.${now}`)
    .or(`end_at.is.null,end_at.gte.${now}`);

  request = this.applyTenantScope(request, { tenantId, platformScope });

  const { data, error } = await request
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false });

  if (error) {
    throw Errors.dbError("查询有效 H5 活动页排序失败", error);
  }

  return (data || []) as MarketingPageRecord[];
}

export async function listProjectOptions(this: any, 
  query: MarketingPageProjectOptionQuery,
  visibleProjectIds: string[] | null,
  tenantId?: string | null,
) {
  const { page, pageSize, keyword } = query;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const normalizedKeyword = keyword?.trim();

  let countRequest = this.projects()
    .select("id", { count: "exact", head: true });
  countRequest = this.applyProjectIdsFilter(countRequest, visibleProjectIds);
  if (tenantId) {
    countRequest = countRequest.eq("tenant_id", tenantId);
  }
  if (normalizedKeyword) {
    const escapedKeyword = escapeSupabaseOrValue(normalizedKeyword);
    countRequest = countRequest.or(
      `name.ilike.%${escapedKeyword}%,address.ilike.%${escapedKeyword}%`,
    );
  }

  const { error: countError, count } = await countRequest;
  if (countError) {
    throw Errors.dbError("项目案例选项计数失败", countError);
  }

  const total = count ?? 0;
  const pagination = {
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
  };

  if (from >= total) {
    return {
      list: [] as MarketingPageProjectOptionRow[],
      pagination,
    };
  }

  let request = this.projects()
    .select(PROJECT_OPTION_SELECT)
    .order("created_at", { ascending: false });
  request = this.applyProjectIdsFilter(request, visibleProjectIds);
  if (tenantId) {
    request = request.eq("tenant_id", tenantId);
  }
  if (normalizedKeyword) {
    const escapedKeyword = escapeSupabaseOrValue(normalizedKeyword);
    request = request.or(
      `name.ilike.%${escapedKeyword}%,address.ilike.%${escapedKeyword}%`,
    );
  }

  const { data, error } = await request.range(from, to);
  if (error) {
    throw Errors.dbError("项目案例选项查询失败", error);
  }

  return {
    list: (data || []) as MarketingPageProjectOptionRow[],
    pagination,
  };
}

export async function listLatestProjectLogCoverImages(this: any, projectIds: string[], tenantId?: string | null) {
  if (projectIds.length === 0) {
    return [] as MarketingPageProjectOptionRow[];
  }

  let request = this.projectLogs()
    .select("project_id, images, created_at")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });

  if (tenantId) {
    request = request.eq("tenant_id", tenantId);
  }

  const { data, error } = await request;

  if (error) {
    throw Errors.dbError("查询项目案例封面失败", error);
  }

  return (data || []) as MarketingPageProjectOptionRow[];
}
