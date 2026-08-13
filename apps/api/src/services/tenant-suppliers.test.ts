import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const BODY_TENANT_ID = "00000000-0000-4000-8000-000000000102";
const TENANT_SUPPLIER_ID = "00000000-0000-4000-8000-000000000201";
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000301";
const CONTRACT_ID = "00000000-0000-4000-8000-000000000401";
const USER_ID = "00000000-0000-4000-8000-000000000501";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000601";
const FILE_ID = "00000000-0000-4000-8000-000000000701";
const NOW = "2026-07-24T00:00:00.000Z";

async function createService(overrides: Record<string, unknown> = {}) {
  const dependencies = createDependencies(overrides);
  const { TenantSuppliersService } = await import("./tenant-suppliers");
  return {
    service: new TenantSuppliersService(dependencies as never),
    dependencies,
  };
}

describe("TenantSuppliersService tenant and permission boundaries", () => {
  test("derives tenant id only from AuthContext for every read", async () => {
    const { service, dependencies } = await createService();
    const context = auth(["supplier.view"]);

    await service.listRelationships(context, {
      page: 1,
      pageSize: 20,
      tenant_id: BODY_TENANT_ID,
    } as never);
    await service.listDirectory(context, {
      page: 1,
      pageSize: 20,
      tenant_id: BODY_TENANT_ID,
    } as never);
    await service.getRelationship(context, TENANT_SUPPLIER_ID);
    await service.getOrderEligibility(context, TENANT_SUPPLIER_ID);

    expect(dependencies.accessPolicy.assertTenantContext).toHaveBeenCalledTimes(4);
    expect(dependencies.accessPolicy.assertPermission).toHaveBeenCalledTimes(4);
    expect(dependencies.repository.listRelationships).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: TENANT_ID }),
    );
    expect(dependencies.repository.listDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: TENANT_ID }),
    );
    expect(dependencies.repository.findRelationship).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      id: TENANT_SUPPLIER_ID,
    });
    expect(dependencies.repository.getOrderEligibility).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      id: TENANT_SUPPLIER_ID,
    });
  });

  test("rejects missing tenant context and missing permission before repository access", async () => {
    const missingTenant = await createService();
    await expect(missingTenant.service.listRelationships(
      auth(["supplier.view"], null),
      { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ code: "TENANT_CONTEXT_REQUIRED" });
    expect(missingTenant.dependencies.repository.listRelationships)
      .not.toHaveBeenCalled();

    const missingPermission = await createService();
    await expect(missingPermission.service.listRelationships(
      auth([]),
      { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(missingPermission.dependencies.repository.listRelationships)
      .not.toHaveBeenCalled();
  });

  test("returns SUPPLIER_MODULE_DISABLED for tenant reads while disabled", async () => {
    const { service, dependencies } = await createService({
      getSettings: mock(async () => ({ ...settings, module_enabled: false })),
    });

    const reads = [
      () => service.listRelationships(auth(["supplier.view"]), {
        page: 1,
        pageSize: 20,
      }),
      () => service.listDirectory(auth(["supplier.view"]), {
        page: 1,
        pageSize: 20,
      }),
      () => service.getRelationship(auth(["supplier.view"]), TENANT_SUPPLIER_ID),
      () => service.listContracts(
        auth(["supplier.view"]),
        TENANT_SUPPLIER_ID,
        { page: 1, pageSize: 20 },
      ),
      () => service.listEvents(
        auth(["supplier.view"]),
        TENANT_SUPPLIER_ID,
        { page: 1, pageSize: 20 },
      ),
    ];
    for (const read of reads) {
      await expect(read()).rejects.toMatchObject({
        statusCode: 403,
        code: "SUPPLIER_MODULE_DISABLED",
      });
    }
    expect(dependencies.repository.listRelationships).not.toHaveBeenCalled();
    expect(dependencies.repository.listDirectory).not.toHaveBeenCalled();
    await expect(service.getSettings(auth(["supplier.view"]))).resolves
      .toMatchObject({ module_enabled: false });
  });

  test("returns fail-closed effective rollout flags to the tenant", async () => {
    const { service } = await createService({
      getSettings: mock(async () => ({
        ...settings,
        module_enabled: false,
        ownership_reads_enabled: true,
        private_supplier_writes_enabled: true,
        private_catalog_writes_enabled: true,
        procurement_snapshot_v1_enabled: true,
      })),
    });

    await expect(service.getSettings(auth(["supplier.view"]))).resolves
      .toMatchObject({
        module_enabled: false,
        ownership_reads_enabled: false,
        private_supplier_writes_enabled: false,
        private_catalog_writes_enabled: false,
        procurement_snapshot_v1_enabled: false,
      });
  });
});

describe("TenantSuppliersService relationship rules", () => {
  test("linking an unavailable platform supplier fails with a stable state error", async () => {
    for (const state of ["unapproved", "suspended", "blacklisted"]) {
      const { service, dependencies } = await createService({
        createRelationship: mock(async () => ({
          status: "state_conflict",
          error_code: "SUPPLIER_STATE_CONFLICT",
          reason: state,
        })),
      });
      await expect(service.createRelationship(
        auth(["supplier.manage"]),
        TENANT_SUPPLIER_ID,
        { supplier_id: SUPPLIER_ID },
        `create-${state}`,
      )).rejects.toMatchObject({
        statusCode: 409,
        code: "SUPPLIER_STATE_CONFLICT",
      });
      expect(dependencies.repository.createRelationship).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          supplier_id: SUPPLIER_ID,
        }),
      );
    }
  });

  test("tenant blacklist mutates only the tenant relationship", async () => {
    const { service, dependencies } = await createService();

    await service.mutateRelationship(
      auth(["supplier.manage"]),
      TENANT_SUPPLIER_ID,
      "blacklist",
      { expected_version: 1, reason: "租户内部禁用" },
      "blacklist-1",
    );

    expect(dependencies.repository.mutateRelationship).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      action: "blacklist",
      expected_version: 1,
      reason: "租户内部禁用",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "blacklist-1",
    });
    expect(Object.keys(dependencies.repository))
      .not.toContain("mutatePlatformSupplier");
  });

  test("contract policy uses supplier.manage and never accepts module_enabled", async () => {
    const { service, dependencies } = await createService();

    await service.updateContractPolicy(auth(["supplier.manage"]), {
      require_active_contract_for_new_order: true,
      expected_version: 1,
      module_enabled: true,
    } as never);

    expect(dependencies.accessPolicy.assertPermission)
      .toHaveBeenCalledWith(expect.anything(), "supplier.manage");
    expect(dependencies.repository.updateContractPolicy).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      require_active_contract_for_new_order: true,
      expected_version: 1,
    });
  });
});

