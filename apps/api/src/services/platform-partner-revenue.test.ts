import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import type {
  PlatformPartnerLevelRecord,
  PlatformPartnerRecord,
  TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";
import type {
  PartnerCommissionLedgerRecord,
  PartnerSettlementBatchRecord,
  PlatformRevenueEventRecord,
} from "@/repositories/platform-partner-revenue";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const platformAuthContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [
    { code: "platform.partner.revenue.read", scope: "all" },
    { code: "platform.partner.revenue.manage", scope: "all" },
    { code: "platform.partner.commission.read", scope: "all" },
    { code: "platform.partner.settlement.manage", scope: "all" },
  ],
} satisfies AuthContext;

const authWithoutEmployee = {
  ...platformAuthContext,
  employeeId: null,
} satisfies AuthContext;

const level = {
  id: "00000000-0000-4000-8000-000000000101",
  code: "city_partner",
  name: "城市合伙人",
  status: "active",
  tenant_recharge_commission_bps: 1500,
  lead_service_fee_commission_bps: 3500,
  lead_service_fee_default_rate_bps: 250,
  settlement_cycle: "monthly",
  settlement_method: "manual",
  requirements: {},
  sort_order: 20,
  version: 1,
  effective_at: "2026-07-04T10:00:00.000Z",
  expired_at: null,
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies PlatformPartnerLevelRecord;

const partner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "信阳城市合伙人",
  subject_type: "company",
  contact_name: "张三",
  phone: "13800138000",
  status: "active",
  level_id: level.id,
  region_codes: ["411500"],
  contract_status: "signed",
  settlement_account_status: "valid",
  settlement_account: {},
  remark: null,
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
  level,
} satisfies PlatformPartnerRecord;

