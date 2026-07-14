import { Errors } from "@/errors/error-factory";
import type {
  TenantOnboardingAdministrativeAreaRecord,
  TenantOnboardingApplicationRecord,
  TenantOnboardingApplicationReviewRecord,
  TenantOnboardingPartnerBrief,
  TenantOnboardingPartnerOverlapQuery,
  TenantOnboardingPartnerOverlapResult,
} from "@/repositories/tenant-onboarding-types";
import { SupabaseDB } from "@/utils/supabase";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_REGION_CODES = 100;

const APPLICATION_SELECT = [
  "id", "application_no", "visitor_id", "visitor_context_id", "company_name",
  "unified_social_credit_code", "business_license_file_id", "admin_name",
  "admin_phone", "address_province", "address_city", "address_district",
  "address_region_code", "address", "address_latitude", "address_longitude",
  "service_region_codes", "source_channel", "invite_code_id",
  "candidate_partner_id", "candidate_match_reason", "candidate_snapshot",
  "final_partner_id", "attribution_source_type", "status",
  "partner_assist_status", "partner_assist_requested_at", "partner_assist_due_at",
  "version", "converted_tenant_id", "reviewed_by_employee_id", "reviewed_at",
  "review_remark", "privacy_policy_version", "onboarding_terms_version",
  "consented_at", "idempotency_key", "withdrawn_at", "created_at", "updated_at",
].join(",");

export type TenantOnboardingCreateApplicationInput = Omit<
  TenantOnboardingApplicationRecord,
  | "id"
  | "version"
  | "converted_tenant_id"
  | "reviewed_by_employee_id"
  | "reviewed_at"
  | "review_remark"
  | "withdrawn_at"
  | "created_at"
  | "updated_at"
  | "candidate_partner"
  | "final_partner"
>;

export type TenantOnboardingSupplementPatch = Partial<Pick<
  TenantOnboardingApplicationRecord,
  | "company_name"
  | "unified_social_credit_code"
  | "business_license_file_id"
  | "admin_name"
  | "address_province"
  | "address_city"
  | "address_district"
  | "address_region_code"
  | "address"
  | "address_latitude"
  | "address_longitude"
  | "service_region_codes"
>>;

export type TenantOnboardingReviewEventInput = Omit<
  TenantOnboardingApplicationReviewRecord,
  "id" | "created_at"
>;

export type TenantOnboardingLocationContextRecord = {
  id: string;
  visitor_id: string | null;
};

export type TenantOnboardingBusinessLicenseRecord = {
  id: string;
  owner_visitor_id: string | null;
  scene: string;
  status: string;
  visibility: string;
  deleted_at: string | null;
};

type TableName =
  | "administrative_areas"
  | "platform_file_objects"
  | "platform_partner_invite_codes"
  | "platform_partners"
  | "tenant_onboarding_applications"
  | "tenant_onboarding_application_reviews"
  | "user_location_contexts";

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  is: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  overlaps: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type UntypedClient = { from: (table: TableName) => UntypedTable };

function from(table: TableName): UntypedTable {
  return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
}

class TenantOnboardingRepository {
  async createApplication(input: TenantOnboardingCreateApplicationInput) {
    const { data, error } = await from("tenant_onboarding_applications")
      .insert(input)
      .select(APPLICATION_SELECT)
      .single();
    if (error) throw Errors.dbError("提交装企入驻申请失败", error);
    return data as TenantOnboardingApplicationRecord;
  }

