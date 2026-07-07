import { Errors } from "@/errors/error-factory";
import {
  MEMBER_SELECT,
  PARTNER_SELECT,
  type PageResult,
  type PlatformPartnerMemberRecord,
  type PlatformPartnerRecord,
} from "@/repositories/platform-partner-portal-types";
import type {
  PlatformPartnerMemberRebindListQuery,
  PlatformPartnerMemberRebindStatus,
} from "@/schema/platform-partner-member-rebind";
import { SupabaseDB } from "@/utils/supabase/index";

export type PlatformPartnerMemberRebindRequestRecord = {
  id: string;
  partner_id: string;
  member_id: string;
  phone: string;
  old_auth_user_id: string;
  new_auth_user_id: string;
  applicant_name: string | null;
  reason: string | null;
  status: PlatformPartnerMemberRebindStatus;
  reviewer_employee_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  member?: PlatformPartnerMemberRecord | null;
  partner?: PlatformPartnerRecord | null;
};

export type PlatformPartnerMemberRebindCreateInput = {
  partnerId: string;
  memberId: string;
  phone: string;
  oldAuthUserId: string;
  newAuthUserId: string;
  applicantName?: string | null;
  reason?: string | null;
};

export type PlatformPartnerMemberRebindApproveResult =
  | { status: "approved"; request: PlatformPartnerMemberRebindRequestRecord }
  | { status: "request_not_found" }
  | { status: "request_already_reviewed" }
  | { status: "member_not_found" }
  | { status: "partner_unavailable" }
  | { status: "member_binding_changed" }
  | { status: "new_auth_user_already_bound" };

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  not: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
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
  from: (
    table:
      | "platform_partner_member_rebind_requests"
      | "platform_partner_members"
  ) => UntypedTable;
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const REBIND_REQUEST_SELECT = [
  "*",
  `partner:platform_partners!platform_partner_member_rebind_requests_partner_id_fkey(${PARTNER_SELECT})`,
  `member:platform_partner_members!platform_partner_member_rebind_requests_member_id_fkey(${MEMBER_SELECT})`,
].join(", ");

class PlatformPartnerMemberRebindRepository {
  private from(table: Parameters<UntypedClient["from"]>[0]) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  private rpc(name: string, params: Record<string, unknown>) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).rpc(
      name,
      params,
    );
  }

  async findBoundMemberByPhone(phone: string) {
    const { data, error } = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("phone", phone)
      .eq("status", "active")
      .not("auth_user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询已绑定合伙人成员失败", error);
    return (data as PlatformPartnerMemberRecord | null) ?? null;
  }

  async findPendingDuplicateByMemberId(memberId: string) {
    const { data, error } = await this.from(
      "platform_partner_member_rebind_requests",
    )
      .select(REBIND_REQUEST_SELECT)
      .eq("member_id", memberId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询合伙人成员换绑申请失败", error);
    return (data as PlatformPartnerMemberRebindRequestRecord | null) ?? null;
  }

  async createRequest(input: PlatformPartnerMemberRebindCreateInput) {
    const { data, error } = await this.from(
      "platform_partner_member_rebind_requests",
    )
      .insert({
        partner_id: input.partnerId,
        member_id: input.memberId,
        phone: input.phone,
        old_auth_user_id: input.oldAuthUserId,
        new_auth_user_id: input.newAuthUserId,
        applicant_name: input.applicantName ?? null,
        reason: input.reason ?? null,
      })
      .select(REBIND_REQUEST_SELECT)
      .single();

    if (error) throw Errors.dbError("提交合伙人成员换绑申请失败", error);
    return data as PlatformPartnerMemberRebindRequestRecord;
  }

  async listRequests(
    query: PlatformPartnerMemberRebindListQuery,
  ): Promise<PageResult<PlatformPartnerMemberRebindRequestRecord>> {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    let request = this.from("platform_partner_member_rebind_requests")
      .select(REBIND_REQUEST_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (query.status) request = request.eq("status", query.status);
    if (query.partner_id) request = request.eq("partner_id", query.partner_id);
    if (query.keyword) {
      const escaped = query.keyword.replaceAll(",", "\\,");
      request = request.or(
        `phone.ilike.%${escaped}%,applicant_name.ilike.%${escaped}%,reason.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询合伙人成员换绑申请失败", error);
    return {
      list: (data ?? []) as PlatformPartnerMemberRebindRequestRecord[],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  async findRequestById(id: string) {
    const { data, error } = await this.from(
      "platform_partner_member_rebind_requests",
    )
      .select(REBIND_REQUEST_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw Errors.dbError("查询合伙人成员换绑申请失败", error);
    return (data as PlatformPartnerMemberRebindRequestRecord | null) ?? null;
  }

  async approveRequest(input: {
    id: string;
    reviewerEmployeeId: string;
    comment?: string | null;
  }): Promise<PlatformPartnerMemberRebindApproveResult> {
    const { data, error } = await this.rpc(
      "approve_platform_partner_member_rebind_request",
      {
        p_request_id: input.id,
        p_reviewer_employee_id: input.reviewerEmployeeId,
        p_comment: input.comment ?? null,
      },
    );

    if (error) throw Errors.dbError("审核通过合伙人成员换绑申请失败", error);
    const [record] = (data || []) as Array<{
      status: PlatformPartnerMemberRebindApproveResult["status"];
      request_id: string | null;
    }>;
    if (!record) {
      throw Errors.dbError("审核通过合伙人成员换绑申请失败", {
        message: "approve_platform_partner_member_rebind_request returned no rows",
      });
    }

    if (record.status !== "approved") {
      return { status: record.status } as PlatformPartnerMemberRebindApproveResult;
    }

    const reviewed = await this.findRequestById(record.request_id ?? input.id);
    if (!reviewed) {
      throw Errors.dbError("审核通过合伙人成员换绑申请失败", {
        message: "approved request not found after review",
      });
    }
    return { status: "approved", request: reviewed };
  }

  async rejectRequest(input: {
    id: string;
    reviewerEmployeeId: string;
    comment?: string | null;
  }) {
    const { data, error } = await this.from(
      "platform_partner_member_rebind_requests",
    )
      .update({
        status: "rejected",
        reviewer_employee_id: input.reviewerEmployeeId,
        review_comment: input.comment ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("status", "pending")
      .select(REBIND_REQUEST_SELECT)
      .maybeSingle();

    if (error) throw Errors.dbError("驳回合伙人成员换绑申请失败", error);
    return (data as PlatformPartnerMemberRebindRequestRecord | null) ?? null;
  }
}

export const platformPartnerMemberRebindRepository =
  new PlatformPartnerMemberRebindRepository();
