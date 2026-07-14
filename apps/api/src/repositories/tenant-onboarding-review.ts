import { Errors } from "@/errors/error-factory";
import {
  parseNullableLicenseAccess,
  parseNullablePlatformApplication,
  parsePlatformApplicationList,
  parsePlatformApplicationReviews,
  parsePlatformReviewMutation,
} from "@/repositories/tenant-onboarding-review-parsers";
import type {
  TenantOnboardingPageResult,
  TenantOnboardingPlatformApplicationListRecord,
  TenantOnboardingPlatformReviewMutationResult,
} from "@/repositories/tenant-onboarding-types";
import type { TenantOnboardingApplicationListQuery } from "@/schema/tenant-onboarding";
import { SupabaseDB } from "@/utils/supabase";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const LIST_SELECT = [
  "id", "application_no", "company_name", "admin_name", "address_city",
  "address_district", "address_region_code", "service_region_codes",
  "source_channel", "candidate_partner_id", "candidate_match_reason", "status",
  "partner_assist_status", "partner_assist_due_at", "version", "created_at",
  "updated_at",
  "candidate_partner:platform_partners!tenant_onboarding_applications_candidate_partner_id_fkey(id,name,status,region_codes)",
  "final_partner:platform_partners!tenant_onboarding_applications_final_partner_id_fkey(id,name,status,region_codes)",
].join(",");
const DETAIL_SELECT = [
  LIST_SELECT, "unified_social_credit_code", "business_license_file_id",
  "admin_phone", "address_province", "address", "address_latitude",
  "address_longitude", "invite_code_id", "candidate_snapshot",
  "final_partner_id", "attribution_source_type", "partner_assist_requested_at",
  "converted_tenant_id", "reviewed_by_employee_id", "reviewed_at",
  "review_remark", "privacy_policy_version", "onboarding_terms_version",
  "consented_at", "withdrawn_at",
].join(",");
const REVIEW_SELECT = [
  "id", "application_id", "review_stage", "decision", "actor_type",
  "actor_visitor_id", "actor_employee_id", "actor_partner_member_id",
  "before_status", "after_status", "before_partner_assist_status",
  "after_partner_assist_status", "required_fields", "remark", "metadata",
  "created_at",
].join(",");
const LICENSE_RELATION =
  "file:platform_file_objects!tenant_onboarding_applications_business_license_file_id_fkey(id,owner_type,owner_visitor_id,scene,provider,object_key,visibility,public_url,status,deleted_at)";

