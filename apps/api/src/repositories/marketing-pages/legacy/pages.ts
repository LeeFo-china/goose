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

export async function findPageById(this: any, id: string, tenantId?: string | null, platformScope = false) {
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

export async function findPageBySlug(this: any, slug: string) {
  const { data, error } = await this.pages()
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询 H5 活动页失败", error);
  }

  return (data || null) as MarketingPageRecord | null;
}

export async function findPageBySlugAndPlatform(this: any, slug: string) {
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

export async function findTenantBySlug(this: any, slug: string) {
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

export async function findPageBySlugAndTenantId(this: any, slug: string, tenantId: string) {
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

export async function createPage(this: any, input: {
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

export async function updatePage(this: any, id: string, input: UpdateMarketingPageInput & {
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

export async function updatePageSortOrder(this: any, input: {
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

export async function archivePage(this: any, 
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

export async function setPageOffline(this: any, 
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
