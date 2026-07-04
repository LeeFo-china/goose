import { Errors } from "@/errors/error-factory";
import {
  platformPartnerRevenueRepository,
  type PartnerCommissionLedgerCreateRecordInput,
  type PartnerCommissionLedgerRecord,
  type PartnerSettlementBatchCreateRecordInput,
  type PartnerSettlementItemCreateRecordInput,
  type PlatformRevenueEventCreateRecordInput,
} from "@/repositories/platform-partner-revenue";
import type {
  LeadServiceFeeRevenueCreateInput,
  PartnerCommissionLedgerListQuery,
  PartnerSettlementBatchCreateInput,
  PartnerSettlementBatchListQuery,
  PartnerSettlementBatchMarkPaidInput,
  PlatformRevenueEventListQuery,
  RechargeRevenueSyncInput,
} from "@/schema/platform-partner-revenue";
import type { AuthContext } from "@/services/authorization";

type PlatformPartnerRevenueRepositoryPort = Pick<
  typeof platformPartnerRevenueRepository,
  | "listRevenueEvents"
  | "listCommissionLedgers"
  | "listSettlementBatches"
  | "findActiveTenantBinding"
  | "findPartnerById"
  | "findPaidRechargeOrdersWithoutRevenue"
  | "createRevenueEvent"
  | "createCommissionLedger"
  | "findCommissionLedgersByIds"
  | "createSettlementBatch"
  | "createSettlementItems"
  | "markLedgersSettling"
  | "findSettlementBatchById"
  | "markSettlementBatchPaid"
  | "markSettlementLedgersPaid"
>;

type PlatformPartnerRevenueServiceDependencies = {
  repository?: PlatformPartnerRevenueRepositoryPort;
};

const REVENUE_READ_PERMISSION = "platform.partner.revenue.read";
const REVENUE_MANAGE_PERMISSION = "platform.partner.revenue.manage";
const COMMISSION_READ_PERMISSION = "platform.partner.commission.read";
const SETTLEMENT_MANAGE_PERMISSION = "platform.partner.settlement.manage";

export class PlatformPartnerRevenueService {
  private readonly repository: PlatformPartnerRevenueRepositoryPort;

  constructor(dependencies: PlatformPartnerRevenueServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformPartnerRevenueRepository;
  }

  async listRevenueEvents(
    authContext: AuthContext,
    query: PlatformRevenueEventListQuery,
  ) {
    this.assertCanReadRevenue(authContext);
    return this.repository.listRevenueEvents(query);
  }

  async listCommissionLedgers(
    authContext: AuthContext,
    query: PartnerCommissionLedgerListQuery,
  ) {
    this.assertCanReadCommissions(authContext);
    return this.repository.listCommissionLedgers(query);
  }

  async listSettlementBatches(
    authContext: AuthContext,
    query: PartnerSettlementBatchListQuery,
  ) {
    this.assertCanManageSettlements(authContext);
    return this.repository.listSettlementBatches(query);
  }

