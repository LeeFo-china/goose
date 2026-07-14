import { Errors } from "@/errors/error-factory";
import type {
  TenantOnboardingAdministrativeAreaRecord,
  TenantOnboardingApplicationRecord,
  TenantOnboardingApplicationSummaryRecord,
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
const OWNED_LIST_SELECT = [
  "id", "application_no", "company_name", "status", "partner_assist_status",
  "version", "created_at", "updated_at",
].join(",");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TenantOnboardingCreateApplicationInput = Omit<
  TenantOnboardingApplicationRecord,
  | "id"
  | "version"
  | "converted_tenant_id"
  | "final_partner_id"
  | "attribution_source_type"
  | "status"
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
  neq: (...args: unknown[]) => UntypedTable;
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

type UntypedClient = {
  from: (table: TableName) => UntypedTable;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

function from(table: TableName): UntypedTable {
  return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
}

class TenantOnboardingRepository {
  async createApplicationAtomic(input: {
    application: TenantOnboardingCreateApplicationInput;
    smsCodeId: string;
    smsPhone: string;
    now: string;
  }) {
    const { data, error } = await this.rpc(
      "submit_tenant_onboarding_application",
      {
        p_application: input.application,
        p_sms_code_id: input.smsCodeId,
        p_sms_phone: input.smsPhone,
        p_now: input.now,
      },
    );
    if (this.isSmsInvalid(error)) {
      throw Errors.business(400, "验证码错误或已过期", "SMS_CODE_INVALID");
    }
    if (error) throw Errors.dbError("提交装企入驻申请失败", error);
    const result = this.parseMutationResult(data, true);
    const application = await this.findById(result.applicationId);
    if (!application) throw this.invalidRpcResult("提交装企入驻申请失败");
    return { application, created: result.created };
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

  async findOpenByCreditCode(normalizedCreditCode: string, excludeId?: string) {
    let query = from("tenant_onboarding_applications")
      .select(APPLICATION_SELECT)
      .eq("unified_social_credit_code", normalizedCreditCode)
      .in("status", ["submitted", "reviewing", "supplement_required"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (excludeId) query = query.neq("id", excludeId);
    const { data, error } = await query.maybeSingle();
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

  async findById(applicationId: string) {
    const { data, error } = await from("tenant_onboarding_applications")
      .select(APPLICATION_SELECT)
      .eq("id", applicationId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻申请失败", error);
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
      .select(OWNED_LIST_SELECT, { count: "exact" })
      .eq("visitor_id", input.visitorId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) throw Errors.dbError("查询我的装企入驻申请失败", error);
    return {
      list: (data ?? []) as TenantOnboardingApplicationSummaryRecord[],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async supplementAtomic(input: {
    applicationId: string;
    visitorId: string;
    expectedVersion: number;
    patch: TenantOnboardingSupplementPatch;
    candidate: {
      replace: boolean;
      partnerId: string | null;
      matchReason: string | null;
      snapshot: unknown;
      assistStatus: string;
      requestedAt: string | null;
      dueAt: string | null;
    };
    now: string;
  }) {
    const { data, error } = await this.rpc(
      "supplement_tenant_onboarding_application",
      {
        p_application_id: input.applicationId,
        p_visitor_id: input.visitorId,
        p_expected_version: input.expectedVersion,
        p_patch: input.patch,
        p_replace_candidate: input.candidate.replace,
        p_candidate_partner_id: input.candidate.partnerId,
        p_candidate_match_reason: input.candidate.matchReason,
        p_candidate_snapshot: input.candidate.snapshot,
        p_partner_assist_status: input.candidate.assistStatus,
        p_partner_assist_requested_at: input.candidate.requestedAt,
        p_partner_assist_due_at: input.candidate.dueAt,
        p_now: input.now,
      },
    );
    if (error) throw Errors.dbError("补充装企入驻申请失败", error);
    const result = this.parseMutationResult(data, false);
    if (!result) return null;
    return await this.findOwnedById(result.applicationId, input.visitorId);
  }

  async withdrawAtomic(input: {
    applicationId: string;
    visitorId: string;
    expectedVersion: number;
    reason: string | null;
    now: string;
  }) {
    const { data, error } = await this.rpc(
      "withdraw_tenant_onboarding_application",
      {
        p_application_id: input.applicationId,
        p_visitor_id: input.visitorId,
        p_expected_version: input.expectedVersion,
        p_reason: input.reason,
        p_now: input.now,
      },
    );
    if (error) throw Errors.dbError("撤回装企入驻申请失败", error);
    const result = this.parseMutationResult(data, false);
    if (!result) return null;
    return await this.findOwnedById(result.applicationId, input.visitorId);
  }

  private rpc(name: string, params: Record<string, unknown>) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient)
      .rpc(name, params);
  }

  private parseMutationResult(data: unknown, requireCreated: true): {
    applicationId: string;
    created: boolean;
  };
  private parseMutationResult(data: unknown, requireCreated: false): {
    applicationId: string;
  } | null;
  private parseMutationResult(data: unknown, requireCreated: boolean) {
    if (Array.isArray(data) && data.length === 0 && !requireCreated) return null;
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!row || typeof row !== "object") throw this.invalidRpcResult();
    const record = row as Record<string, unknown>;
    if (typeof record.application_id !== "string" ||
      !UUID_PATTERN.test(record.application_id)) throw this.invalidRpcResult();
    if (requireCreated && typeof record.created !== "boolean") {
      throw this.invalidRpcResult();
    }
    return requireCreated
      ? { applicationId: record.application_id, created: record.created as boolean }
      : { applicationId: record.application_id };
  }

  private isSmsInvalid(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const record = error as Record<string, unknown>;
    return record.code === "P0001" &&
      record.message === "TENANT_ONBOARDING_SMS_INVALID";
  }

  private invalidRpcResult(message = "执行装企入驻申请事务失败") {
    return Errors.dbError(message, { message: "tenant onboarding RPC returned invalid data" });
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
  id: string;
  code: string;
  partner_id: string;
  expires_at: string | null;
  partner: TenantOnboardingPartnerBrief | null;
};

export type TenantOnboardingActiveInviteCode = Pick<
  InviteCodePartnerRow,
  "id" | "code" | "partner_id"
>;

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
      .select("id,code,partner_id,expires_at,partner:platform_partners!platform_partner_invite_codes_partner_id_fkey(id,name,status,region_codes)")
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

  findActiveInviteCodeByCode(inviteCode: string) {
    return this.findActiveInviteCode("code", inviteCode);
  }

  findActiveInviteCodeById(inviteCodeId: string) {
    return this.findActiveInviteCode("id", inviteCodeId);
  }

  private async findActiveInviteCode(column: "code" | "id", value: string) {
    const { data, error } = await from("platform_partner_invite_codes")
      .select("id,code,partner_id,expires_at")
      .eq(column, value)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻邀请码来源失败", error);
    const row = data as Omit<InviteCodePartnerRow, "partner"> | null;
    if (!row || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) {
      return null;
    }
    return { id: row.id, code: row.code, partner_id: row.partner_id };
  }
}

export const tenantOnboardingRepository = new TenantOnboardingRepository();
export const tenantOnboardingApplicantContextRepository =
  new TenantOnboardingApplicantContextRepository();
export const tenantOnboardingApplicantFileRepository =
  new TenantOnboardingApplicantFileRepository();
export const tenantOnboardingRegionMatchRepository =
  new TenantOnboardingRegionMatchRepository();
