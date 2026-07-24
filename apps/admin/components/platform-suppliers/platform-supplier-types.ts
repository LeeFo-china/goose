export type SupplierType =
  | "manufacturer"
  | "brand_agent"
  | "distributor"
  | "retailer"
  | "other";

export type SupplierOnboardingStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected";

export type SupplierOperationalStatus =
  | "active"
  | "suspended"
  | "blacklisted";

export type SupplierQualificationHealth =
  | "valid"
  | "expiring"
  | "expired"
  | "missing";

export type SupplierRecordStatus = "active" | "inactive";
export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger";

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

export type PlatformSupplierListItem = {
  id: string;
  code: string;
  name: string;
  legal_name: string;
  unified_social_credit_code: string | null;
  supplier_type: SupplierType;
  onboarding_status: SupplierOnboardingStatus;
  operational_status: SupplierOperationalStatus;
  qualification_health: SupplierQualificationHealth;
  version: number;
  created_at: string;
  updated_at: string;
};

export type PlatformSupplierDetailRecord = Omit<
  PlatformSupplierListItem,
  "qualification_health"
> & {
  review_remark: string | null;
  reviewed_by_employee_id: string | null;
  reviewed_at: string | null;
  blacklisted_by_employee_id: string | null;
  blacklisted_at: string | null;
  blacklist_reason: string | null;
  created_by_employee_id: string;
  updated_by_employee_id: string;
};

export type SupplierQualificationType = {
  id: string;
  code: string;
  name: string;
  applicable_supplier_types: SupplierType[];
  warning_days: number;
  is_required: boolean;
  blocks_new_orders: boolean;
  status: SupplierRecordStatus;
  sort_order: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type SupplierQualification = {
  id: string;
  supplier_id: string;
  qualification_type_id: string;
  document_file_id: string;
  certificate_no: string | null;
  valid_from: string | null;
  valid_until: string | null;
  verification_status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type SupplierServiceRegion = {
  id: string;
  supplier_id: string;
  region_code: string;
  region_level: "province" | "city" | "district";
  status: SupplierRecordStatus;
  valid_from: string | null;
  valid_until: string | null;
  version: number;
};

export type SupplierContact = {
  id: string;
  supplier_id: string;
  contact_type: "primary" | "sales" | "finance" | "logistics" | "after_sales";
  name: string;
  phone: string | null;
  email: string | null;
  is_public: boolean;
  is_primary: boolean;
  status: SupplierRecordStatus;
  version: number;
};

export type SupplierAddress = {
  id: string;
  supplier_id: string;
  address_type: "registered" | "shipping" | "return" | "other";
  province: string | null;
  city: string | null;
  district: string | null;
  region_code: string;
  address_detail: string;
  is_default: boolean;
  status: SupplierRecordStatus;
  version: number;
};

export type SupplierEvent = {
  id: string;
  command: string;
  from_state: Record<string, unknown>;
  to_state: Record<string, unknown>;
  reason: string | null;
  actor_employee_id: string;
  result_version: number;
  created_at: string;
};

export const supplierTypeOptions: ReadonlyArray<{
  value: SupplierType;
  label: string;
}> = [
  { value: "manufacturer", label: "生产厂家" },
  { value: "brand_agent", label: "品牌代理" },
  { value: "distributor", label: "经销商" },
  { value: "retailer", label: "零售商" },
  { value: "other", label: "其他" },
];

export const supplierTypeLabel = Object.fromEntries(
  supplierTypeOptions.map((item) => [item.value, item.label]),
) as Record<SupplierType, string>;

export const onboardingMeta: Record<
  SupplierOnboardingStatus,
  { label: string; variant: BadgeVariant }
> = {
  draft: { label: "草稿", variant: "secondary" },
  pending_review: { label: "待审核", variant: "warning" },
  approved: { label: "已准入", variant: "success" },
  rejected: { label: "已驳回", variant: "danger" },
};

export const operationalMeta: Record<
  SupplierOperationalStatus,
  { label: string; variant: BadgeVariant }
> = {
  active: { label: "正常", variant: "success" },
  suspended: { label: "已暂停", variant: "warning" },
  blacklisted: { label: "黑名单", variant: "danger" },
};

export const qualificationHealthMeta: Record<
  SupplierQualificationHealth,
  { label: string; variant: BadgeVariant }
> = {
  valid: { label: "有效", variant: "success" },
  expiring: { label: "即将到期", variant: "warning" },
  expired: { label: "已过期", variant: "danger" },
  missing: { label: "缺少必填资质", variant: "danger" },
};

export function formatSupplierDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function newIdempotencyKey(scope: string) {
  return `${scope}:${crypto.randomUUID()}`;
}
