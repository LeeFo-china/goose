import { describe, expect, mock, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

import type { SupplierOrderEligibility } from "@/repositories/tenant-suppliers";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const PARENT_ID = "00000000-0000-4000-8000-000000000201";
const OTHER_PARENT_ID = "00000000-0000-4000-8000-000000000202";
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000301";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000401";
const USER_ID = "00000000-0000-4000-8000-000000000501";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000601";
const NOW = "2026-07-24T00:00:00.000Z";

async function repositoryFor(body: unknown) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { TenantSuppliersRepository } = await import(
    "@/repositories/tenant-suppliers"
  );
  return {
    repository: new TenantSuppliersRepository(() => client as never),
    requests,
  };
}

describe("tenant supplier mutation envelopes", () => {
  test("rejects the legacy bare relationship and accepts the enriched envelope", async () => {
    const legacy = await repositoryFor({
      status: "created",
      idempotent: false,
      tenant_supplier: relationship,
      version: 1,
    });
    await expect(legacy.repository.createRelationship(createCommand))
      .rejects.toMatchObject({ code: "DB_ERROR" });

    const current = await repositoryFor({
      status: "created",
      idempotent: false,
      tenant_supplier: { ...relationship, supplier },
      version: 1,
    });
    await expect(current.repository.createRelationship(createCommand))
      .resolves.toMatchObject({
        tenant_supplier: { id: PARENT_ID, supplier: { id: SUPPLIER_ID } },
      });
  });

  test("passes the URL parent id to atomic contract mutation", async () => {
    const fixture = await repositoryFor({
      status: "updated",
      idempotent: false,
      contract: contract,
      version: 2,
    });
    await fixture.repository.mutateContract({
      tenant_id: TENANT_ID,
      tenant_supplier_id: OTHER_PARENT_ID,
      contract_id: CONTRACT_ID,
      action: "terminate",
      expected_version: 1,
      reason: "结束合作",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "contract-terminate-1",
    });
    expect(await fixture.requests[0]!.clone().json()).toMatchObject({
      p_tenant_id: TENANT_ID,
      p_tenant_supplier_id: OTHER_PARENT_ID,
      p_contract_id: CONTRACT_ID,
    });
  });
});

