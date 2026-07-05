import { Errors } from "@/errors/error-factory";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type {
  PlatformPartnerLevelRecord,
  PlatformPartnerRecord,
  TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";
import { SupabaseDB } from "@/utils/supabase/index";

export type PlatformPartnerRevenueType =
  | "tenant_recharge"
  | "lead_service_fee";

export type PlatformRevenueEventStatus =
  | "pending"
  | "confirmed"
  | "refunded"
  | "reversed"
  | "blocked";

export type PartnerCommissionLedgerStatus =
  | "pending"
  | "blocked"
  | "available"
  | "settling"
  | "settled"
  | "failed"
  | "reversed";

export type PartnerSettlementBatchStatus =
  | "draft"
  | "reviewing"
  | "paid"
  | "canceled";

export type PlatformRevenueEventRecord = {
  id: string;
  revenue_type: PlatformPartnerRevenueType;
  tenant_id: string;
  partner_id: string | null;
  partner_level_id: string | null;
  binding_id: string | null;
  source_type: string;
  source_id: string;
  gross_amount_fen: number;
  revenue_amount_fen: number;
  paid_amount_fen: number;
  service_fee_rate_bps: number | null;
  commission_rate_bps: number;
  status: PlatformRevenueEventStatus;
  confirmed_at: string | null;
  paid_at: string | null;
  refundable_until: string | null;
  metadata: Record<string, unknown>;
  created_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
  tenant?: { id: string; name: string | null; slug: string | null } | null;
  partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
  partner_level?: Pick<PlatformPartnerLevelRecord, "id" | "code" | "name"> | null;
};

export type PlatformRevenueEventCreateRecordInput = Omit<
  PlatformRevenueEventRecord,
  "id" | "created_at" | "updated_at" | "tenant" | "partner" | "partner_level"
>;

export type PartnerCommissionLedgerRecord = {
  id: string;
  partner_id: string;
  revenue_event_id: string;
  revenue_type: PlatformPartnerRevenueType;
  base_amount_fen: number;
  commission_rate_bps: number;
  commission_amount_fen: number;
  status: PartnerCommissionLedgerStatus;
  available_at: string | null;
  settlement_batch_id: string | null;
  blocked_reason: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
  revenue_event?: Pick<
    PlatformRevenueEventRecord,
    "id" | "tenant_id" | "source_type" | "source_id" | "revenue_amount_fen"
  > | null;
};

export type PartnerCommissionLedgerCreateRecordInput = Omit<
  PartnerCommissionLedgerRecord,
  "id" | "created_at" | "updated_at" | "partner" | "revenue_event"
>;

export type PartnerSettlementBatchRecord = {
  id: string;
  batch_no: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  total_amount_fen: number;
  status: PartnerSettlementBatchStatus;
  settlement_method: "manual";
  payment_reference: string | null;
  payment_proof_url: string | null;
  reviewed_by_employee_id: string | null;
  paid_by_employee_id: string | null;
  paid_at: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
  partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
};

export type PartnerSettlementBatchCreateRecordInput = {
  batch_no: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  total_amount_fen: number;
  status: "reviewing";
  settlement_method: "manual";
  reviewed_by_employee_id: string;
  remark: string | null;
};

export type PartnerSettlementItemCreateRecordInput = {
  batch_id: string;
  ledger_id: string;
  revenue_event_id: string;
  amount_fen: number;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type PartnerRevenueTable =
  | "platform_partners"
  | "tenant_partner_bindings"
  | "tenant_credit_orders"
  | "platform_revenue_events"
  | "partner_commission_ledger"
  | "partner_settlement_batches"
  | "partner_settlement_items";

type UntypedClient = {
  from: (table: PartnerRevenueTable) => UntypedTable;
};

const PARTNER_SELECT = [
  "*",
  "level:platform_partner_levels!platform_partners_level_id_fkey(*)",
].join(", ");

const REVENUE_EVENT_SELECT = [
  "*",
  "tenant:tenants!platform_revenue_events_tenant_id_fkey(id, name, slug)",
  "partner:platform_partners!platform_revenue_events_partner_id_fkey(id, name, status)",
  "partner_level:platform_partner_levels!platform_revenue_events_partner_level_id_fkey(id, code, name)",
].join(", ");

const COMMISSION_LEDGER_SELECT = [
  "*",
  "partner:platform_partners!partner_commission_ledger_partner_id_fkey(id, name, status)",
  "revenue_event:platform_revenue_events!partner_commission_ledger_revenue_event_id_fkey(id, tenant_id, source_type, source_id, revenue_amount_fen)",
].join(", ");

const SETTLEMENT_BATCH_SELECT = [
  "*",
  "partner:platform_partners!partner_settlement_batches_partner_id_fkey(id, name, status)",
].join(", ");

class PlatformPartnerRevenueRepository {
  private from(table: PartnerRevenueTable) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async listRevenueEvents(input: {
    page: number;
    pageSize: number;
    partner_id?: string;
    tenant_id?: string;
    revenue_type?: PlatformPartnerRevenueType;
    status?: PlatformRevenueEventStatus;
    keyword?: string;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("platform_revenue_events")
      .select(REVENUE_EVENT_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.partner_id) request = request.eq("partner_id", input.partner_id);
    if (input.tenant_id) request = request.eq("tenant_id", input.tenant_id);
    if (input.revenue_type) {
      request = request.eq("revenue_type", input.revenue_type);
    }
    if (input.status) request = request.eq("status", input.status);
    if (input.keyword) {
      const escaped = input.keyword.replaceAll(",", "\\,");
      request = request.or(
        `source_id.ilike.%${escaped}%,source_type.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await request;
    if (error) throw Errors.dbError("查询平台收入事件失败", error);

    return this.buildPage<PlatformRevenueEventRecord>(
      data,
      count,
      input.page,
      input.pageSize,
    );
  }

  async listCommissionLedgers(input: {
    page: number;
    pageSize: number;
    partner_id?: string;
    revenue_type?: PlatformPartnerRevenueType;
    status?: PartnerCommissionLedgerStatus;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("partner_commission_ledger")
      .select(COMMISSION_LEDGER_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.partner_id) request = request.eq("partner_id", input.partner_id);
    if (input.revenue_type) {
      request = request.eq("revenue_type", input.revenue_type);
    }
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

  async listSettlementBatches(input: {
    page: number;
    pageSize: number;
    partner_id?: string;
    status?: PartnerSettlementBatchStatus;
  }) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let request = this.from("partner_settlement_batches")
      .select(SETTLEMENT_BATCH_SELECT, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (input.partner_id) request = request.eq("partner_id", input.partner_id);
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

  async findActiveTenantBinding(tenantId: string) {
    const { data, error } = await this.from("tenant_partner_bindings")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw Errors.dbError("查询装企合伙人绑定失败", error);
    return (data as TenantPartnerBindingRecord | null) ?? null;
  }

  async findPartnerById(partnerId: string) {
    const { data, error } = await this.from("platform_partners")
      .select(PARTNER_SELECT)
      .eq("id", partnerId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询城市合伙人失败", error);
    return (data as PlatformPartnerRecord | null) ?? null;
  }

  async findPaidRechargeOrdersWithoutRevenue(input: { pageSize: number }) {
    const { data, error } = await this.from("tenant_credit_orders")
      .select("*")
      .eq("channel", "wechat_pay")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(input.pageSize);

    if (error) throw Errors.dbError("查询待同步充值订单失败", error);

    const orders = (data ?? []) as TenantCreditOrderRecord[];
    if (orders.length === 0) return [];

    const orderIds = orders.map((order) => order.id);
    const { data: existingEvents, error: existingError } = await this.from(
      "platform_revenue_events",
    )
      .select("source_id")
      .eq("revenue_type", "tenant_recharge")
      .eq("source_type", "tenant_credit_order")
      .in("source_id", orderIds);

    if (existingError) {
      throw Errors.dbError("查询已同步充值收入事件失败", existingError);
    }

    const syncedSourceIds = new Set(
      ((existingEvents ?? []) as Array<{ source_id: string }>).map((item) =>
        item.source_id
      ),
    );
    return orders.filter((order) => !syncedSourceIds.has(order.id));
  }

  async createRevenueEvent(input: PlatformRevenueEventCreateRecordInput) {
    const { data, error } = await this.from("platform_revenue_events")
      .insert(input)
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建平台收入事件失败", error);
    return data as PlatformRevenueEventRecord;
  }

  async createCommissionLedger(input: PartnerCommissionLedgerCreateRecordInput) {
    const { data, error } = await this.from("partner_commission_ledger")
      .insert(input)
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建合伙人分佣台账失败", error);
    return data as PartnerCommissionLedgerRecord;
  }

  async findCommissionLedgersByIds(ledgerIds: string[]) {
    if (ledgerIds.length === 0) return [];

    const { data, error } = await this.from("partner_commission_ledger")
      .select("*")
      .in("id", ledgerIds);

    if (error) throw Errors.dbError("查询合伙人分佣台账失败", error);
    return (data ?? []) as PartnerCommissionLedgerRecord[];
  }

  async createSettlementBatch(input: PartnerSettlementBatchCreateRecordInput) {
    const { data, error } = await this.from("partner_settlement_batches")
      .insert(input)
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建合伙人结算批次失败", error);
    return data as PartnerSettlementBatchRecord;
  }

  async createSettlementItems(input: PartnerSettlementItemCreateRecordInput[]) {
    if (input.length === 0) return [];

    const { data, error } = await this.from("partner_settlement_items")
      .insert(input)
      .select("*");

    if (error) throw Errors.dbError("创建合伙人结算明细失败", error);
    return (data ?? []) as PartnerSettlementItemCreateRecordInput[];
  }

  async markLedgersSettling(input: {
    ledgerIds: string[];
    settlement_batch_id: string;
  }) {
    if (input.ledgerIds.length === 0) return;

    const { error } = await this.from("partner_commission_ledger")
      .update({
        status: "settling",
        settlement_batch_id: input.settlement_batch_id,
      })
      .in("id", input.ledgerIds);

    if (error) throw Errors.dbError("更新分佣台账结算状态失败", error);
  }

  async findSettlementBatchById(batchId: string) {
    const { data, error } = await this.from("partner_settlement_batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询合伙人结算批次失败", error);
    return (data as PartnerSettlementBatchRecord | null) ?? null;
  }

  async markSettlementBatchPaid(input: {
    batchId: string;
    payment_reference: string;
    payment_proof_url?: string;
    paid_at: string;
    paid_by_employee_id: string;
    remark?: string;
  }) {
    const { data, error } = await this.from("partner_settlement_batches")
      .update({
        status: "paid",
        payment_reference: input.payment_reference,
        payment_proof_url: input.payment_proof_url ?? null,
        paid_at: input.paid_at,
        paid_by_employee_id: input.paid_by_employee_id,
        remark: input.remark ?? null,
      })
      .eq("id", input.batchId)
      .select("*")
      .single();

    if (error) throw Errors.dbError("标记合伙人结算批次已打款失败", error);
    return data as PartnerSettlementBatchRecord;
  }

  async markSettlementLedgersPaid(batchId: string) {
    const { error } = await this.from("partner_commission_ledger")
      .update({ status: "settled" })
      .eq("settlement_batch_id", batchId);

    if (error) throw Errors.dbError("标记分佣台账已结算失败", error);
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

export const platformPartnerRevenueRepository =
  new PlatformPartnerRevenueRepository();