describe("TenantSuppliersService eligibility and contract independence", () => {
  test("tenant-scoped purchase-order eligibility does not require supplier.view", async () => {
    const { service, dependencies } = await createService();

    await service.assertCanCreatePurchaseOrderForTenant(
      TENANT_ID,
      TENANT_SUPPLIER_ID,
    );

    expect(dependencies.accessPolicy.assertTenantContext).not.toHaveBeenCalled();
    expect(dependencies.accessPolicy.assertPermission).not.toHaveBeenCalled();
    expect(dependencies.repository.getOrderEligibility).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      id: TENANT_SUPPLIER_ID,
    });
  });

  test("assertCanCreatePurchaseOrder reuses one eligibility query and returns all reasons", async () => {
    const reasons = [
      "required_qualification_expired",
      "active_contract_required",
    ] as const;
    const { service, dependencies } = await createService({
      getOrderEligibility: mock(async () => ({
        ...eligibility,
        eligible: false,
        blocking_reasons: [...reasons],
      })),
    });

    await expect(service.assertCanCreatePurchaseOrder(
      auth(["supplier.view"]),
      TENANT_SUPPLIER_ID,
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
      details: {
        blocking_reasons: [...reasons],
      },
    });
    expect(dependencies.repository.getOrderEligibility).toHaveBeenCalledTimes(1);
  });

  test("expired qualification does not gate contract maintenance", async () => {
    const { service, dependencies } = await createService({
      getOrderEligibility: mock(async () => ({
        ...eligibility,
        eligible: false,
        blocking_reasons: ["required_qualification_expired"],
      })),
    });
    const context = auth(["supplier.contract.manage"]);

    await service.updateContract(
      context,
      TENANT_SUPPLIER_ID,
      CONTRACT_ID,
      { expected_version: 1, name: "新版合同" },
    );
    await service.mutateContract(
      context,
      TENANT_SUPPLIER_ID,
      CONTRACT_ID,
      "terminate",
      { expected_version: 1, reason: "合作结束" },
      "terminate-contract-1",
    );

    expect(dependencies.repository.getOrderEligibility).not.toHaveBeenCalled();
    expect(dependencies.repository.updateContract).toHaveBeenCalledTimes(1);
    expect(dependencies.repository.mutateContract).toHaveBeenCalledTimes(1);
  });

  test("contract writes verify the relationship belongs to the current tenant", async () => {
    const { service, dependencies } = await createService({
      findRelationship: mock(async () => null),
    });

    await expect(service.createContract(
      auth(["supplier.contract.manage"]),
      TENANT_SUPPLIER_ID,
      CONTRACT_ID,
      {
        contract_no: "HT-001",
        name: "年度采购合同",
        valid_from: "2026-01-01",
        valid_until: "2026-12-31",
        settlement_term_days: 30,
        invoice_required_before_payment: true,
        document_file_id: FILE_ID,
      },
      "create-contract-1",
    )).rejects.toMatchObject({
      statusCode: 404,
      code: "TENANT_SUPPLIER_NOT_FOUND",
    });
    expect(dependencies.repository.createContract).not.toHaveBeenCalled();
  });
});

