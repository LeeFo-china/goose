import { Errors } from "@/errors/error-factory";
import {
  COMMISSION_LEDGER_SELECT,
  INVITE_CODE_SELECT,
  MEMBER_SELECT,
  PARTNER_SELECT,
  REVENUE_EVENT_SELECT,
  SETTLEMENT_BATCH_SELECT,
  TENANT_BINDING_SELECT,
  type PageResult,
  type PartnerCommissionLedgerListInput,
  type PartnerDashboardSummaryInput,
  type PartnerDashboardSummaryRecord,
  type PartnerPortalTable,
  type PartnerRevenueEventListInput,
  type PartnerSettlementBatchListInput,
  type PartnerTenantBindingListInput,
  type PlatformPartnerMemberBindingClaimResult,
  type PlatformPartnerMemberRecord,
  type PlatformPartnerMemberUnbindClaimResult,
  type PlatformPartnerPortalRepositoryPort,
  type PlatformPartnerRecord,
  type UntypedClient,
  type UntypedTable,
} from "@/repositories/platform-partner-portal-types";
import { isPostgresUniqueViolation } from "@/repositories/repository-errors";
import type {
  PartnerCommissionLedgerRecord,
  PartnerSettlementBatchRecord,
  PlatformRevenueEventRecord,
} from "@/repositories/platform-partner-revenue";
import type { PlatformPartnerInviteCodeCreateRecordInput, PlatformPartnerInviteCodeRecord, TenantPartnerBindingRecord } from "@/repositories/platform-partners";
import { SupabaseDB } from "@/utils/supabase/index";

export type * from "@/repositories/platform-partner-portal-types";

