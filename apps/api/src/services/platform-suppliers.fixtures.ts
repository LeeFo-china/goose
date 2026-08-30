export const SUPPLIER_ID = "00000000-0000-4000-8000-000000000101";
export const QUALIFICATION_ID = "00000000-0000-4000-8000-000000000201";
export const TYPE_ID = "00000000-0000-4000-8000-000000000202";
export const TENANT_ID = "00000000-0000-4000-8000-000000000301";
export const USER_ID = "00000000-0000-4000-8000-000000000401";
export const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000402";
const NOW = "2026-07-24T00:00:00.000Z";

export function emptyPage(page: number, pageSize: number) {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

export function pageOf<T>(list: T[], page: number, pageSize: number) {
  return {
    list,
    pagination: { page, pageSize, total: list.length, totalPages: 1 },
  };
}

export const supplier = {
  id: SUPPLIER_ID,
  code: "SUP-001",
  name: "晴天建材",
  legal_name: "晴天建材有限公司",
  unified_social_credit_code: null,
  supplier_type: "manufacturer" as const,
  onboarding_status: "pending_review" as const,
  operational_status: "active" as const,
  review_remark: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  blacklisted_by_employee_id: null,
  blacklisted_at: null,
  blacklist_reason: null,
  version: 2,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
};

export function mutationSupplier(action: string) {
  return {
    ...supplier,
    onboarding_status: action === "approve"
      ? "approved" as const
      : supplier.onboarding_status,
    operational_status: action === "blacklist"
      ? "blacklisted" as const
      : supplier.operational_status,
    version: 3,
  };
}

export const qualificationType = {
  id: TYPE_ID,
  code: "business_license",
  name: "营业执照",
  applicable_supplier_types: ["manufacturer"] as const,
  warning_days: 30,
  is_required: true,
  blocks_new_orders: true,
  status: "active" as const,
  sort_order: 10,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};

export const qualification = {
  id: QUALIFICATION_ID,
  supplier_id: SUPPLIER_ID,
  qualification_type_id: TYPE_ID,
  verification_status: "pending" as const,
  valid_from: "2026-01-01",
  valid_until: "2099-12-31",
  version: 1,
};

export const serviceRegion = {
  id: "00000000-0000-4000-8000-000000000501",
  supplier_id: SUPPLIER_ID,
  region_code: "411502",
  region_level: "district" as const,
  status: "active" as const,
  version: 1,
};

export const address = {
  id: QUALIFICATION_ID,
  supplier_id: SUPPLIER_ID,
  status: "active" as const,
};

export const contact = {
  id: QUALIFICATION_ID,
  supplier_id: SUPPLIER_ID,
  name: "张三",
};

export const settings = {
  tenant_id: TENANT_ID,
  module_enabled: false,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  purchase_batch_workflow_enabled: false,
  enabled_by_employee_id: null,
  enabled_at: null,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};

export const createRequest = {
  supplierId: SUPPLIER_ID,
  input: {
    code: "SUP-001",
    name: "晴天建材",
    legal_name: "晴天建材有限公司",
    supplier_type: "manufacturer" as const,
  },
  idempotencyKey: "replay-1",
};

export const settingsRequest = {
  tenantId: TENANT_ID,
  module_enabled: true,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  purchase_batch_workflow_enabled: false,
  expected_version: 1,
  idempotencyKey: "replay-1",
};