const activeBinding = {
  id: "00000000-0000-4000-8000-000000000301",
  tenant_id: "00000000-0000-4000-8000-000000000501",
  partner_id: partner.id,
  invite_code_id: null,
  source_type: "invite_code",
  source_id: "00000000-0000-4000-8000-000000000401",
  status: "active",
  bound_at: "2026-07-04T10:00:00.000Z",
  unbound_at: null,
  changed_by_employee_id: "employee-platform",
  change_reason: "扫码入驻",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies TenantPartnerBindingRecord;

const leadRevenueEvent = {
  id: "00000000-0000-4000-8000-000000000601",
  revenue_type: "lead_service_fee",
  tenant_id: activeBinding.tenant_id,
  partner_id: partner.id,
  partner_level_id: level.id,
  binding_id: activeBinding.id,
  source_type: "platform_lead",
  source_id: "00000000-0000-4000-8000-000000000701",
  gross_amount_fen: 2_000_000,
  revenue_amount_fen: 50_000,
  paid_amount_fen: 50_000,
  service_fee_rate_bps: 250,
  commission_rate_bps: 3500,
  status: "confirmed",
  confirmed_at: "2026-07-04T11:00:00.000Z",
  paid_at: "2026-07-04T11:00:00.000Z",
  refundable_until: null,
  metadata: {},
  created_by_employee_id: "employee-platform",
  created_at: "2026-07-04T11:00:00.000Z",
  updated_at: "2026-07-04T11:00:00.000Z",
} satisfies PlatformRevenueEventRecord;

const commissionLedger = {
  id: "00000000-0000-4000-8000-000000000801",
  partner_id: partner.id,
  revenue_event_id: leadRevenueEvent.id,
  revenue_type: "lead_service_fee",
  base_amount_fen: 50_000,
  commission_rate_bps: 3500,
  commission_amount_fen: 17_500,
  status: "available",
  available_at: "2026-07-04T11:00:00.000Z",
  settlement_batch_id: null,
  blocked_reason: null,
  failure_reason: null,
  created_at: "2026-07-04T11:00:00.000Z",
  updated_at: "2026-07-04T11:00:00.000Z",
} satisfies PartnerCommissionLedgerRecord;

const paidRechargeOrder = {
  id: "00000000-0000-4000-8000-000000000901",
  tenant_id: activeBinding.tenant_id,
  order_no: "CR202607040001",
  idempotency_key: null,
  package_code: "credit_3000",
  credits: 3000,
  amount_fen: 30_000,
  bonus_credits: 300,
  channel: "wechat_pay",
  status: "paid",
  paid_at: "2026-07-04T12:00:00.000Z",
  created_by: "employee-platform",
  remark: null,
  metadata: {},
  payment_config_id: null,
  out_trade_no: "wx-out-trade-no",
  prepay_id: null,
  transaction_id: "wx-transaction-id",
  paid_amount_fen: 30_000,
  closed_at: null,
  latest_notification_id: null,
  created_at: "2026-07-04T11:50:00.000Z",
  updated_at: "2026-07-04T12:00:00.000Z",
} satisfies TenantCreditOrderRecord;

const settlementBatch = {
  id: "00000000-0000-4000-8000-000000000a01",
  batch_no: "PS2026070001",
  partner_id: partner.id,
  period_start: "2026-07-01",
  period_end: "2026-07-31",
  total_amount_fen: 17_500,
  status: "reviewing",
  settlement_method: "manual",
  payment_reference: null,
  payment_proof_url: null,
  reviewed_by_employee_id: "employee-platform",
  paid_by_employee_id: null,
  paid_at: null,
  remark: null,
  created_at: "2026-07-04T11:00:00.000Z",
  updated_at: "2026-07-04T11:00:00.000Z",
} satisfies PartnerSettlementBatchRecord;

const repository = {
  listRevenueEvents: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  listCommissionLedgers: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  listSettlementBatches: mock(async () => ({
    list: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  findActiveTenantBinding: mock(async () => activeBinding),
  findPartnerById: mock(async () => partner),
  findPaidRechargeOrdersWithoutRevenue: mock(async () => [paidRechargeOrder]),
  createRevenueEvent: mock(async () => leadRevenueEvent),
  createCommissionLedger: mock(async () => commissionLedger),
  findCommissionLedgersByIds: mock(async () => [commissionLedger]),
  createSettlementBatch: mock(async () => settlementBatch),
  createSettlementItems: mock(async () => []),
  markLedgersSettling: mock(async () => undefined),
  findSettlementBatchById: mock(async () => settlementBatch),
  markSettlementBatchPaid: mock(async () => ({
    ...settlementBatch,
    status: "paid",
    payment_reference: "WX-BANK-202607",
    paid_by_employee_id: "employee-platform",
    paid_at: "2026-07-31T12:00:00.000Z",
  } satisfies PartnerSettlementBatchRecord)),
  markSettlementLedgersPaid: mock(async () => undefined),
};

async function createService() {
  const { PlatformPartnerRevenueService } = await import(
    "./platform-partner-revenue"
  );
  return new PlatformPartnerRevenueService({ repository });
}

describe("PlatformPartnerRevenueService", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
    repository.findActiveTenantBinding.mockImplementation(async () => activeBinding);
    repository.findPartnerById.mockImplementation(async () => partner);
    repository.findPaidRechargeOrdersWithoutRevenue.mockImplementation(async () => [
      paidRechargeOrder,
    ]);
    repository.findCommissionLedgersByIds.mockImplementation(async () => [
      commissionLedger,
    ]);
  });

  test("uses default 2.5% lead service fee and partner level commission", async () => {
    const service = await createService();

    await service.createLeadServiceFeeRevenue(platformAuthContext, {
      platform_lead_id: leadRevenueEvent.source_id,
      tenant_id: activeBinding.tenant_id,
      contract_amount_fen: 2_000_000,
      paid_amount_fen: 50_000,
      paid_at: "2026-07-04T11:00:00.000Z",
      evidence_urls: [],
    });

    expect(repository.createRevenueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        revenue_type: "lead_service_fee",
        source_type: "platform_lead",
        source_id: leadRevenueEvent.source_id,
        gross_amount_fen: 2_000_000,
        revenue_amount_fen: 50_000,
        paid_amount_fen: 50_000,
        service_fee_rate_bps: 250,
        commission_rate_bps: 3500,
        status: "confirmed",
      }),
    );
    expect(repository.createCommissionLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        partner_id: partner.id,
        revenue_type: "lead_service_fee",
        base_amount_fen: 50_000,
        commission_rate_bps: 3500,
        commission_amount_fen: 17_500,
        status: "available",
      }),
    );
  });

  test("syncs paid recharge orders as platform revenue only once per source event", async () => {
    const service = await createService();

    const result = await service.syncRechargeRevenueEvents(platformAuthContext, {
      pageSize: 100,
    });

    expect(result).toEqual({
      scanned_count: 1,
      synced_count: 1,
      skipped_count: 0,
    });
    expect(repository.findPaidRechargeOrdersWithoutRevenue).toHaveBeenCalledWith({
      pageSize: 100,
    });
    expect(repository.createRevenueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        revenue_type: "tenant_recharge",
        source_type: "tenant_credit_order",
        source_id: paidRechargeOrder.id,
        gross_amount_fen: 30_000,
        revenue_amount_fen: 30_000,
        paid_amount_fen: 30_000,
        commission_rate_bps: 1500,
        status: "confirmed",
      }),
    );
    expect(repository.createCommissionLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        revenue_type: "tenant_recharge",
        base_amount_fen: 30_000,
        commission_rate_bps: 1500,
        commission_amount_fen: 4_500,
        status: "available",
      }),
    );
  });

  test("rejects monthly settlement batch when ledgers belong to multiple partners", async () => {
    repository.findCommissionLedgersByIds.mockImplementationOnce(async () => [
      commissionLedger,
      {
        ...commissionLedger,
        id: "00000000-0000-4000-8000-000000000802",
        partner_id: "00000000-0000-4000-8000-000000000202",
      },
    ]);
    const service = await createService();

    await expect(
      service.createMonthlySettlementBatch(platformAuthContext, {
        partner_id: partner.id,
        period_start: "2026-07-01",
        period_end: "2026-07-31",
        ledger_ids: [
          commissionLedger.id,
          "00000000-0000-4000-8000-000000000802",
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.createSettlementBatch).not.toHaveBeenCalled();
  });

  test("requires platform employee when marking manual settlement as paid", async () => {
    const service = await createService();

    await expect(
      service.markSettlementPaid(authWithoutEmployee, {
        batchId: "00000000-0000-4000-8000-000000000a01",
        payment_reference: "WX-BANK-202607",
        paid_at: "2026-07-31T12:00:00.000Z",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.markSettlementBatchPaid).not.toHaveBeenCalled();
  });
});
