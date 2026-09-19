import { Errors } from "@/errors/error-factory";
import type {
  PlatformAdminReviewListQuery,
  PlatformAdminReviewLogListQuery,
} from "@/schema/platform-admin-review-workbench";
import { SupabaseDB } from "@/utils/supabase";

type Page<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  contains: (...args: unknown[]) => UntypedTable;
  gte: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{ data: unknown; error: unknown; count: number | null }>["then"];
};

type UntypedClient = { from: (table: string) => UntypedTable };
type LatestTenantRow = { id: string; company_name: string; status: string; created_at: string };
type LatestPartnerRow = { id: string; applicant_name: string; status: string; created_at: string };
type ReviewLogRow = {
  id: string;
  application_id: string;
  decision?: string;
  action?: string;
  before_status?: string;
  after_status?: string;
  from_status?: string;
  to_status?: string;
  remark: string | null;
  actor_employee_id: string | null;
  created_at: string;
};
type EmployeeRow = { id: string; name: string | null };

export type PlatformAdminTenantApplicationRow = {
  id: string;
  application_no: string;
  company_name: string;
  unified_social_credit_code?: string | null;
  business_license_file_id?: string | null;
  business_license_file?: { id: string; original_name: string | null; mime_type: string | null } | null;
  admin_name: string;
  admin_phone: string;
  address_province?: string | null;
  address_city: string;
  address_district: string | null;
  address_region_code?: string;
  address?: string;
  address_latitude?: number | null;
  address_longitude?: number | null;
  service_region_codes?: string[];
  source_channel: string;
  share_link_id?: string | null;
  share_link?: { sharer_display_name: string | null } | null;
  candidate_partner?: unknown;
  final_partner?: unknown;
  status: string;
  partner_assist_status: string;
  version: number;
  created_at: string;
  updated_at: string;
  reviewed_at?: string | null;
  reviewer?: { id: string; name: string | null } | null;
  review_remark?: string | null;
  converted_tenant_id?: string | null;
};

const TENANT_LIST_SELECT = [
  "id", "application_no", "company_name", "admin_name", "admin_phone",
  "status", "partner_assist_status", "source_channel", "address_city",
  "address_district", "version", "created_at", "updated_at",
].join(",");

const TENANT_DETAIL_SELECT = [
  TENANT_LIST_SELECT,
  "unified_social_credit_code", "business_license_file_id", "address_province",
  "address_region_code", "address", "address_latitude", "address_longitude",
  "service_region_codes", "share_link_id", "candidate_partner_id",
  "final_partner_id", "reviewed_at", "review_remark", "converted_tenant_id",
  "business_license_file:platform_file_objects!tenant_onboarding_applications_business_license_file_id_fkey(id,original_name,mime_type)",
  "share_link:tenant_onboarding_share_links!tenant_onboarding_applications_share_link_id_fkey(sharer_display_name)",
  "reviewer:employees!tenant_onboarding_applications_reviewed_by_employee_id_fkey(id,name)",
  "candidate_partner:platform_partners!tenant_onboarding_applications_candidate_partner_id_fkey(id,name,status,region_codes)",
  "final_partner:platform_partners!tenant_onboarding_applications_final_partner_id_fkey(id,name,status,region_codes)",
].join(",");

export class PlatformAdminReviewWorkbenchRepository {
  private client() {
    return SupabaseDB.getAdminClient() as unknown as UntypedClient;
  }