function createDependencies(overrides: Record<string, unknown> = {}) {
  const repository = {
    getSettings: mock(async () => settings),
    updateContractPolicy: mock(async (input) => ({ ...settings, ...input, version: 2 })),
    listRelationships: mock(async ({ page, pageSize }) => emptyPage(page, pageSize)),
    listDirectory: mock(async ({ page, pageSize }) => emptyPage(page, pageSize)),
    findRelationship: mock(async () => relationship),
    createRelationship: mock(async () => ({
      status: "created",
      idempotent: false,
      tenant_supplier: relationship,
      version: 1,
    })),
    updateRelationship: mock(async () => ({
      status: "updated",
      idempotent: false,
      tenant_supplier: { ...relationship, version: 2 },
      version: 2,
    })),
    mutateRelationship: mock(async (input) => ({
      status: "updated",
      idempotent: false,
      tenant_supplier: {
        ...relationship,
        relationship_status: input.action === "blacklist"
          ? "blacklisted"
          : relationship.relationship_status,
        version: 2,
      },
      version: 2,
    })),
    getOrderEligibility: mock(async () => eligibility),
    listContracts: mock(async ({ page, pageSize }) => emptyPage(page, pageSize)),
    createContract: mock(async (input) => ({ ...contract, ...input })),
    updateContract: mock(async (input) => ({ ...contract, ...input, version: 2 })),
    mutateContract: mock(async () => ({
      status: "updated",
      idempotent: false,
      contract: { ...contract, lifecycle_status: "terminated", version: 2 },
      version: 2,
    })),
    listEvents: mock(async ({ page, pageSize }) => emptyPage(page, pageSize)),
    ...overrides,
  };
  return {
    repository,
    accessPolicy: {
      assertTenantContext: mock((context: AuthContext) => {
        if (!context.tenantId) {
          throw Object.assign(new Error("tenant required"), {
            statusCode: 403,
            code: "TENANT_CONTEXT_REQUIRED",
          });
        }
        return context.tenantId;
      }),
      assertPermission: mock((context: AuthContext, permission: string) => {
        if (!context.permissions.some((item) => item.code === permission)) {
          throw Object.assign(new Error("forbidden"), {
            statusCode: 403,
            code: "FORBIDDEN",
          });
        }
        return "all";
      }),
    },
  };
}

function auth(
  permissionCodes: string[],
  tenantId: string | null = TENANT_ID,
): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId,
    tenantName: "示例装修公司",
    tenantSlug: "demo",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "租户管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["system_admin"],
    roles: [],
    permissions: permissionCodes.map((code) => ({ code, scope: "all" })),
  };
}

function emptyPage(page: number, pageSize: number) {
  return {
    list: [],
    pagination: { page, pageSize, total: 0, totalPages: 0 },
  };
}

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
const supplier = {
  id: SUPPLIER_ID,
  code: "SUP-001",
  name: "晴天建材",
  legal_name: "晴天建材有限公司",
  supplier_type: "manufacturer",
  onboarding_status: "approved",
  operational_status: "active",
  version: 4,
};
const relationship = {
  id: TENANT_SUPPLIER_ID,
  tenant_id: TENANT_ID,
  supplier_id: SUPPLIER_ID,
  relationship_status: "active",
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
};
const eligibility = {
  eligible: true,
  blocking_reasons: [],
  checked_at: NOW,
  tenant_id: TENANT_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  supplier_id: SUPPLIER_ID,
  supplier_version: 4,
  tenant_supplier_version: 1,
};
const contract = {
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
};