class PlatformPartnerPortalRepository implements PlatformPartnerPortalRepositoryPort {
  private from(table: PartnerPortalTable) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  private rpc(name: string, params: Record<string, unknown>) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).rpc(name, params);
  }

  async findMemberByAuthUserId(authUserId: string) {
    const activeResult = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("auth_user_id", authUserId)
      .eq("status", "active")
      .maybeSingle();

    if (activeResult.error) {
      throw Errors.dbError("查询合伙人成员失败", activeResult.error);
    }
    if (activeResult.data) {
      return activeResult.data as PlatformPartnerMemberRecord;
    }

    const inactiveResult = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("auth_user_id", authUserId)
      .neq("status", "active")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inactiveResult.error) {
      throw Errors.dbError("查询合伙人成员失败", inactiveResult.error);
    }
    return (inactiveResult.data as PlatformPartnerMemberRecord | null) ?? null;
  }

  async findMemberById(memberId: string) {
    const { data, error } = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("id", memberId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询合伙人成员失败", error);
    return (data as PlatformPartnerMemberRecord | null) ?? null;
  }

  async findBindableMemberByPhone(phone: string) {
    const { data, error } = await this.from("platform_partner_members")
      .select(MEMBER_SELECT)
      .eq("phone", phone)
      .in("status", ["pending_bind", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询可绑定合伙人成员失败", error);
    return (data as PlatformPartnerMemberRecord | null) ?? null;
  }

  async claimMemberBinding(input: {
    phone: string;
    code: string;
    authUserId: string;
  }) {
    const { data, error } = await this.rpc(
      "claim_platform_partner_member_binding",
      {
        p_phone: input.phone,
        p_code: input.code,
        p_auth_user_id: input.authUserId,
      },
    );

    if (error) throw Errors.dbError("绑定合伙人成员失败", error);

    const [record] = (data || []) as Array<{
      status: PlatformPartnerMemberBindingClaimResult["status"];
      member_id: string | null;
    }>;
    if (!record) {
      throw Errors.dbError("绑定合伙人成员失败", {
        message: "claim_platform_partner_member_binding returned no rows",
      });
    }

    if (record.status === "bound") {
      if (!record.member_id) {
        throw Errors.dbError("绑定合伙人成员失败", {
          message: "claim_platform_partner_member_binding returned bound without member_id",
        });
      }

      return { status: "bound", memberId: record.member_id } as const;
    }

    if (record.status === "member_already_bound") {
      return {
        status: "member_already_bound",
        memberId: record.member_id,
      } as const;
    }

    if (
      record.status === "sms_invalid" ||
      record.status === "member_not_found" ||
      record.status === "partner_unavailable"
    ) {
      return { status: record.status } as const;
    }

    throw Errors.dbError("绑定合伙人成员失败", {
      message: `unknown claim status: ${record.status}`,
    });
  }

  async claimMemberUnbind(input: {
    memberId: string;
    authUserId: string;
    partnerId: string;
    code: string;
  }) {
    const { data, error } = await this.rpc(
      "unbind_platform_partner_member_binding",
      {
        p_member_id: input.memberId,
        p_auth_user_id: input.authUserId,
        p_partner_id: input.partnerId,
        p_code: input.code,
      },
    );

    if (error) throw Errors.dbError("解绑合伙人成员微信失败", error);

    const [record] = (data || []) as Array<{
      status: PlatformPartnerMemberUnbindClaimResult["status"];
      member_id: string | null;
    }>;
    if (!record) {
      throw Errors.dbError("解绑合伙人成员微信失败", {
        message: "unbind_platform_partner_member_binding returned no rows",
      });
    }

    if (record.status === "unbound") {
      if (!record.member_id) {
        throw Errors.dbError("解绑合伙人成员微信失败", {
          message: "unbind_platform_partner_member_binding returned unbound without member_id",
        });
      }

      return { status: "unbound", memberId: record.member_id } as const;
    }

    if (
      record.status === "sms_invalid" ||
      record.status === "partner_unavailable" ||
      record.status === "member_not_bound"
    ) {
      return {
        status: record.status,
        memberId: record.member_id,
      } as const;
    }

    if (record.status === "member_not_found") {
      return { status: "member_not_found" } as const;
    }

    throw Errors.dbError("解绑合伙人成员微信失败", {
      message: `unknown claim status: ${record.status}`,
    });
  }

  async bindMemberAuthUser(memberId: string, authUserId: string) {
    const { data, error } = await this.from("platform_partner_members")
      .update({
        auth_user_id: authUserId,
        status: "active",
      })
      .eq("id", memberId)
      .select(MEMBER_SELECT)
      .single();

    if (error) throw Errors.dbError("绑定合伙人成员失败", error);
    return data as PlatformPartnerMemberRecord;
  }

  async unbindMemberAuthUser(input: {
    memberId: string;
    authUserId: string;
    partnerId: string;
  }) {
    const { data, error } = await this.from("platform_partner_members")
      .update({
        auth_user_id: null,
        status: "pending_bind",
      })
      .eq("id", input.memberId)
      .eq("auth_user_id", input.authUserId)
      .eq("partner_id", input.partnerId)
      .eq("status", "active")
      .select(MEMBER_SELECT)
      .maybeSingle();

    if (error) throw Errors.dbError("解绑合伙人成员微信失败", error);
    if (data) {
      return {
        status: "unbound",
        memberId: (data as PlatformPartnerMemberRecord).id,
      } as const;
    }

    const currentMember = await this.findMemberById(input.memberId);
    if (!currentMember) {
      return { status: "member_not_found" } as const;
    }

    if (
      currentMember.partner_id !== input.partnerId ||
      currentMember.auth_user_id !== input.authUserId
    ) {
      return {
        status: "member_not_bound",
        memberId: currentMember.id,
      } as const;
    }

    if (
      currentMember.status !== "active" ||
      currentMember.partner?.status !== "active"
    ) {
      return {
        status: "partner_unavailable",
        memberId: currentMember.id,
      } as const;
    }

    throw Errors.dbError("解绑合伙人成员微信失败", {
      message: "platform partner member unbind update affected no rows",
    });
  }

  async findPartnerById(partnerId: string) {
    const { data, error } = await this.from("platform_partners")
      .select(PARTNER_SELECT)
      .eq("id", partnerId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询城市合伙人失败", error);
    return (data as PlatformPartnerRecord | null) ?? null;
  }

  async listInviteCodes(partnerId: string) {
    const { data, error } = await this.from("platform_partner_invite_codes")
      .select(INVITE_CODE_SELECT)
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      // 邀请码是合伙人门户辅助入口，运营侧按合伙人少量创建；门户最多展示最近 50 条。
      .limit(50);

    if (error) throw Errors.dbError("查询合伙人邀请码失败", error);
    return (data ?? []) as PlatformPartnerInviteCodeRecord[];
  }

  async createInviteCode(input: PlatformPartnerInviteCodeCreateRecordInput) {
    const { data, error } = await this.from("platform_partner_invite_codes")
      .insert(input)
      .select(INVITE_CODE_SELECT)
      .single();

    if (error) {
      if (isPostgresUniqueViolation(error)) {
        const existing = await this.findInviteCodeByCode(input.code);
        if (existing?.partner_id === input.partner_id) {
          if (existing.status !== "active" || existing.expires_at) {
            return this.activateInviteCode(input.code, input.partner_id);
          }

          return existing;
        }
      }

      throw Errors.dbError("创建合伙人邀请码失败", error);
    }

    return data as PlatformPartnerInviteCodeRecord;
  }

  private async findInviteCodeByCode(code: string) {
    const { data, error } = await this.from("platform_partner_invite_codes")
      .select(INVITE_CODE_SELECT)
      .eq("code", code)
      .maybeSingle();

    if (error) throw Errors.dbError("查询合伙人邀请码失败", error);
    return (data as PlatformPartnerInviteCodeRecord | null) ?? null;
  }

  private async activateInviteCode(code: string, partnerId: string) {
    const { data, error } = await this.from("platform_partner_invite_codes")
      .update({ status: "active", expires_at: null })
      .eq("code", code)
      .eq("partner_id", partnerId)
      .select(INVITE_CODE_SELECT)
      .single();

    if (error) throw Errors.dbError("恢复合伙人邀请码失败", error);
    return data as PlatformPartnerInviteCodeRecord;
  }

  async listTenantBindings(input: PartnerTenantBindingListInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("tenant_partner_bindings")
      .select(TENANT_BINDING_SELECT, { count: "exact" })
      .eq("partner_id", input.partnerId)
      .order("bound_at", { ascending: false })
      .range(from, to);

    if (input.status) request = request.eq("status", input.status);

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询装企合伙人绑定列表失败", error);
    return this.buildPage<TenantPartnerBindingRecord>(
      data,
      count,
      input.page,
      input.pageSize,
    );
  }

  async listRevenueEvents(input: PartnerRevenueEventListInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("platform_revenue_events")
      .select(REVENUE_EVENT_SELECT, { count: "exact" })
      .eq("partner_id", input.partnerId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.revenue_type) request = request.eq("revenue_type", input.revenue_type);
    if (input.status) request = request.eq("status", input.status);
    request = this.applyCreatedAtRange(request, input);

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台收入事件失败", error);
    return this.buildPage<PlatformRevenueEventRecord>(
      data,
      count,
      input.page,
      input.pageSize,
    );
  }

  async listCommissionLedgers(input: PartnerCommissionLedgerListInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("partner_commission_ledger")
      .select(COMMISSION_LEDGER_SELECT, { count: "exact" })
      .eq("partner_id", input.partnerId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.status) request = request.eq("status", input.status);

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询合伙人分佣台账失败", error);
    return this.buildPage<PartnerCommissionLedgerRecord>(
      data,
      count,
      input.page,
      input.pageSize,
    );
  }

  async listSettlementBatches(input: PartnerSettlementBatchListInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("partner_settlement_batches")
      .select(SETTLEMENT_BATCH_SELECT, { count: "exact" })
      .eq("partner_id", input.partnerId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.status) request = request.eq("status", input.status);

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询合伙人结算批次失败", error);
    return this.buildPage<PartnerSettlementBatchRecord>(
      data,
      count,
      input.page,
      input.pageSize,
    );
  }

  async getMonthlySummary(input: PartnerDashboardSummaryInput) {
    const { data, error } = await this.rpc(
      "get_partner_dashboard_monthly_summary",
      {
        p_partner_id: input.partnerId,
        p_start_at: input.startDate,
        p_end_at: input.endDate,
      },
    );
    if (error) throw Errors.dbError("统计合伙人看板失败", error);

    const [summary] = (data ?? []) as PartnerDashboardSummaryRecord[];
    return summary ?? {
      tenant_count: 0,
      revenue_event_count: 0,
      revenue_amount_fen: 0,
      paid_amount_fen: 0,
      commission_amount_fen: 0,
      available_commission_amount_fen: 0,
      settled_commission_amount_fen: 0,
      settlement_batch_count: 0,
      settlement_total_amount_fen: 0,
      paid_settlement_amount_fen: 0,
    };
  }

  private applyCreatedAtRange(
    request: UntypedTable,
    input: { startDate?: string; endDate?: string },
  ) {
    return this.applyRange(request, "created_at", input);
  }

  private applyRange(
    request: UntypedTable,
    field: string,
    input: { startDate?: string; endDate?: string },
  ) {
    let nextRequest = request;
    if (input.startDate) nextRequest = nextRequest.gte(field, input.startDate);
    if (input.endDate) nextRequest = nextRequest.lt(field, input.endDate);
    return nextRequest;
  }

  private buildPage<T>(
    data: unknown,
    count: number | null,
    page: number,
    pageSize: number,
  ): PageResult<T> {
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

export const platformPartnerPortalRepository = new PlatformPartnerPortalRepository();