  async findByVisitorAndIdempotencyKey(
    visitorId: string,
    idempotencyKey: string,
  ) {
    const { data, error } = await from("tenant_onboarding_applications")
      .select(APPLICATION_SELECT)
      .eq("visitor_id", visitorId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻幂等申请失败", error);
    return (data as TenantOnboardingApplicationRecord | null) ?? null;
  }

  async findOpenByCreditCode(normalizedCreditCode: string) {
    const { data, error } = await from("tenant_onboarding_applications")
      .select(APPLICATION_SELECT)
      .eq("unified_social_credit_code", normalizedCreditCode)
      .in("status", ["submitted", "reviewing", "supplement_required"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻重复主体失败", error);
    return (data as TenantOnboardingApplicationRecord | null) ?? null;
  }

  async findOwnedById(applicationId: string, visitorId: string) {
    const { data, error } = await from("tenant_onboarding_applications")
      .select(APPLICATION_SELECT)
      .eq("id", applicationId)
      .eq("visitor_id", visitorId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻申请详情失败", error);
    return (data as TenantOnboardingApplicationRecord | null) ?? null;
  }

  async listOwned(input: { visitorId: string; page: number; pageSize: number }) {
    const page = Number.isInteger(input.page) && input.page > 0
      ? input.page
      : DEFAULT_PAGE;
    const pageSize = Number.isInteger(input.pageSize) && input.pageSize > 0
      ? Math.min(input.pageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
    const start = (page - 1) * pageSize;
    const { data, error, count } = await from("tenant_onboarding_applications")
      .select(APPLICATION_SELECT, { count: "exact" })
      .eq("visitor_id", input.visitorId)
      .order("created_at", { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) throw Errors.dbError("查询我的装企入驻申请失败", error);
    return {
      list: (data ?? []) as TenantOnboardingApplicationRecord[],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async updateSupplement(input: {
    applicationId: string;
    visitorId: string;
    expectedVersion: number;
    patch: TenantOnboardingSupplementPatch;
  }) {
    const { data, error } = await from("tenant_onboarding_applications")
      .update({
        ...input.patch,
        status: "submitted",
        version: input.expectedVersion + 1,
      })
      .eq("id", input.applicationId)
      .eq("visitor_id", input.visitorId)
      .eq("status", "supplement_required")
      .eq("version", input.expectedVersion)
      .select(APPLICATION_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("补充装企入驻申请失败", error);
    return (data as TenantOnboardingApplicationRecord | null) ?? null;
  }

  async withdraw(input: {
    applicationId: string;
    visitorId: string;
    expectedVersion: number;
  }) {
    const { data, error } = await from("tenant_onboarding_applications")
      .update({
        status: "withdrawn",
        version: input.expectedVersion + 1,
        withdrawn_at: new Date().toISOString(),
      })
      .eq("id", input.applicationId)
      .eq("visitor_id", input.visitorId)
      .in("status", ["submitted", "reviewing", "supplement_required"])
      .eq("version", input.expectedVersion)
      .select(APPLICATION_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("撤回装企入驻申请失败", error);
    return (data as TenantOnboardingApplicationRecord | null) ?? null;
  }

  async appendReviewEvent(input: TenantOnboardingReviewEventInput) {
    const { error } = await from("tenant_onboarding_application_reviews")
      .insert(input);
    if (error) throw Errors.dbError("记录装企入驻申请操作失败", error);
  }
}

class TenantOnboardingApplicantContextRepository {
  async findById(contextId: string) {
    const { data, error } = await from("user_location_contexts")
      .select("id,visitor_id")
      .eq("id", contextId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻定位上下文失败", error);
    return (data as TenantOnboardingLocationContextRecord | null) ?? null;
  }
}

class TenantOnboardingApplicantFileRepository {
  async findById(fileId: string) {
    const { data, error } = await from("platform_file_objects")
      .select("id,owner_visitor_id,scene,status,visibility,deleted_at")
      .eq("id", fileId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻营业执照失败", error);
    return (data as TenantOnboardingBusinessLicenseRecord | null) ?? null;
  }
}

type InviteCodePartnerRow = {
  expires_at: string | null;
  partner: TenantOnboardingPartnerBrief | null;
};

class TenantOnboardingRegionMatchRepository {
  async loadActiveByAdcodes(adcodes: readonly string[]) {
    if (adcodes.length === 0) return [];
    const boundedCodes = [...new Set(adcodes)].slice(0, MAX_REGION_CODES);
    const { data, error } = await from("administrative_areas")
      .select("adcode,level,parent_adcode")
      .in("adcode", boundedCodes)
      .eq("status", "active")
      .limit(boundedCodes.length);
    if (error) throw Errors.dbError("查询装企入驻行政区划失败", error);
    return (data ?? []) as TenantOnboardingAdministrativeAreaRecord[];
  }

  async listActiveOverlappingPartners(
    input: TenantOnboardingPartnerOverlapQuery,
  ): Promise<TenantOnboardingPartnerOverlapResult> {
    const { data, error } = await from("platform_partners")
      .select("id,name,status,region_codes")
      .eq("status", "active")
      .overlaps("region_codes", input.region_codes)
      .order("id", { ascending: true })
      .limit(input.limit + 1);
    if (error) throw Errors.dbError("查询装企入驻候选合伙人失败", error);
    const rows = (data ?? []) as TenantOnboardingPartnerBrief[];
    return {
      partners: rows.slice(0, input.limit),
      truncated: rows.length > input.limit,
    };
  }

  async findPartnerByInviteCode(inviteCode: string) {
    const { data, error } = await from("platform_partner_invite_codes")
      .select("expires_at,partner:platform_partners!platform_partner_invite_codes_partner_id_fkey(id,name,status,region_codes)")
      .eq("code", inviteCode)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻合伙人邀请码失败", error);
    const row = (data as InviteCodePartnerRow | null) ?? null;
    if (!row?.partner || row.partner.status !== "active") return null;
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }
    return row.partner;
  }
}

export const tenantOnboardingRepository = new TenantOnboardingRepository();
export const tenantOnboardingApplicantContextRepository =
  new TenantOnboardingApplicantContextRepository();
export const tenantOnboardingApplicantFileRepository =
  new TenantOnboardingApplicantFileRepository();
export const tenantOnboardingRegionMatchRepository =
  new TenantOnboardingRegionMatchRepository();
