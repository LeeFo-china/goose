import { Errors } from "@/errors/error-factory";
import {
  type PlatformPartnerInviteCodeRecord,
  type PlatformPartnerLevelRecord,
  type PlatformPartnerRecord as BasePlatformPartnerRecord,
  type TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";
import type {
  PartnerCommissionLedgerRecord,
  PartnerCommissionLedgerStatus,
  PartnerSettlementBatchRecord,
  PartnerSettlementBatchStatus,
  PlatformPartnerRevenueType,
  PlatformRevenueEventRecord,
  PlatformRevenueEventStatus,
} from "@/repositories/platform-partner-revenue";
import { SupabaseDB } from "@/utils/supabase/index";

export type PlatformPartnerRecord = Pick<
  BasePlatformPartnerRecord,
  "id" | "name" | "status" | "region_codes"
> & {
  level?: Pick<PlatformPartnerLevelRecord, "id" | "code" | "name" | "status"> | null;
};

export type PlatformPartnerMemberStatus = "pending_bind" | "active" | "disabled";
export type PlatformPartnerMemberRole = "owner" | "operator";

export type PlatformPartnerMemberRecord = {
  id: string;
  partner_id: string;
  auth_user_id: string | null;
  name: string;
  phone: string;
  role: PlatformPartnerMemberRole;
  status: PlatformPartnerMemberStatus;
  partner?: PlatformPartnerRecord | null;
};

export interface PlatformPartnerPortalRepositoryPort {
  findMemberByAuthUserId(authUserId: string): Promise<PlatformPartnerMemberRecord | null>;
  findMemberById(memberId: string): Promise<PlatformPartnerMemberRecord | null>;
  findBindableMemberByPhone(phone: string): Promise<PlatformPartnerMemberRecord | null>;
  claimMemberBinding(input: { phone: string; code: string; authUserId: string }): Promise<PlatformPartnerMemberBindingClaimResult>;
  bindMemberAuthUser(memberId: string, authUserId: string): Promise<PlatformPartnerMemberRecord>;
  findPartnerById(partnerId: string): Promise<PlatformPartnerRecord | null>;
  listInviteCodes(partnerId: string): Promise<PlatformPartnerInviteCodeRecord[]>;
  listTenantBindings(input: PartnerTenantBindingListInput): Promise<PageResult<TenantPartnerBindingRecord>>;
  listRevenueEvents(input: PartnerRevenueEventListInput): Promise<PageResult<PlatformRevenueEventRecord>>;
  listCommissionLedgers(input: PartnerCommissionLedgerListInput): Promise<PageResult<PartnerCommissionLedgerRecord>>;
  listSettlementBatches(input: PartnerSettlementBatchListInput): Promise<PageResult<PartnerSettlementBatchRecord>>;
  getMonthlySummary(input: PartnerDashboardSummaryInput): Promise<PartnerDashboardSummaryRecord>;
}

export type PlatformPartnerMemberBindingClaimResult =
  | { status: "bound"; memberId: string }
  | { status: "sms_invalid" }
  | { status: "member_not_found" }
  | { status: "partner_unavailable" }
  | { status: "member_already_bound"; memberId?: string | null };

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable; neq: (...args: unknown[]) => UntypedTable;
  gte: (...args: unknown[]) => UntypedTable; lt: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable; order: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable; range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{ data: unknown; error: unknown; count: number | null }>["then"];
};

type PartnerPortalTable = "platform_partner_members" | "platform_partners" | "platform_partner_invite_codes" | "tenant_partner_bindings" | "platform_revenue_events" | "partner_commission_ledger" | "partner_settlement_batches";

type UntypedClient = {
  from: (table: PartnerPortalTable) => UntypedTable;
  rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const PARTNER_LEVEL_SELECT = "id, code, name, status";

const PARTNER_SELECT =
  `id, name, status, region_codes, level:platform_partner_levels!platform_partners_level_id_fkey(${PARTNER_LEVEL_SELECT})`;
const MEMBER_SELECT =
  `id, partner_id, auth_user_id, name, phone, role, status, partner:platform_partners!platform_partner_members_partner_id_fkey(${PARTNER_SELECT})`;

const INVITE_CODE_SELECT =
  "id, partner_id, code, region_code, campaign_code, status, scan_count, submitted_count, approved_count, expires_at, created_at, updated_at";
const TENANT_BINDING_SELECT =
  "id, tenant_id, partner_id, invite_code_id, source_type, source_id, status, bound_at, unbound_at, change_reason, created_at, updated_at, tenant:tenants!tenant_partner_bindings_tenant_id_fkey(id, name, slug)";
const REVENUE_EVENT_SELECT =
  "id, revenue_type, tenant_id, partner_id, partner_level_id, binding_id, source_type, source_id, gross_amount_fen, revenue_amount_fen, paid_amount_fen, service_fee_rate_bps, commission_rate_bps, status, confirmed_at, paid_at, refundable_until, created_at, updated_at, tenant:tenants!platform_revenue_events_tenant_id_fkey(id, name, slug), partner_level:platform_partner_levels!platform_revenue_events_partner_level_id_fkey(id, code, name)";
const COMMISSION_LEDGER_SELECT =
  "id, partner_id, revenue_event_id, revenue_type, base_amount_fen, commission_rate_bps, commission_amount_fen, status, available_at, settlement_batch_id, blocked_reason, failure_reason, created_at, updated_at, revenue_event:platform_revenue_events!partner_commission_ledger_revenue_event_id_fkey(id, tenant_id, source_type, source_id, revenue_amount_fen)";
const SETTLEMENT_BATCH_SELECT =
  "id, batch_no, partner_id, period_start, period_end, total_amount_fen, status, settlement_method, payment_reference, payment_proof_url, reviewed_by_employee_id, paid_by_employee_id, paid_at, remark, created_at, updated_at";

export type PageResult<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};
type ScopedPageInput = { partnerId: string; page: number; pageSize: number };
export type PartnerTenantBindingListInput = ScopedPageInput & {
  status?: TenantPartnerBindingRecord["status"];
};
export type PartnerRevenueEventListInput = ScopedPageInput & {
  revenue_type?: PlatformPartnerRevenueType;
  status?: PlatformRevenueEventStatus;
  startDate?: string;
  endDate?: string;
};
export type PartnerCommissionLedgerListInput = ScopedPageInput & {
  status?: PartnerCommissionLedgerStatus;
};
export type PartnerSettlementBatchListInput = ScopedPageInput & {
  status?: PartnerSettlementBatchStatus;
};
export type PartnerDashboardSummaryInput = {
  partnerId: string; month: string; startDate: string; endDate: string;
};
export type PartnerDashboardSummaryRecord = {
  tenant_count: number;
  revenue_event_count: number;
  revenue_amount_fen: number;
  paid_amount_fen: number;
  commission_amount_fen: number;
  available_commission_amount_fen: number;
  settled_commission_amount_fen: number;
  settlement_batch_count: number;
  settlement_total_amount_fen: number;
  paid_settlement_amount_fen: number;
};

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