  async createLeadServiceFeeRevenue(
    authContext: AuthContext,
    input: LeadServiceFeeRevenueCreateInput,
  ) {
    this.assertCanManageRevenue(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const binding = await this.repository.findActiveTenantBinding(
      input.tenant_id,
    );
    if (!binding) {
      throw Errors.badRequest("租户没有有效合伙人绑定");
    }

    const partner = await this.repository.findPartnerById(binding.partner_id);
    if (!partner || partner.status !== "active") {
      throw Errors.badRequest("租户绑定的合伙人不可参与分成");
    }
    if (!partner.level) {
      throw Errors.badRequest("合伙人等级配置缺失");
    }

    const serviceFeeRateBps = input.service_fee_rate_bps ??
      partner.level.lead_service_fee_default_rate_bps;
    const revenueAmountFen = this.calculateBpsAmount(
      input.contract_amount_fen,
      serviceFeeRateBps,
    );
    const paidAmountFen = input.paid_amount_fen ?? 0;
    if (paidAmountFen > revenueAmountFen) {
      throw Errors.badRequest("线索服务费实收金额不能超过应收金额");
    }

    const confirmed = paidAmountFen > 0;
    const confirmedAt = confirmed
      ? input.paid_at ?? new Date().toISOString()
      : null;
    const event = await this.repository.createRevenueEvent({
      revenue_type: "lead_service_fee",
      tenant_id: input.tenant_id,
      partner_id: partner.id,
      partner_level_id: partner.level.id,
      binding_id: binding.id,
      source_type: "platform_lead",
      source_id: input.platform_lead_id,
      gross_amount_fen: input.contract_amount_fen,
      revenue_amount_fen: revenueAmountFen,
      paid_amount_fen: paidAmountFen,
      service_fee_rate_bps: serviceFeeRateBps,
      commission_rate_bps: partner.level.lead_service_fee_commission_bps,
      status: confirmed ? "confirmed" : "pending",
      confirmed_at: confirmedAt,
      paid_at: input.paid_at ?? null,
      refundable_until: null,
      metadata: {
        customer_id: input.customer_id ?? null,
        project_id: input.project_id ?? null,
        evidence_urls: input.evidence_urls ?? [],
        remark: input.remark ?? null,
      },
      created_by_employee_id: employeeId,
    } satisfies PlatformRevenueEventCreateRecordInput);

    const ledger = confirmed
      ? await this.createAvailableCommissionLedger({
        eventId: event.id,
        partnerId: partner.id,
        revenueType: "lead_service_fee",
        baseAmountFen: revenueAmountFen,
        commissionRateBps: partner.level.lead_service_fee_commission_bps,
        availableAt: confirmedAt,
      })
      : null;

    return { event, ledger };
  }

  async syncRechargeRevenueEvents(
    authContext: AuthContext,
    input: RechargeRevenueSyncInput,
  ) {
    this.assertCanManageRevenue(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const orders = await this.repository.findPaidRechargeOrdersWithoutRevenue({
      pageSize: input.pageSize,
    });
    let syncedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      const binding = await this.repository.findActiveTenantBinding(
        order.tenant_id,
      );
      if (!binding) {
        skippedCount += 1;
        continue;
      }

      const partner = await this.repository.findPartnerById(binding.partner_id);
      if (!partner || partner.status !== "active" || !partner.level) {
        skippedCount += 1;
        continue;
      }

      const paidAmountFen = order.paid_amount_fen || order.amount_fen;
      const event = await this.repository.createRevenueEvent({
        revenue_type: "tenant_recharge",
        tenant_id: order.tenant_id,
        partner_id: partner.id,
        partner_level_id: partner.level.id,
        binding_id: binding.id,
        source_type: "tenant_credit_order",
        source_id: order.id,
        gross_amount_fen: paidAmountFen,
        revenue_amount_fen: paidAmountFen,
        paid_amount_fen: paidAmountFen,
        service_fee_rate_bps: null,
        commission_rate_bps: partner.level.tenant_recharge_commission_bps,
        status: "confirmed",
        confirmed_at: order.paid_at ?? new Date().toISOString(),
        paid_at: order.paid_at,
        refundable_until: null,
        metadata: {
          order_no: order.order_no,
          package_code: order.package_code ?? null,
          channel: order.channel,
        },
        created_by_employee_id: employeeId,
      } satisfies PlatformRevenueEventCreateRecordInput);

      await this.createAvailableCommissionLedger({
        eventId: event.id,
        partnerId: partner.id,
        revenueType: "tenant_recharge",
        baseAmountFen: paidAmountFen,
        commissionRateBps: partner.level.tenant_recharge_commission_bps,
        availableAt: event.confirmed_at,
      });
      syncedCount += 1;
    }

    return {
      scanned_count: orders.length,
      synced_count: syncedCount,
      skipped_count: skippedCount,
    };
  }

  async createMonthlySettlementBatch(
    authContext: AuthContext,
    input: PartnerSettlementBatchCreateInput,
  ) {
    this.assertCanManageSettlements(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const ledgerIds = [...new Set(input.ledger_ids)];
    if (ledgerIds.length !== input.ledger_ids.length) {
      throw Errors.badRequest("分佣台账不能重复选择");
    }

    const ledgers = await this.repository.findCommissionLedgersByIds(ledgerIds);
    if (ledgers.length !== ledgerIds.length) {
      throw Errors.badRequest("部分分佣台账不存在");
    }
    if (!ledgers.every((ledger) => ledger.partner_id === input.partner_id)) {
      throw Errors.badRequest("同一结算批次只能包含同一合伙人的分佣台账");
    }
    if (!ledgers.every((ledger) => ledger.status === "available")) {
      throw Errors.badRequest("只有可结算状态的分佣台账可以生成月结批次");
    }

    const totalAmountFen = ledgers.reduce(
      (sum, ledger) => sum + ledger.commission_amount_fen,
      0,
    );
    const batch = await this.repository.createSettlementBatch({
      batch_no: this.buildBatchNo(),
      partner_id: input.partner_id,
      period_start: input.period_start,
      period_end: input.period_end,
      total_amount_fen: totalAmountFen,
      status: "reviewing",
      settlement_method: "manual",
      reviewed_by_employee_id: employeeId,
      remark: input.remark ?? null,
    } satisfies PartnerSettlementBatchCreateRecordInput);

    const items = await this.repository.createSettlementItems(
      ledgers.map((ledger) => ({
        batch_id: batch.id,
        ledger_id: ledger.id,
        revenue_event_id: ledger.revenue_event_id,
        amount_fen: ledger.commission_amount_fen,
      } satisfies PartnerSettlementItemCreateRecordInput)),
    );
    await this.repository.markLedgersSettling({
      ledgerIds,
      settlement_batch_id: batch.id,
    });

    return { batch, items };
  }

  async markSettlementPaid(
    authContext: AuthContext,
    input: PartnerSettlementBatchMarkPaidInput & { batchId: string },
  ) {
    this.assertCanManageSettlements(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const batch = await this.repository.findSettlementBatchById(input.batchId);
    if (!batch) {
      throw Errors.business(
        404,
        "合伙人结算批次不存在",
        "PARTNER_SETTLEMENT_BATCH_NOT_FOUND",
      );
    }
    if (batch.status === "paid") {
      throw Errors.badRequest("结算批次已打款");
    }

    const paidBatch = await this.repository.markSettlementBatchPaid({
      batchId: input.batchId,
      payment_reference: input.payment_reference,
      payment_proof_url: input.payment_proof_url,
      paid_at: input.paid_at,
      paid_by_employee_id: employeeId,
      remark: input.remark,
    });
    await this.repository.markSettlementLedgersPaid(input.batchId);
    return paidBatch;
  }

  private async createAvailableCommissionLedger(input: {
    eventId: string;
    partnerId: string;
    revenueType: "tenant_recharge" | "lead_service_fee";
    baseAmountFen: number;
    commissionRateBps: number;
    availableAt: string | null;
  }) {
    return this.repository.createCommissionLedger({
      partner_id: input.partnerId,
      revenue_event_id: input.eventId,
      revenue_type: input.revenueType,
      base_amount_fen: input.baseAmountFen,
      commission_rate_bps: input.commissionRateBps,
      commission_amount_fen: this.calculateBpsAmount(
        input.baseAmountFen,
        input.commissionRateBps,
      ),
      status: "available",
      available_at: input.availableAt ?? new Date().toISOString(),
      settlement_batch_id: null,
      blocked_reason: null,
      failure_reason: null,
    } satisfies PartnerCommissionLedgerCreateRecordInput);
  }

  private calculateBpsAmount(amountFen: number, rateBps: number) {
    return Math.floor((amountFen * rateBps) / 10000);
  }

  private assertCanReadRevenue(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.hasPermission(authContext, REVENUE_READ_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertCanManageRevenue(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.hasPermission(authContext, REVENUE_MANAGE_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertCanReadCommissions(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.hasPermission(authContext, COMMISSION_READ_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertCanManageSettlements(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.hasPermission(authContext, SETTLEMENT_MANAGE_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private hasPermission(authContext: AuthContext, permissionCode: string) {
    return authContext.permissions.some((permission) =>
      permission.code === permissionCode
    );
  }

  private requireEmployeeId(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private buildBatchNo() {
    const date = new Date();
    const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");
    return `PS${ymd}${date.getTime().toString().slice(-6)}`;
  }
}

export const platformPartnerRevenueService =
  new PlatformPartnerRevenueService();