  async getSummary(now = new Date()) {
    const shanghaiOffset = 8 * 60 * 60 * 1_000;
    const shanghaiToday = new Date(now.getTime() + shanghaiOffset);
    shanghaiToday.setUTCHours(0, 0, 0, 0);
    const today = new Date(shanghaiToday.getTime() - shanghaiOffset);
    const count = (table: string, status: string, approvedToday = false) => {
      let query = this.client().from(table).select("id", { count: "exact", head: true })
        .eq("status", status);
      if (approvedToday) query = query.gte("reviewed_at", today.toISOString());
      return query;
    };
    const latest = (table: string, select: string) => this.client().from(table)
      .select(select)
      .in("status", ["submitted", "reviewing"])
      .order("created_at", { ascending: false })
      .limit(5);
    const results = await Promise.all([
      count("tenant_onboarding_applications", "submitted"),
      count("tenant_onboarding_applications", "supplement_required"),
      count("tenant_onboarding_applications", "reviewing"),
      count("tenant_onboarding_applications", "approved", true),
      count("platform_partner_applications", "submitted"),
      count("platform_partner_applications", "supplement_required"),
      count("platform_partner_applications", "reviewing"),
      count("platform_partner_applications", "approved", true),
      latest("tenant_onboarding_applications", "id,company_name,status,created_at"),
      latest("platform_partner_applications", "id,applicant_name,status,created_at"),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw Errors.dbError("查询平台审核待办统计失败", failed.error);
    const recent = [
      ...toRows<LatestTenantRow>(results[8].data).map((item) => ({
        id: item.id, type: "tenant_onboarding" as const,
        title: item.company_name, status: item.status, created_at: item.created_at,
      })),
      ...toRows<LatestPartnerRow>(results[9].data).map((item) => ({
        id: item.id, type: "partner_application" as const,
        title: item.applicant_name, status: item.status, created_at: item.created_at,
      })),
    ].sort((left, right) => right.created_at.localeCompare(left.created_at)).slice(0, 5);
    return {
      tenant_onboarding: {
        pending: results[0].count ?? 0,
        supplement_required: results[1].count ?? 0,
        reviewing: results[2].count ?? 0,
        approved_today: results[3].count ?? 0,
      },
      partner_applications: {
        pending: results[4].count ?? 0,
        supplement_required: results[5].count ?? 0,
        reviewing: results[6].count ?? 0,
        approved_today: results[7].count ?? 0,
      },
      latest: recent,
    };
  }

  async listTenantApplications(
    query: PlatformAdminReviewListQuery,
  ): Promise<Page<PlatformAdminTenantApplicationRow>> {
    const from = (query.page - 1) * query.pageSize;
    let request = this.client().from("tenant_onboarding_applications")
      .select(TENANT_LIST_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + query.pageSize - 1);
    if (query.status) request = request.eq("status", query.status);
    if (query.region_code) request = request.contains("service_region_codes", [query.region_code]);
    if (query.source_channel) request = request.eq("source_channel", query.source_channel);
    if (query.keyword) {
      const keyword = query.keyword.replace(/[%_,().]/g, " ").trim();
      if (keyword) request = request.or(
        `application_no.ilike.%${keyword}%,company_name.ilike.%${keyword}%,admin_phone.ilike.%${keyword}%`,
      );
    }
    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询移动端装企入驻申请失败", error);
    return this.page(
      toRows<PlatformAdminTenantApplicationRow>(data),
      count,
      query.page,
      query.pageSize,
    );
  }

  async findTenantApplicationById(applicationId: string) {
    const { data, error } = await this.client().from("tenant_onboarding_applications")
      .select(TENANT_DETAIL_SELECT)
      .eq("id", applicationId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询移动端装企入驻详情失败", error);
    return (data as PlatformAdminTenantApplicationRow | null) ?? null;
  }

  async listReviewLogs(query: PlatformAdminReviewLogListQuery) {
    const tenantTarget = query.target_type === "tenant_onboarding_application";
    const table = tenantTarget
      ? "tenant_onboarding_application_reviews"
      : "platform_partner_application_reviews";
    const select = tenantTarget
      ? "id,application_id,decision,before_status,after_status,remark,actor_employee_id,created_at"
      : "id,application_id,action,from_status,to_status,remark,actor_employee_id,created_at";
    const from = (query.page - 1) * query.pageSize;
    const { data, error, count } = await this.client().from(table)
      .select(select, { count: "exact" })
      .eq("application_id", query.target_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + query.pageSize - 1);
    if (error) throw Errors.dbError("查询平台审核日志失败", error);
    const rows = toRows<ReviewLogRow>(data);
    const actorIds = Array.from(new Set(rows.map((row) => row.actor_employee_id).filter(Boolean)));
    let employees = new Map<string, { id: string; name: string | null }>();
    if (actorIds.length > 0) {
      const result = await this.client().from("employees").select("id,name").in("id", actorIds);
      if (result.error) throw Errors.dbError("查询平台审核操作人失败", result.error);
      employees = new Map(
        toRows<EmployeeRow>(result.data).map((employee) => [employee.id, employee]),
      );
    }
    return this.page(rows.map((row) => ({
      id: row.id,
      target_type: query.target_type,
      target_id: row.application_id,
      action: tenantTarget
        ? normalizeTenantReviewAction(row.decision ?? "")
        : row.action ?? "",
      from_status: tenantTarget ? row.before_status : row.from_status,
      to_status: tenantTarget ? row.after_status : row.to_status,
      remark: row.remark,
      operator: row.actor_employee_id
        ? employees.get(row.actor_employee_id) ?? { id: row.actor_employee_id, name: null }
        : null,
      created_at: row.created_at,
    })), count, query.page, query.pageSize);
  }

  private page<T>(data: T[] | null, count: number | null, page: number, pageSize: number): Page<T> {
    return {
      list: data ?? [],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }
}

function normalizeTenantReviewAction(decision: string) {
  if (decision === "approved") return "approve";
  if (decision === "rejected") return "reject";
  return decision;
}

function toRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? data as T[] : [];
}

export const platformAdminReviewWorkbenchRepository =
  new PlatformAdminReviewWorkbenchRepository();
