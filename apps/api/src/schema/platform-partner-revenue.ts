import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const PlatformPartnerRevenueTypeSchema = z.enum([
  "tenant_recharge",
  "lead_service_fee",
]);

export const PlatformRevenueEventStatusSchema = z.enum([
  "pending",
  "confirmed",
  "refunded",
  "reversed",
  "blocked",
]);

export const PartnerCommissionLedgerStatusSchema = z.enum([
  "pending",
  "blocked",
  "available",
  "settling",
  "settled",
  "failed",
  "reversed",
]);

export const PartnerSettlementBatchStatusSchema = z.enum([
  "draft",
  "reviewing",
  "paid",
  "canceled",
]);

export const PlatformRevenueEventListQuerySchema =
  PaginationQuerySchema.extend({
    partner_id: z.uuid("无效的合伙人 ID").optional(),
    tenant_id: z.uuid("无效的租户 ID").optional(),
    revenue_type: PlatformPartnerRevenueTypeSchema.optional(),
    status: PlatformRevenueEventStatusSchema.optional(),
    keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
  });

export const PartnerCommissionLedgerListQuerySchema =
  PaginationQuerySchema.extend({
    partner_id: z.uuid("无效的合伙人 ID").optional(),
    revenue_type: PlatformPartnerRevenueTypeSchema.optional(),
    status: PartnerCommissionLedgerStatusSchema.optional(),
  });

export const PartnerSettlementBatchListQuerySchema =
  PaginationQuerySchema.extend({
    partner_id: z.uuid("无效的合伙人 ID").optional(),
    status: PartnerSettlementBatchStatusSchema.optional(),
  });

export const LeadServiceFeeRevenueCreateSchema = z.object({
  platform_lead_id: z.uuid("无效的平台线索 ID"),
  tenant_id: z.uuid("无效的租户 ID"),
  customer_id: z.uuid("无效的客户 ID").optional(),
  project_id: z.uuid("无效的项目 ID").optional(),
  contract_amount_fen: z.coerce.number().int().min(1, "成交金额必须大于 0"),
  service_fee_rate_bps: z.coerce.number().int().min(0).max(10000).optional(),
  paid_amount_fen: z.coerce.number().int().min(0).default(0),
  paid_at: z.string().datetime("支付时间格式无效").optional(),
  evidence_urls: z.array(z.string().url("凭证链接格式无效")).max(20).default([]),
  remark: z.string().trim().max(500).optional(),
}).strict();

export const RechargeRevenueSyncSchema = z.object({
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
}).strict();

export const PartnerSettlementBatchCreateSchema = z.object({
  partner_id: z.uuid("无效的合伙人 ID"),
  period_start: z.iso.date("结算周期开始日期格式无效"),
  period_end: z.iso.date("结算周期结束日期格式无效"),
  ledger_ids: z.array(z.uuid("无效的分佣台账 ID")).min(1, "请选择分佣台账"),
  remark: z.string().trim().max(500).optional(),
}).strict();

export const PartnerSettlementBatchParamSchema = z.object({
  id: z.uuid("无效的结算批次 ID"),
});

export const PartnerSettlementBatchMarkPaidSchema = z.object({
  payment_reference: z.string().trim().min(1, "付款流水号不能为空").max(120),
  payment_proof_url: z.string().url("付款凭证链接格式无效").optional(),
  paid_at: z.string().datetime("打款时间格式无效"),
  remark: z.string().trim().max(500).optional(),
}).strict();

export type PlatformRevenueEventListQuery =
  z.infer<typeof PlatformRevenueEventListQuerySchema>;
export type PartnerCommissionLedgerListQuery =
  z.infer<typeof PartnerCommissionLedgerListQuerySchema>;
export type PartnerSettlementBatchListQuery =
  z.infer<typeof PartnerSettlementBatchListQuerySchema>;
export type LeadServiceFeeRevenueCreateInput =
  z.infer<typeof LeadServiceFeeRevenueCreateSchema>;
export type RechargeRevenueSyncInput =
  z.infer<typeof RechargeRevenueSyncSchema>;
export type PartnerSettlementBatchCreateInput =
  z.infer<typeof PartnerSettlementBatchCreateSchema>;
export type PartnerSettlementBatchMarkPaidInput =
  z.infer<typeof PartnerSettlementBatchMarkPaidSchema>;
