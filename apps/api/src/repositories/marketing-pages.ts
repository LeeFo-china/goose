import { Errors } from "@/errors/error-factory";
import type {
  MarketingPageConfigInput,
  MarketingPageListQuery,
  SubmitMarketingLeadInput,
  TrackMarketingEventInput,
  UpdateMarketingPageInput,
} from "@/schema/marketing-pages";
import { SupabaseDB } from "@/utils/supabase";

export type MarketingPageRecord = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published" | "offline" | "archived";
  description: string | null;
  cover_image: string | null;
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
  page_id: string | null;
  page_version_id: string | null;
  name: string | null;
  phone: string | null;
  community: string | null;
  city: string | null;
  form_data: Record<string, unknown>;
  source: string;
  wx_openid: string | null;
  customer_id: string | null;
  request_ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export type MarketingEventRecord = {
  id: string;
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

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  delete: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  neq: (...args: unknown[]) => UntypedTable;
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

  async listPages(query: MarketingPageListQuery) {
    const { page, pageSize, status, keyword } = query;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = this.pages()
      .select("*", { count: "exact" })
      .neq("status", "archived");

    if (status) {
      request = request.eq("status", status);
    }

    if (keyword) {
      const escapedKeyword = escapeSupabaseOrValue(keyword);
      request = request.or(
        `title.ilike.%${escapedKeyword}%,slug.ilike.%${escapedKeyword}%`,
      );
    }

    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询 H5 活动页列表失败", error);
    }

    return {
      list: (data || []) as MarketingPageRecord[],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async listPublishedPageEntries() {
    const { data, error } = await this.pages()
      .select("id,title,slug,description,cover_image,published_at,updated_at")
      .eq("status", "published")
      .order("published_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询公开 H5 活动页列表失败", error);
    }

    return (data || []) as Pick<
      MarketingPageRecord,
      | "id"
      | "title"
      | "slug"
      | "description"
      | "cover_image"
      | "published_at"
      | "updated_at"
    >[];
  }

  async findPageById(id: string) {
    const { data, error } = await this.pages()
      .select("*")
      .eq("id", id)
      .maybeSingle();

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

  async createPage(input: {
    title: string;
    slug: string;
    description?: string | null;
    cover_image?: string | null;
    employeeId: string | null;
  }) {
    const { data, error } = await this.pages()
      .insert({
        title: input.title,
        slug: input.slug,
        description: input.description ?? null,
        cover_image: input.cover_image ?? null,
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
    employeeId: string | null;
  }) {
    const { employeeId, ...updates } = input;
    const { data, error } = await this.pages()
      .update({
        ...updates,
        updated_by: employeeId,
      })
      .eq("id", id)
      .neq("status", "archived")
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

  async archivePage(id: string, employeeId: string | null) {
    const { data, error } = await this.pages()
      .update({
        status: "archived",
        updated_by: employeeId,
      })
      .eq("id", id)
      .neq("status", "archived")
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

  async setPageOffline(id: string, employeeId: string | null) {
    const { data, error } = await this.pages()
      .update({
        status: "offline",
        updated_by: employeeId,
      })
      .eq("id", id)
      .neq("status", "archived")
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

  async findDraftVersion(pageId: string) {
    const { data, error } = await this.versions()
      .select("*")
      .eq("page_id", pageId)
      .eq("status", "draft")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 活动页草稿失败", error);
    }

    return (data || null) as MarketingPageVersionRecord | null;
  }

  async findVersionById(id: string) {
    const { data, error } = await this.versions()
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询 H5 活动页版本失败", error);
    }

    return (data || null) as MarketingPageVersionRecord | null;
  }

  async createVersion(input: {
    pageId: string;
    versionNo: number;
    status: "draft" | "published" | "archived";
    config: MarketingPageConfigInput;
    employeeId: string | null;
    publishedAt?: string | null;
  }) {
    const { data, error } = await this.versions()
      .insert({
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
    config: MarketingPageConfigInput;
  }) {
    const { data, error } = await this.versions()
      .update({
        config: input.config,
        schema_version: input.config.schemaVersion,
      })
      .eq("id", input.versionId)
      .eq("status", "draft")
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

  async archivePublishedVersions(pageId: string) {
    const { error } = await this.versions()
      .update({ status: "archived" })
      .eq("page_id", pageId)
      .eq("status", "published");

    if (error) {
      throw Errors.dbError("归档 H5 活动页旧发布版本失败", error);
    }
  }

  async markPagePublished(input: {
    pageId: string;
    versionId: string;
    employeeId: string | null;
    publishedAt: string;
  }) {
    const { data, error } = await this.pages()
      .update({
        status: "published",
        published_version_id: input.versionId,
        published_by: input.employeeId,
        published_at: input.publishedAt,
        updated_by: input.employeeId,
      })
      .eq("id", input.pageId)
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
    pageId: string;
    pageVersionId: string;
    requestIp: string | null;
    userAgent: string | null;
    customerId?: string | null;
    wxOpenid?: string | null;
  }) {
    const { data, error } = await this.leads()
      .insert({
        page_id: input.pageId,
        page_version_id: input.pageVersionId,
        name: input.name ?? null,
        phone: input.phone ?? null,
        community: input.community ?? null,
        city: input.city ?? null,
        form_data: input.form_data,
        source: "h5",
        customer_id: input.customerId ?? null,
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

  async createEvent(input: TrackMarketingEventInput & {
    pageId: string;
    pageVersionId: string;
    requestIp: string | null;
    userAgent: string | null;
    customerId?: string | null;
    wxOpenid?: string | null;
  }) {
    const { data, error } = await this.events()
      .insert({
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
}

export const marketingPageRepository = new MarketingPageRepository();
