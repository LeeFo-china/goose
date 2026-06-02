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

export async function getLatestVersionNo(this: any, pageId: string) {
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

export async function findDraftVersion(this: any, pageId: string, tenantId?: string | null, platformScope = false) {
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

export async function findVersionById(this: any, id: string, tenantId?: string | null, platformScope = false) {
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

export async function createVersion(this: any, input: {
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

export async function updateDraftVersion(this: any, input: {
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

export async function archivePublishedVersions(this: any, 
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

export async function markPagePublished(this: any, input: {
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
