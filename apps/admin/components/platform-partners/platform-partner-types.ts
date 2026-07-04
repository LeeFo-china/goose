import type { PlatformListPagination } from "@/components/platform/platform-list-shell";

export type PlatformPartnerStatus =
  | "pending"
  | "active"
  | "suspended"
  | "terminated";

export type PlatformPartnerLevel = {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
  tenant_recharge_commission_bps: number;
  lead_service_fee_commission_bps: number;
  lead_service_fee_default_rate_bps: number;
  settlement_cycle: "monthly";
  settlement_method: "manual";
  sort_order: number;
};

export type PlatformPartnerRecord = {
  id: string;
  name: string;
  subject_type: "personal" | "individual_business" | "company";
  contact_name: string;
  phone: string;
  status: PlatformPartnerStatus;
  level_id: string;
  region_codes: string[];
  contract_status: string;
  settlement_account_status: string;
  settlement_account: Record<string, unknown>;
  remark: string | null;
  created_at: string;
  updated_at: string;
  level?: PlatformPartnerLevel | null;
};

export type TenantPartnerBindingRecord = {
  id: string;
  tenant_id: string;
  partner_id: string;
  invite_code_id: string | null;
  source_type: "invite_code" | "manual" | "lead_source";
  source_id: string | null;
  status: "active" | "pending_transfer" | "ended";
  bound_at: string;
  unbound_at: string | null;
  change_reason: string | null;
  partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
  tenant?: { id: string; name: string | null; slug: string | null } | null;
};

export type PlatformRevenueEventRecord = {
  id: string;
  revenue_type: "tenant_recharge" | "lead_service_fee";
  tenant_id: string;
  partner_id: string | null;
  source_type: string;
  source_id: string;
  gross_amount_fen: number;
  revenue_amount_fen: number;
  paid_amount_fen: number;
  service_fee_rate_bps: number | null;
  commission_rate_bps: number;
  status: "pending" | "confirmed" | "refunded" | "reversed" | "blocked";
  confirmed_at: string | null;
  paid_at: string | null;
  created_at: string;
  tenant?: { id: string; name: string | null; slug: string | null } | null;
  partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
  partner_level?: Pick<PlatformPartnerLevel, "id" | "code" | "name"> | null;
};

export type PartnerCommissionLedgerRecord = {
  id: string;
  partner_id: string;
  revenue_event_id: string;
  revenue_type: "tenant_recharge" | "lead_service_fee";
  base_amount_fen: number;
  commission_rate_bps: number;
  commission_amount_fen: number;
  status:
    | "pending"
    | "blocked"
    | "available"
    | "settling"
    | "settled"
    | "failed"
    | "reversed";
  available_at: string | null;
  settlement_batch_id: string | null;
  created_at: string;
  partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
};

export type PartnerSettlementBatchRecord = {
  id: string;
  batch_no: string;
  partner_id: string;
  period_start: string;
  period_end: string;
  total_amount_fen: number;
  status: "draft" | "reviewing" | "paid" | "canceled";
  settlement_method: "manual";
  payment_reference: string | null;
  payment_proof_url: string | null;
  reviewed_by_employee_id: string | null;
  paid_by_employee_id: string | null;
  paid_at: string | null;
  remark: string | null;
  created_at: string;
  partner?: Pick<PlatformPartnerRecord, "id" | "name" | "status"> | null;
};

export type PlatformTenantOption = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

export type ListData<T> = {
  list: T[];
  pagination: PlatformListPagination;
};

export const partnerStatusOptions = [
  { value: "pending", label: "待审核" },
  { value: "active", label: "启用" },
  { value: "suspended", label: "暂停" },
  { value: "terminated", label: "终止" },
] as const;

export const revenueTypeOptions = [
  { value: "tenant_recharge", label: "租户充值" },
  { value: "lead_service_fee", label: "线索服务费" },
] as const;

export const revenueStatusOptions = [
  { value: "pending", label: "待确认" },
  { value: "confirmed", label: "已确认" },
  { value: "refunded", label: "已退款" },
  { value: "reversed", label: "已冲销" },
  { value: "blocked", label: "已冻结" },
] as const;

export const commissionStatusOptions = [
  { value: "pending", label: "待入账" },
  { value: "blocked", label: "冻结" },
  { value: "available", label: "可结算" },
  { value: "settling", label: "结算中" },
  { value: "settled", label: "已结算" },
  { value: "failed", label: "结算失败" },
  { value: "reversed", label: "已冲销" },
] as const;

export const settlementStatusOptions = [
  { value: "draft", label: "草稿" },
  { value: "reviewing", label: "待打款" },
  { value: "paid", label: "已打款" },
  { value: "canceled", label: "已取消" },
] as const;

export function optionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
) {
  return options.find((option) => option.value === value)?.label ?? value ?? "-";
}
