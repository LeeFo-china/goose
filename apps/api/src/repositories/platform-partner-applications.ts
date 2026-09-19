import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";
import type {
  PlatformPartnerApplicationListQuery,
  PlatformPartnerApplicationStatus,
} from "@/schema/platform-partner-applications";
import type { PlatformPartnerRecord } from "@/repositories/platform-partners";

export type { PlatformPartnerApplicationStatus };

export type PlatformPartnerApplicationRecord = {
  id: string;
  application_no: string;
  applicant_name: string;
  subject_type: "personal" | "individual_business" | "company";
  contact_name: string;
  phone: string;
  region_codes: string[];
  region_name: string | null;
  business_description: string | null;
  resource_description: string | null;
  message: string | null;
  source_channel: string;
  source_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  status: PlatformPartnerApplicationStatus;
  version: number;
  reviewed_by_employee_id: string | null;
  reviewed_at: string | null;
  review_remark: string | null;
  converted_partner_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  converted_partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
  reviewer?: { id: string; name: string | null } | null;
};

export type PlatformPartnerApplicationCreateRecordInput = Omit<
  PlatformPartnerApplicationRecord,
  | "id"
  | "reviewed_by_employee_id"
  | "reviewed_at"
  | "review_remark"
  | "converted_partner_id"
  | "version"
  | "created_at"
  | "updated_at"
  | "converted_partner"
  | "reviewer"
>;

export type PlatformPartnerApplicationStatusRecordInput = {
  status: "reviewing" | "rejected";
  reviewed_by_employee_id: string;
  review_remark?: string | null;
};

export type PlatformPartnerApplicationApprovedRecordInput = {
  converted_partner_id: string;
  reviewed_by_employee_id: string;
  review_remark?: string | null;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  contains: (...args: unknown[]) => UntypedTable;
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
  from: (table: "platform_partner_applications") => UntypedTable;
  rpc: (
    functionName: "review_platform_partner_application",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export type PlatformPartnerApplicationReviewCommandInput = {
  applicationId: string;
  expectedVersion: number;
  action: "approve" | "reject" | "request_supplement";
  remark: string;
  requiredFields: string[];
  partnerLevelCode: string | null;
  regionCodes: string[];
  generateDefaultInviteCode: boolean;
  actorEmployeeId: string;
  idempotencyKey: string;
  requestHash: string;
};

export type PlatformPartnerApplicationReviewCommandResult =
  | {
      status: "updated";
      idempotent: boolean;
      application: {
        id: string;
        status: PlatformPartnerApplicationStatus;
        version: number;
        converted_partner_id: string | null;
      };
      partner: {
        id: string;
        name: string;
        status: "active";
        default_invite_code: string | null;
      } | null;
    }
  | { status: "application_not_found" }
  | { status: "version_conflict"; current_version: number }
  | { status: "already_reviewed"; current_status: string; current_version: number }
  | { status: "partner_level_not_found" }
  | { status: "idempotency_conflict" }
  | { status: "validation_error" };

const APPLICATION_SELECT = [
  "*",
  "converted_partner:platform_partners!platform_partner_applications_converted_partner_id_fkey(id, name, status)",
  "reviewer:employees!platform_partner_applications_reviewed_by_employee_id_fkey(id, name)",
].join(", ");

class PlatformPartnerApplicationsRepository {
  private from(table: "platform_partner_applications") {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async createApplication(input: PlatformPartnerApplicationCreateRecordInput) {
    const { data, error } = await this.from("platform_partner_applications")
      .insert(input)
      .select(APPLICATION_SELECT)
      .single();

    if (error) throw Errors.dbError("提交城市合伙人申请失败", error);
    return data as PlatformPartnerApplicationRecord;
  }

  async findActiveApplicationByPhone(phone: string) {
    const { data, error } = await this.from("platform_partner_applications")
      .select(APPLICATION_SELECT)
      .eq("phone", phone)
      .in("status", ["submitted", "reviewing", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询城市合伙人重复申请失败", error);
    return (data as PlatformPartnerApplicationRecord | null) ?? null;
  }

  async listApplications(query: PlatformPartnerApplicationListQuery) {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let request = this.from("platform_partner_applications")
      .select(APPLICATION_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (query.status) request = request.eq("status", query.status);
    if (query.region_code) {
      request = request.contains("region_codes", [query.region_code]);
    }
    if (query.keyword) {
      const escaped = query.keyword.replaceAll(",", "\\,");
      request = request.or(
        `application_no.ilike.%${escaped}%,applicant_name.ilike.%${escaped}%,contact_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,region_name.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询城市合伙人申请失败", error);
    return this.buildPage<PlatformPartnerApplicationRecord>(
      data,
      count,
      query.page,
      query.pageSize,
    );
  }

  async findApplicationById(applicationId: string) {
    const { data, error } = await this.from("platform_partner_applications")
      .select(APPLICATION_SELECT)
      .eq("id", applicationId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询城市合伙人申请详情失败", error);
    return (data as PlatformPartnerApplicationRecord | null) ?? null;
  }

  async updateApplicationStatus(
    applicationId: string,
    input: PlatformPartnerApplicationStatusRecordInput,
  ) {
    const { data, error } = await this.from("platform_partner_applications")
      .update({
        status: input.status,
        reviewed_by_employee_id: input.reviewed_by_employee_id,
        reviewed_at: new Date().toISOString(),
        review_remark: input.review_remark ?? null,
      })
      .eq("id", applicationId)
      .select(APPLICATION_SELECT)
      .single();

    if (error) throw Errors.dbError("更新城市合伙人申请状态失败", error);
    return data as PlatformPartnerApplicationRecord;
  }

  async markApplicationApproved(
    applicationId: string,
    input: PlatformPartnerApplicationApprovedRecordInput,
  ) {
    const { data, error } = await this.from("platform_partner_applications")
      .update({
        status: "approved",
        converted_partner_id: input.converted_partner_id,
        reviewed_by_employee_id: input.reviewed_by_employee_id,
        reviewed_at: new Date().toISOString(),
        review_remark: input.review_remark ?? null,
      })
      .eq("id", applicationId)
      .select(APPLICATION_SELECT)
      .single();

    if (error) throw Errors.dbError("标记城市合伙人申请通过失败", error);
    return data as PlatformPartnerApplicationRecord;
  }

  async reviewApplicationAtomic(
    input: PlatformPartnerApplicationReviewCommandInput,
  ): Promise<PlatformPartnerApplicationReviewCommandResult> {
    const { data, error } = await (
      SupabaseDB.getAdminClient() as unknown as UntypedClient
    ).rpc("review_platform_partner_application", {
      p_application_id: input.applicationId,
      p_expected_version: input.expectedVersion,
      p_action: input.action,
      p_remark: input.remark,
      p_required_fields: input.requiredFields,
      p_partner_level_code: input.partnerLevelCode,
      p_region_codes: input.regionCodes,
      p_generate_default_invite_code: input.generateDefaultInviteCode,
      p_actor_employee_id: input.actorEmployeeId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
    });

    if (error) throw Errors.dbError("审核城市合伙人申请失败", error);
    return data as PlatformPartnerApplicationReviewCommandResult;
  }

  private buildPage<T>(
    data: unknown,
    count: number | null,
    page: number,
    pageSize: number,
  ) {
    return {
      list: (data ?? []) as T[],
      pagination: {
        page,
        pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }
}

export const platformPartnerApplicationsRepository =
  new PlatformPartnerApplicationsRepository();
