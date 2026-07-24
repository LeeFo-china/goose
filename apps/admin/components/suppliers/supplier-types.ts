import type {
  SupplierContractLifecycleStatus,
  SupplierOnboardingStatus,
  SupplierOperationalStatus,
  SupplierOrderBlockingReason,
  SupplierType,
  TenantSupplierRelationshipStatus,
} from "@gooes/domain";

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PageData<RecordType> = {
  list: RecordType[];
  pagination: Pagination;
};

export type TenantSupplierSettings = {
  tenant_id: string;
  module_enabled: boolean;
  require_active_contract_for_new_order: boolean;
  enabled_by_employee_id: string | null;
  enabled_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type SupplierDirectoryItem = {
  id: string;
  code: string;
  name: string;
  legal_name: string;
  supplier_type: SupplierType;
  onboarding_status: SupplierOnboardingStatus;
  operational_status: SupplierOperationalStatus;
  version: number;
};

export type SupplierEligibility = {
  eligible: boolean;
  blocking_reasons: SupplierOrderBlockingReason[];
  checked_at: string;
  tenant_id: string;
  tenant_supplier_id: string;
  supplier_id?: string;
};

export type TenantSupplierRelationship = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  relationship_status: TenantSupplierRelationshipStatus;
  settlement_term_days: number;
  credit_limit_minor: number;
  invoice_required_before_payment: boolean;
  default_currency: string;
  default_tax_inclusive: boolean;
  tenant_owner_employee_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  remark: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  supplier: SupplierDirectoryItem;
  eligibility?: SupplierEligibility;
};

export type SupplierContract = {
  id: string;
  tenant_id: string;
  tenant_supplier_id: string;
  contract_no: string;
  name: string;
  lifecycle_status: SupplierContractLifecycleStatus;
  valid_from: string;
  valid_until: string;
  settlement_term_days: number;
  invoice_required_before_payment: boolean;
  document_file_id: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type SupplierEvent = {
  id: string;
  resource_type: string;
  resource_id: string;
  command: string;
  from_state: Record<string, unknown>;
  to_state: Record<string, unknown>;
  reason: string | null;
  actor_employee_id: string;
  result_version: number;
  created_at: string;
};

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger";

export const relationshipStatusMeta: Record<
  TenantSupplierRelationshipStatus,
  { label: string; variant: BadgeVariant }
> = {
  evaluating: { label: "评估中", variant: "secondary" },
  active: { label: "合作中", variant: "success" },
  suspended: { label: "已暂停", variant: "warning" },
  terminated: { label: "已终止", variant: "secondary" },
  blacklisted: { label: "租户黑名单", variant: "danger" },
};

export const blockingReasonLabel: Record<SupplierOrderBlockingReason, string> = {
  module_disabled: "供应商模块未启用",
  supplier_not_approved: "平台供应商尚未通过准入审核",
  supplier_suspended: "平台供应商已暂停运营",
  supplier_blacklisted: "平台供应商已加入黑名单",
  relationship_not_active: "租户合作关系尚未启用",
  required_qualification_missing: "缺少新订单要求的必填资质",
  required_qualification_expired: "新订单要求的必填资质已过期",
  active_contract_required: "当前策略要求存在生效合同",
};

export const supplierTypeLabel: Record<SupplierType, string> = {
  manufacturer: "生产厂家",
  brand_agent: "品牌代理",
  distributor: "经销商",
  retailer: "零售商",
  other: "其他",
};

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function newIdempotencyKey(scope: string) {
  return `${scope}:${crypto.randomUUID()}`;
}