describe("tenant supplier list contract health", () => {
  test("accepts only the four contract health values", async () => {
    const valid = await repositoryFor({
      items: [{
        ...relationship,
        supplier,
        eligibility,
        contract_health: "valid",
      }],
      total: 1,
      page: 1,
      page_size: 20,
    });
    await expect(valid.repository.listRelationships({
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    })).resolves.toMatchObject({
      list: [{ contract_health: "valid" }],
    });

    const invalid = await repositoryFor({
      items: [{
        ...relationship,
        supplier,
        eligibility,
        contract_health: "warning",
      }],
      total: 1,
      page: 1,
      page_size: 20,
    });
    await expect(invalid.repository.listRelationships({
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });
});

describe("tenant supplier service review boundaries", () => {
  test("purchase assertion preserves module_disabled in the full eligibility reasons", async () => {
    const dependencies = serviceDependencies();
    dependencies.repository.getSettings.mockImplementation(async () => ({
      ...settings,
      module_enabled: false,
    }));
    dependencies.repository.getOrderEligibility.mockImplementation(async () => ({
      ...eligibility,
      eligible: false,
      blocking_reasons: ["module_disabled", "relationship_not_active"],
    }));
    const { TenantSuppliersService } = await import("./tenant-suppliers");
    const service = new TenantSuppliersService(dependencies as never);

    await expect(service.assertCanCreatePurchaseOrder(auth, PARENT_ID))
      .rejects.toMatchObject({
        code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
        details: {
          blocking_reasons: [
            "module_disabled",
            "relationship_not_active",
          ],
        },
      });
    expect(dependencies.repository.getOrderEligibility).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.getSettings).not.toHaveBeenCalled();
    await expect(service.getOrderEligibility(auth, PARENT_ID))
      .rejects.toMatchObject({ code: "SUPPLIER_MODULE_DISABLED" });
  });

  test("maps owner and document trigger failures to the registered state conflict", async () => {
    for (const operation of ["relationship", "contract"] as const) {
      const dependencies = serviceDependencies();
      const failure = {
        code: "DB_ERROR",
        details: { message: "TENANT_SUPPLIER_STATE_CONFLICT" },
      };
      if (operation === "relationship") {
        dependencies.repository.updateRelationship.mockImplementation(
          async () => Promise.reject(failure),
        );
      } else {
        dependencies.repository.updateContract.mockImplementation(
          async () => Promise.reject(failure),
        );
      }
      const { TenantSuppliersService } = await import("./tenant-suppliers");
      const service = new TenantSuppliersService(dependencies as never);
      const request = operation === "relationship"
        ? service.updateRelationship(auth, PARENT_ID, {
          expected_version: 1,
          tenant_owner_employee_id: EMPLOYEE_ID,
        })
        : service.updateContract(auth, PARENT_ID, CONTRACT_ID, {
          expected_version: 1,
          document_file_id: "00000000-0000-4000-8000-000000000701",
        });
      await expect(request).rejects.toMatchObject({
        statusCode: 409,
        code: "TENANT_SUPPLIER_STATE_CONFLICT",
      });
    }
  });
});

function serviceDependencies() {
  return {
    repository: {
      getSettings: mock(async () => settings),
      updateContractPolicy: mock(async () => settings),
      listRelationships: mock(async () => page),
      listDirectory: mock(async () => page),
      findRelationship: mock(async () => ({ ...relationship, supplier })),
      createRelationship: mock(async () => mutation),
      updateRelationship: mock(async () => mutation),
      mutateRelationship: mock(async () => mutation),
      getOrderEligibility: mock(async () => eligibility),
      listContracts: mock(async () => page),
      createContract: mock(async () => mutation),
      updateContract: mock(async () => contract),
      mutateContract: mock(async () => mutation),
      listEvents: mock(async () => page),
    },
    accessPolicy: {
      assertTenantContext: mock(() => TENANT_ID),
      assertPermission: mock(() => "all"),
    },
  };
}

const auth: AuthContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: "示例租户",
  tenantSlug: "demo",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [
    { code: "supplier.view", scope: "all" },
    { code: "supplier.manage", scope: "all" },
    { code: "supplier.contract.manage", scope: "all" },
  ],
};
const supplier = {
  id: SUPPLIER_ID,
  code: "SUP-001",
  name: "晴天建材",
  legal_name: "晴天建材有限公司",
  supplier_type: "manufacturer",
  onboarding_status: "approved",
  operational_status: "active",
  version: 1,
};
const relationship = {
  id: PARENT_ID,
  tenant_id: TENANT_ID,
  supplier_id: SUPPLIER_ID,
  relationship_status: "active",
  settlement_term_days: 30,
  credit_limit_minor: 10000,
  invoice_required_before_payment: true,
  default_currency: "CNY",
  default_tax_inclusive: true,
  tenant_owner_employee_id: EMPLOYEE_ID,
  started_at: "2026-01-01",
  ended_at: null,
  remark: null,
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
};
const contract = {
  id: CONTRACT_ID,
  tenant_id: TENANT_ID,
  tenant_supplier_id: PARENT_ID,
  contract_no: "HT-001",
  name: "年度合同",
  lifecycle_status: "terminated",
  valid_from: "2026-01-01",
  valid_until: "2026-12-31",
  settlement_term_days: 30,
  invoice_required_before_payment: true,
  document_file_id: "00000000-0000-4000-8000-000000000701",
  version: 2,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
};
const settings = {
  tenant_id: TENANT_ID,
  module_enabled: true,
  require_active_contract_for_new_order: false,
  enabled_by_employee_id: EMPLOYEE_ID,
  enabled_at: NOW,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};
const eligibility: SupplierOrderEligibility = {
  eligible: true,
  blocking_reasons: [],
  checked_at: NOW,
  tenant_id: TENANT_ID,
  tenant_supplier_id: PARENT_ID,
  supplier_id: SUPPLIER_ID,
  supplier_version: 1,
  tenant_supplier_version: 1,
};
const mutation = {
  status: "updated",
  idempotent: false,
  tenant_supplier: { ...relationship, supplier },
  version: 2,
};
const page = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const createCommand = {
  tenant_id: TENANT_ID,
  tenant_supplier_id: PARENT_ID,
  supplier_id: SUPPLIER_ID,
  actor_user_id: USER_ID,
  actor_employee_id: EMPLOYEE_ID,
  idempotency_key: "relationship-create-1",
};
