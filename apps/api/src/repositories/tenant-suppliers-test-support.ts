import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

export const TENANT_ID = "00000000-0000-4000-8000-000000000101";
export const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000102";
export const TENANT_SUPPLIER_ID = "00000000-0000-4000-8000-000000000201";
export const SUPPLIER_ID = "00000000-0000-4000-8000-000000000301";
export const CONTRACT_ID = "00000000-0000-4000-8000-000000000401";
export const USER_ID = "00000000-0000-4000-8000-000000000501";
export const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000601";
export const FILE_ID = "00000000-0000-4000-8000-000000000701";
export const ALLOCATION_ID = "00000000-0000-4000-8000-000000000901";
export const NOW = "2026-07-24T00:00:00.000Z";

type StubResponse = { body: unknown; count?: number; status?: number };

export async function createRepository(
  responder: (request: Request) => StubResponse,
) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    const response = responder(request);
    const rowCount = Array.isArray(response.body) ? response.body.length : 1;
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...(response.count === undefined
          ? {}
          : { "content-range": `0-${Math.max(0, rowCount - 1)}/${response.count}` }),
      },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { TenantSuppliersRepository } = await import("./tenant-suppliers");
  return {
    repository: new TenantSuppliersRepository(() => client as never),
    requests,
  };
}

export const supplier = {
  id: SUPPLIER_ID,
  code: "SUP-001",
  name: "晴天建材",
  legal_name: "晴天建材有限公司",
  supplier_type: "manufacturer",
  onboarding_status: "approved",
  operational_status: "active",
  ownership_scope: "platform",
  owner_tenant_id: null,
  version: 4,
} as const;
export const directorySupplier = supplier;
export const relationship = {
  id: TENANT_SUPPLIER_ID,
  tenant_id: TENANT_ID,
  supplier_id: SUPPLIER_ID,
  relationship_status: "active",
  internal_supplier_code: "LOCAL-001",
  settlement_term_days: 30,
  credit_limit_minor: 100000,
  invoice_required_before_payment: true,
  default_currency: "CNY",
  default_tax_inclusive: true,
  tenant_owner_employee_id: EMPLOYEE_ID,
  started_at: "2026-07-01",
  ended_at: null,
  remark: null,
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
  supplier,
} as const;
const privateSupplier = {
  id: SUPPLIER_ID,
  blacklist_reason: null,
  blacklisted_at: null,
  blacklisted_by_employee_id: null,
  code: "SUP-000001",
  created_at: NOW,
  created_by_employee_id: EMPLOYEE_ID,
  legal_name: "晴天私有建材有限公司",
  legal_representative_name: null,
  name: "晴天私有建材",
  onboarding_status: "approved",
  operational_status: "active",
  owner_tenant_id: TENANT_ID,
  ownership_scope: "tenant",
  registered_address_text: null,
  review_remark: null,
  reviewed_at: null,
  reviewed_by_employee_id: null,
  supplier_type: "manufacturer",
  unified_social_credit_code: "91410000PRIVATE",
  updated_at: NOW,
  updated_by_employee_id: EMPLOYEE_ID,
  version: 1,
} as const;
const primaryContact = {
  id: "00000000-0000-4000-8000-000000000902",
  supplier_id: SUPPLIER_ID,
  contact_type: "primary",
  name: "张三",
  phone: "13800000000",
  email: "zhangsan@example.com",
  is_public: false,
  is_primary: true,
  status: "active",
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
} as const;
const supplierAddress = {
  id: "00000000-0000-4000-8000-000000000903",
  supplier_id: SUPPLIER_ID,
  address_type: "registered",
  province: "河南省",
  city: "郑州市",
  district: "金水区",
  region_code: "410105",
  address_detail: "测试路 1 号",
  latitude: null,
  longitude: null,
  is_default: true,
  status: "active",
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
} as const;
export const privateRelationship = {
  ...relationship,
  relationship_status: "evaluating",
  internal_supplier_code: "SUP-000001",
  supplier: privateSupplier,
  primary_contact: primaryContact,
  address: supplierAddress,
} as const;
export const contract = {
  id: CONTRACT_ID,
  tenant_id: TENANT_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  contract_no: "HT-001",
  name: "年度采购合同",
  lifecycle_status: "active",
  valid_from: "2026-01-01",
  valid_until: "2026-12-31",
  settlement_term_days: 30,
  invoice_required_before_payment: true,
  document_file_id: FILE_ID,
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
} as const;
export const event = {
  id: "00000000-0000-4000-8000-000000000801",
  tenant_id: TENANT_ID,
  resource_type: "tenant_supplier",
  resource_id: TENANT_SUPPLIER_ID,
  command: "mutate_tenant_supplier:activate",
  from_state: {},
  to_state: {},
  reason: null,
  actor_user_id: USER_ID,
  actor_employee_id: EMPLOYEE_ID,
  idempotency_key: "activate-1",
  result_version: 1,
  created_at: NOW,
};
export const settings = {
  tenant_id: TENANT_ID,
  module_enabled: true,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  purchase_batch_workflow_enabled: false,
  enabled_by_employee_id: EMPLOYEE_ID,
  enabled_at: NOW,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};
export const eligibility = {
  eligible: true,
  blocking_reasons: [],
  checked_at: NOW,
  tenant_id: TENANT_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  supplier_id: SUPPLIER_ID,
  supplier_version: 4,
  tenant_supplier_version: 1,
};
