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
import { SupabaseDB } from "@/utils/supabase";

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

type UntypedTable = {
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

function getErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }

  return "未知数据库错误";
}

function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

function isCurrentPublishedPage(page: MarketingPageRecord, now = Date.now()) {
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

function compareMarketingPageListOrder(a: MarketingPageRecord, b: MarketingPageRecord) {
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

const PROJECT_OPTION_SELECT = `
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

class MarketingPageRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: string): UntypedTable {
    return (this.client as unknown as {
      from: (tableName: string) => UntypedTable;
    }).from(table);
  }

  private pages() {
    return this.from("marketing_pages");
  }

  private versions() {
    return this.from("marketing_page_versions");
  }

  private leads() {
    return this.from("marketing_leads");
  }

  private events() {
    return this.from("marketing_events");
  }

  private tenants() {
    return this.from("tenants");
  }

  private customers() {
    return this.from("customers");
  }

  private projects() {
    return this.from("projects");
  }

  private projectLogs() {
    return this.from("project_logs");
  }

  private applyProjectIdsFilter(
    request: UntypedTable,
    visibleProjectIds: string[] | null,
  ) {
    if (visibleProjectIds === null) {
      return request;
    }

    if (visibleProjectIds.length === 0) {
      return request.eq("id", "00000000-0000-0000-0000-000000000000");
    }

    return request.in("id", visibleProjectIds);
  }

  private applyTenantScope(
    request: UntypedTable,
    input: { tenantId?: string | null; platformScope?: boolean },
  ) {
    if (input.tenantId) {
      return request.eq("tenant_id", input.tenantId);
    }

    if (input.platformScope) {
      return request.is("tenant_id", null);
    }

    return request;
  }

  async listPages(
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

  async listPublishedPageEntries(query: PublicMarketingPageListQuery = {}, tenantId?: string | null) {
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

  async listActivePublishedPages(tenantId?: string | null, platformScope = false) {
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

  async listProjectOptions(
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

  async listLatestProjectLogCoverImages(projectIds: string[], tenantId?: string | null) {
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

  async findPageById(id: string, tenantId?: string | null, platformScope = false) {
    let request = this.pages()
      .select("*")
      .eq("id", id);

    request = this.applyTenantScope(request, { tenantId, platformScope });

    const { data, error } = await request.maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 活动页失败", error);
    }

    return (data || null) as MarketingPageRecord | null;
  }

  async findPageBySlug(slug: string) {
    const { data, error } = await this.pages()
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 活动页失败", error);
    }

    return (data || null) as MarketingPageRecord | null;
  }

  async findPageBySlugAndPlatform(slug: string) {
    const { data, error } = await this.pages()
      .select("*")
      .eq("slug", slug)
      .is("tenant_id", null)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 活动页失败", error);
    }

    return (data || null) as MarketingPageRecord | null;
  }

  async findTenantBySlug(slug: string) {
    const { data, error } = await this.tenants()
      .select("id,slug,name,status")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询租户失败", error);
    }

    return (data || null) as {
      id: string;
      slug: string;
      name: string;
      status: string;
    } | null;
  }

  async findPageBySlugAndTenantId(slug: string, tenantId: string) {
    const { data, error } = await this.pages()
      .select("*")
      .eq("slug", slug)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 活动页失败", error);
    }

    return (data || null) as MarketingPageRecord | null;
  }

  async createPage(input: {
    tenantId: string | null;
    title: string;
    slug: string;
    description?: string | null;
    cover_image?: string | null;
    display_scene?: MarketingPageRecord["display_scene"];
    sort_order?: number;
    start_at?: string | null;
    end_at?: string | null;
    employeeId: string | null;
  }) {
    const { data, error } = await this.pages()
      .insert({
        tenant_id: input.tenantId,
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        cover_image: input.cover_image ?? null,
        display_scene: input.display_scene ?? "all",
        sort_order: input.sort_order ?? 100,
        start_at: input.start_at ?? null,
        end_at: input.end_at ?? null,
        status: "draft",
        created_by: input.employeeId,
        updated_by: input.employeeId,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建 H5 活动页失败", error);
    }

    return data as MarketingPageRecord;
  }

  async updatePage(id: string, input: UpdateMarketingPageInput & {
    tenantId?: string | null;
    platformScope?: boolean;
    employeeId: string | null;
  }) {
    const { employeeId, tenantId, platformScope, ...updates } = input;
    let request = this.pages()
      .update({
        ...updates,
        updated_by: employeeId,
      })
      .eq("id", id)
      .neq("status", "archived");

    request = this.applyTenantScope(request, { tenantId, platformScope });

    const { data, error } = await request
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新 H5 活动页失败", error);
    }

    if (!data) {
      throw Errors.notFound("H5 活动页不存在");
    }

    return data as MarketingPageRecord;
  }

  async updatePageSortOrder(input: {
    id: string;
    sortOrder: number;
    tenantId?: string | null;
    platformScope?: boolean;
    employeeId: string | null;
  }) {
    let request = this.pages()
      .update({
        sort_order: input.sortOrder,
        updated_by: input.employeeId,
      })
      .eq("id", input.id)
      .neq("status", "archived");

    request = this.applyTenantScope(request, input);

    const { data, error } = await request
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新 H5 活动页排序失败", error);
    }

    if (!data) {
      throw Errors.notFound("H5 活动页不存在");
    }

    return data as MarketingPageRecord;
  }

  async archivePage(
    id: string,
    employeeId: string | null,
    tenantId?: string | null,
    platformScope = false,
  ) {
    let request = this.pages()
      .update({
        status: "archived",
        updated_by: employeeId,
      })
      .eq("id", id)
      .neq("status", "archived");

    request = this.applyTenantScope(request, { tenantId, platformScope });

    const { data, error } = await request
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("删除 H5 活动页失败", error);
    }

    if (!data) {
      throw Errors.notFound("H5 活动页不存在");
    }

    return data as MarketingPageRecord;
  }

  async setPageOffline(
    id: string,
    employeeId: string | null,
    tenantId?: string | null,
    platformScope = false,
  ) {
    let request = this.pages()
      .update({
        status: "offline",
        updated_by: employeeId,
      })
      .eq("id", id)
      .neq("status", "archived");

    request = this.applyTenantScope(request, { tenantId, platformScope });

    const { data, error } = await request
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("下线 H5 活动页失败", error);
    }

    if (!data) {
      throw Errors.notFound("H5 活动页不存在");
    }

    return data as MarketingPageRecord;
  }

  async getLatestVersionNo(pageId: string) {
    const { data, error } = await this.versions()
      .select("version_no")
      .eq("page_id", pageId)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 活动页版本失败", error);
    }

    return Number((data as { version_no?: number } | null)?.version_no || 0);
  }

  async findDraftVersion(pageId: string, tenantId?: string | null, platformScope = false) {
    let request = this.versions()
      .select("*")
      .eq("page_id", pageId)
      .eq("status", "draft");

    request = this.applyTenantScope(request, { tenantId, platformScope });

    const { data, error } = await request.maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 活动页草稿失败", error);
    }

    return (data || null) as MarketingPageVersionRecord | null;
  }

  async findVersionById(id: string, tenantId?: string | null, platformScope = false) {
    let request = this.versions()
      .select("*")
      .eq("id", id);

    request = this.applyTenantScope(request, { tenantId, platformScope });

    const { data, error } = await request.maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 活动页版本失败", error);
    }

    return (data || null) as MarketingPageVersionRecord | null;
  }

  async createVersion(input: {
    tenantId: string | null;
    pageId: string;
    versionNo: number;
    status: "draft" | "published" | "archived";
    config: MarketingPageConfigInput;
    employeeId: string | null;
    publishedAt?: string | null;
  }) {
    const { data, error } = await this.versions()
      .insert({
        tenant_id: input.tenantId,
        page_id: input.pageId,
        version_no: input.versionNo,
        status: input.status,
        schema_version: input.config.schemaVersion,
        config: input.config,
        created_by: input.employeeId,
        published_at: input.publishedAt ?? null,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建 H5 活动页版本失败", error);
    }

    return data as MarketingPageVersionRecord;
  }

  async updateDraftVersion(input: {
    versionId: string;
    tenantId?: string | null;
    platformScope?: boolean;
    config: MarketingPageConfigInput;
  }) {
    let request = this.versions()
      .update({
        config: input.config,
        schema_version: input.config.schemaVersion,
      })
      .eq("id", input.versionId)
      .eq("status", "draft");

    request = this.applyTenantScope(request, input);

    const { data, error } = await request
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("保存 H5 活动页草稿失败", error);
    }

    if (!data) {
      throw Errors.badRequest("草稿版本不存在或不可编辑");
    }

    return data as MarketingPageVersionRecord;
  }

  async archivePublishedVersions(
    pageId: string,
    tenantId?: string | null,
    platformScope = false,
  ) {
    let request = this.versions()
      .update({ status: "archived" })
      .eq("page_id", pageId)
      .eq("status", "published");

    request = this.applyTenantScope(request, { tenantId, platformScope });

    const { error } = await request;

    if (error) {
      throw Errors.dbError("归档 H5 活动页旧发布版本失败", error);
    }
  }

  async markPagePublished(input: {
    pageId: string;
    tenantId?: string | null;
    platformScope?: boolean;
    versionId: string;
    employeeId: string | null;
    publishedAt: string;
    sortOrder?: number | null;
  }) {
    let request = this.pages()
      .update({
        status: "published",
        published_version_id: input.versionId,
        published_by: input.employeeId,
        published_at: input.publishedAt,
        ...(input.sortOrder != null ? { sort_order: input.sortOrder } : {}),
        updated_by: input.employeeId,
      })
      .eq("id", input.pageId);

    request = this.applyTenantScope(request, input);

    const { data, error } = await request
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("发布 H5 活动页失败", error);
    }

    if (!data) {
      throw Errors.notFound("H5 活动页不存在");
    }

    return data as MarketingPageRecord;
  }

  async createLead(input: SubmitMarketingLeadInput & {
    tenantId: string | null;
    pageId: string;
    pageVersionId: string;
    requestIp: string | null;
    userAgent: string | null;
    customerId?: string | null;
    wxOpenid?: string | null;
  }) {
    const customerId = input.customerId ?? await this.findCustomerIdByPhone(
      input.phone,
      input.tenantId,
    );
    const { data, error } = await this.leads()
      .insert({
        tenant_id: input.tenantId,
        page_id: input.pageId,
        page_version_id: input.pageVersionId,
        name: input.name ?? null,
        phone: input.phone ?? null,
        community: input.community ?? null,
        city: input.city ?? null,
        form_data: input.form_data,
        source: "h5",
        customer_id: customerId,
        wx_openid: input.wxOpenid ?? null,
        request_ip: input.requestIp,
        user_agent: input.userAgent,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("提交 H5 营销线索失败", error);
    }

    return data as MarketingLeadRecord;
  }

  async findRecentLeadByPageAndPhone(input: {
    tenantId: string | null;
    pageId: string;
    phone: string;
    since: string;
  }) {
    let request = this.leads()
      .select("*")
      .eq("page_id", input.pageId)
      .eq("phone", input.phone)
      .neq("lead_status", "invalid")
      .gte("created_at", input.since);
    request = this.applyTenantScope(request, {
      tenantId: input.tenantId,
      platformScope: input.tenantId === null,
    });

    const { data, error } = await request
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 营销线索防重记录失败", error);
    }

    return (data || null) as MarketingLeadRecord | null;
  }

  async updateRecentLeadSubmission(id: string, input: SubmitMarketingLeadInput & {
    tenantId: string | null;
    pageVersionId: string;
    requestIp: string | null;
    userAgent: string | null;
    customerId?: string | null;
    wxOpenid?: string | null;
  }) {
    const updatePayload: Record<string, unknown> = {
      page_version_id: input.pageVersionId,
      name: input.name ?? null,
      phone: input.phone ?? null,
      community: input.community ?? null,
      city: input.city ?? null,
      form_data: input.form_data,
      request_ip: input.requestIp,
      user_agent: input.userAgent,
    };

    const customerId = input.customerId ?? await this.findCustomerIdByPhone(
      input.phone,
      input.tenantId,
    );
    if (customerId) {
      updatePayload.customer_id = customerId;
    }

    if (input.wxOpenid) {
      updatePayload.wx_openid = input.wxOpenid;
    }

    let request = this.leads()
      .update(updatePayload)
      .eq("id", id);

    request = this.applyTenantScope(request, {
      tenantId: input.tenantId,
      platformScope: input.tenantId === null,
    });

    const { data, error } = await request
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新 H5 营销线索重复提交信息失败", error);
    }

    if (!data) {
      throw Errors.notFound("H5 营销线索不存在");
    }

    return data as MarketingLeadRecord;
  }

  async findCustomerByAuthUserId(authUserId: string, tenantId?: string | null) {
    let request = this.customers()
      .select("id,name,phone,status,owner_id")
      .eq("user_id", authUserId);

    request = this.applyTenantScope(request, {
      tenantId,
      platformScope: tenantId === null,
    });

    const { data, error } = await request.maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 营销页客户身份失败", error);
    }

    return (data || null) as {
      id: string;
      name: string | null;
      phone: string | null;
      status: string | null;
      owner_id: string | null;
    } | null;
  }

  async listLeads(query: MarketingLeadListQuery, tenantId?: string | null) {
    const { page, pageSize, status, page_id, keyword, created_from, created_to } = query;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = this.leads()
      .select(`
        *,
        page:marketing_pages(id,title,slug),
        customer:customers(id,name,phone,status,owner_id)
      `, { count: "exact" });

    if (tenantId) {
      request = request.eq("tenant_id", tenantId);
    }

    if (status) {
      request = request.eq("lead_status", status);
    } else {
      request = request.neq("lead_status", "invalid");
    }

    if (page_id) {
      request = request.eq("page_id", page_id);
    }

    if (created_from) {
      request = request.gte("created_at", created_from);
    }

    if (created_to) {
      request = request.lte("created_at", created_to);
    }

    if (keyword) {
      const escapedKeyword = escapeSupabaseOrValue(keyword);
      request = request.or(
        `name.ilike.%${escapedKeyword}%,phone.ilike.%${escapedKeyword}%,community.ilike.%${escapedKeyword}%,city.ilike.%${escapedKeyword}%`,
      );
    }

    const { data, error, count } = await request
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询 H5 营销线索列表失败", error);
    }

    return {
      list: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async updateLead(id: string, input: UpdateMarketingLeadInput & {
    tenantId?: string | null;
    employeeId: string | null;
  }) {
    let request = this.leads()
      .update({
        lead_status: input.lead_status,
        follow_remark: input.follow_remark ?? null,
        followed_by: input.employeeId,
        followed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (input.tenantId) {
      request = request.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await request
      .select(`
        *,
        page:marketing_pages(id,title,slug),
        customer:customers(id,name,phone,status,owner_id)
      `)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新 H5 营销线索失败", error);
    }

    if (!data) {
      throw Errors.notFound("H5 营销线索不存在");
    }

    return data as MarketingLeadRecord;
  }

  async convertLeadToCustomer(id: string, input: ConvertMarketingLeadInput & {
    tenantId?: string | null;
    employeeId: string | null;
  }) {
    const lead = await this.findLeadById(id, input.tenantId);
    if (!lead) {
      throw Errors.notFound("H5 营销线索不存在");
    }

    const phone = lead.phone?.trim();
    if (!phone) {
      throw Errors.badRequest("线索未填写手机号，不能转为客户");
    }

    const existingCustomer = await this.findCustomerByPhone(phone, lead.tenant_id);
    const customer = existingCustomer ?? await this.createCustomerFromLead(
      lead,
      input.employeeId,
    );
    const followRemark = input.follow_remark ?? lead.follow_remark;
    let request = this.leads()
      .update({
        customer_id: customer.id,
        lead_status: "converted",
        follow_remark: followRemark ?? null,
        followed_by: input.employeeId,
        followed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (input.tenantId) {
      request = request.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await request
      .select(`
        *,
        page:marketing_pages(id,title,slug),
        customer:customers(id,name,phone,status,owner_id)
      `)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("转化 H5 营销线索失败", error);
    }

    if (!data) {
      throw Errors.notFound("H5 营销线索不存在");
    }

    return {
      lead: data,
      customer,
      created: !existingCustomer,
    };
  }

  async createEvent(input: TrackMarketingEventInput & {
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

  ensureUniqueViolation(error: unknown, message: string) {
    if (getErrorMessage(error).includes("duplicate key")) {
      throw Errors.badRequest(message);
    }
  }

  private async findCustomerIdByPhone(phone: string | null | undefined, tenantId?: string | null) {
    if (!phone) return null;

    const customer = await this.findCustomerByPhone(phone, tenantId);
    return customer?.id ?? null;
  }

  private async findLeadById(id: string, tenantId?: string | null) {
    let request = this.leads()
      .select("*")
      .eq("id", id);

    if (tenantId) {
      request = request.eq("tenant_id", tenantId);
    }

    const { data, error } = await request.maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 营销线索失败", error);
    }

    return (data || null) as MarketingLeadRecord | null;
  }

  private async findCustomerByPhone(phone: string, tenantId?: string | null) {
    let request = this.customers()
      .select("id,name,phone,status,owner_id")
      .eq("phone", phone);

    request = this.applyTenantScope(request, {
      tenantId,
      platformScope: tenantId === null,
    });

    const { data, error } = await request.maybeSingle();

    if (error) {
      throw Errors.dbError("匹配 H5 营销线索客户失败", error);
    }

    return (data || null) as {
      id: string;
      name: string | null;
      phone: string | null;
      status: string | null;
      owner_id: string | null;
    } | null;
  }

  private async createCustomerFromLead(
    lead: MarketingLeadRecord,
    employeeId: string | null,
  ) {
    const phone = lead.phone?.trim();
    if (!phone) {
      throw Errors.badRequest("线索未填写手机号，不能转为客户");
    }

    const { data, error } = await this.customers()
      .insert({
        tenant_id: lead.tenant_id,
        name: lead.name?.trim() || "H5营销线索",
        phone,
        source: "platform",
        status: "potential",
        owner_id: employeeId,
      })
      .select("id,name,phone,status,owner_id")
      .single();

    if (error) {
      if (getErrorMessage(error).includes("duplicate key")) {
        const customer = await this.findCustomerByPhone(phone, lead.tenant_id);
        if (customer) return customer;
      }

      throw Errors.dbError("创建 H5 营销线索客户失败", error);
    }

    return data as {
      id: string;
      name: string | null;
      phone: string | null;
      status: string | null;
      owner_id: string | null;
    };
  }
}

export const marketingPageRepository = new MarketingPageRepository();