type TableName =
  | "tenant_onboarding_applications"
  | "tenant_onboarding_application_reviews"
  | "tenants";

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  contains: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type UntypedClient = {
  from: (table: TableName) => UntypedTable;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

function client(): UntypedClient {
  return SupabaseDB.getAdminClient() as unknown as UntypedClient;
}

function from(table: TableName): UntypedTable {
  return client().from(table);
}

function pagination(pageValue: number, pageSizeValue: number) {
  const page = Number.isInteger(pageValue) && pageValue > 0
    ? pageValue
    : DEFAULT_PAGE;
  const pageSize = Number.isInteger(pageSizeValue) && pageSizeValue > 0
    ? Math.min(pageSizeValue, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const start = (page - 1) * pageSize;
  return { page, pageSize, start, end: start + pageSize - 1 };
}

function pageResult<RecordType>(input: {
  list: RecordType[];
  count: number | null;
  page: number;
  pageSize: number;
}): TenantOnboardingPageResult<RecordType> {
  return {
    list: input.list,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: input.count ?? 0,
      totalPages: input.count ? Math.ceil(input.count / input.pageSize) : 0,
    },
  };
}

function sanitizeKeyword(value: string | undefined) {
  return value?.replace(/[%_,().]/g, " ").trim().slice(0, 120) || null;
}

export class TenantOnboardingReviewRepository {
  async listApplications(
    query: TenantOnboardingApplicationListQuery,
  ): Promise<TenantOnboardingPageResult<TenantOnboardingPlatformApplicationListRecord>> {
    const normalized = pagination(query.page, query.pageSize);
    let request = from("tenant_onboarding_applications")
      .select(LIST_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(normalized.start, normalized.end);
    if (query.status) request = request.eq("status", query.status);
    if (query.region_code) {
      request = request.contains("service_region_codes", [query.region_code]);
    }
    if (query.candidate_partner_id) {
      request = request.eq("candidate_partner_id", query.candidate_partner_id);
    }
    if (query.assist_status) {
      request = request.eq("partner_assist_status", query.assist_status);
    }
    const keyword = sanitizeKeyword(query.keyword);
    if (keyword) {
      request = request.or(
        `application_no.ilike.%${keyword}%,company_name.ilike.%${keyword}%,admin_phone.ilike.%${keyword}%,unified_social_credit_code.ilike.%${keyword}%`,
      );
    }

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台装企入驻申请失败", error);
    return pageResult({
      list: parsePlatformApplicationList(data ?? []),
      count,
      page: normalized.page,
      pageSize: normalized.pageSize,
    });
  }

  async findApplicationById(applicationId: string) {
    const { data, error } = await from("tenant_onboarding_applications")
      .select(DETAIL_SELECT)
      .eq("id", applicationId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询平台装企入驻申请详情失败", error);
    return parseNullablePlatformApplication(data);
  }

  async listReviews(input: {
    applicationId: string;
    page: number;
    pageSize: number;
  }) {
    const normalized = pagination(input.page, input.pageSize);
    const { data, error, count } = await from(
      "tenant_onboarding_application_reviews",
    )
      .select(REVIEW_SELECT, { count: "exact" })
      .eq("application_id", input.applicationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(normalized.start, normalized.end);
    if (error) throw Errors.dbError("查询装企入驻审核记录失败", error);
    return pageResult({
      list: parsePlatformApplicationReviews(data ?? []),
      count,
      page: normalized.page,
      pageSize: normalized.pageSize,
    });
  }

  startReviewAtomic(input: ReviewMutationBase) {
    return this.mutate("start_review", input);
  }

  requestSupplementAtomic(
    input: ReviewMutationBase & { requiredFields: string[]; remark: string },
  ) {
    return this.mutate("request_supplement", input);
  }

  requestPartnerAssistAtomic(input: ReviewMutationBase & {
    partnerId: string;
    candidateSnapshot: Record<string, unknown>;
    remark: string | null;
  }) {
    return this.mutate("request_partner_assist", input);
  }

  rejectAtomic(input: ReviewMutationBase & { remark: string }) {
    return this.mutate("reject", input);
  }

  async findTenantBySlug(slug: string) {
    const { data, error } = await from("tenants")
      .select("id")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("检查租户标识失败", error);
    if (data === null) return null;
    if (typeof data !== "object" || typeof (data as { id?: unknown }).id !== "string") {
      throw Errors.dbError("检查租户标识失败", { message: "invalid tenant row" });
    }
    return { id: (data as { id: string }).id };
  }

  async findLicenseAccessRecord(applicationId: string) {
    const { data, error } = await from("tenant_onboarding_applications")
      .select(`application_id:id,visitor_id,business_license_file_id,${LICENSE_RELATION}`)
      .eq("id", applicationId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻营业执照失败", error);
    return parseNullableLicenseAccess(data);
  }

  private async mutate(
    action: "start_review" | "request_supplement" | "request_partner_assist" | "reject",
    input: ReviewMutationBase & {
      requiredFields?: string[];
      remark?: string | null;
      partnerId?: string | null;
      candidateSnapshot?: Record<string, unknown>;
    },
  ): Promise<TenantOnboardingPlatformReviewMutationResult> {
    const { data, error } = await client().rpc(
      "mutate_tenant_onboarding_platform_review",
      {
        p_application_id: input.applicationId,
        p_expected_version: input.expectedVersion,
        p_reviewer_employee_id: input.reviewerEmployeeId,
        p_action: action,
        p_required_fields: input.requiredFields ?? [],
        p_remark: input.remark ?? null,
        p_partner_id: input.partnerId ?? null,
        p_candidate_snapshot: input.candidateSnapshot ?? {},
        p_now: input.now,
      },
    );
    if (error) throw Errors.dbError("更新平台装企入驻审核失败", error);
    const result = parsePlatformReviewMutation(data);
    if (result.status !== "updated") return result;
    const application = await this.findApplicationById(result.application_id);
    if (!application || application.version !== result.application_version) {
      throw Errors.dbError("更新平台装企入驻审核失败", {
        message: "review mutation result could not be reloaded",
      });
    }
    return { status: "updated", application, idempotent: result.idempotent };
  }
}

type ReviewMutationBase = {
  applicationId: string;
  expectedVersion: number;
  reviewerEmployeeId: string;
  now: string;
};

export const tenantOnboardingReviewRepository =
  new TenantOnboardingReviewRepository();
