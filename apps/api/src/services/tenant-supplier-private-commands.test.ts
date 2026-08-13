import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const RELATIONSHIP_ID = "00000000-0000-4000-8000-000000000201";
const SUPPLIER_ID = "00000000-0000-4000-8000-000000000301";
const USER_ID = "00000000-0000-4000-8000-000000000501";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000601";
const ALLOCATION_ID = "00000000-0000-4000-8000-000000000901";

async function createService(overrides: Record<string, unknown> = {}) {
  const repository = {
    getSettings: mock(async () => settings),
    allocateInternalCode: mock(async () => ({
      allocation_id: ALLOCATION_ID,
      code: "SUP-000001",
      idempotent: false,
    })),
    createPrivateSupplier: mock(async () => privateRelationship),
    createSharedRelationship: mock(async () => platformRelationship),
    updatePrivateSupplierMaster: mock(async () => ({
      ...privateRelationship.supplier,
      name: "新版私有供应商",
      version: 2,
    })),
    findRelationship: mock(async () => privateRelationship),
    ...overrides,
  };
  const accessPolicy = {
    assertTenantContext: mock((context: AuthContext) => {
      if (!context.tenantId) throw Object.assign(new Error(), { code: "TENANT_CONTEXT_REQUIRED" });
      return context.tenantId;
    }),
    assertPermission: mock((context: AuthContext, permission: string) => {
      if (!context.permissions.some((item) => item.code === permission)) {
        throw Object.assign(new Error(), { code: "FORBIDDEN", statusCode: 403 });
      }
      return "all";
    }),
  };
  const { TenantSuppliersService } = await import("./tenant-suppliers");
  return {
    service: new TenantSuppliersService({ repository, accessPolicy } as never),
    repository,
    accessPolicy,
  };
}

describe("TenantSuppliersService private supplier commands", () => {
  test("requires supplier.master.manage and private-write rollout for allocation", async () => {
    const denied = await createService();
    await expect(denied.service.allocateInternalCode(
      auth([]),
      "allocate-1",
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(denied.repository.allocateInternalCode).not.toHaveBeenCalled();

    const disabled = await createService({
      getSettings: mock(async () => ({
        ...settings,
        private_supplier_writes_enabled: false,
      })),
    });
    await expect(disabled.service.allocateInternalCode(
      auth(["supplier.master.manage"]),
      "allocate-1",
    )).rejects.toMatchObject({ code: "SUPPLIER_PRIVATE_WRITES_DISABLED" });
    expect(disabled.repository.allocateInternalCode).not.toHaveBeenCalled();
  });

  test("allocates only when the explicit allocation method is called", async () => {
    const { service, repository } = await createService();
    await service.allocateInternalCode(
      auth(["supplier.master.manage"]),
      "allocate-1",
    );
    expect(repository.allocateInternalCode).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "allocate-1",
    });
  });

  test("creates private suppliers without silently allocating a code", async () => {
    const { service, repository } = await createService();
    await service.createPrivateSupplier(
      auth(["supplier.master.manage"]),
      {
        name: "私有供应商",
        legal_name: "私有供应商有限公司",
        supplier_type: "manufacturer",
        code_source: "generated",
        internal_supplier_code: "SUP-000001",
        allocation_id: ALLOCATION_ID,
      },
      "create-private-1",
    );
    expect(repository.allocateInternalCode).not.toHaveBeenCalled();
    expect(repository.createPrivateSupplier).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
        idempotency_key: "create-private-1",
        code_source: "generated",
        allocation_id: ALLOCATION_ID,
      }),
    );
  });

  test("creates shared relationships with supplier.manage and no private flag", async () => {
    const { service, repository, accessPolicy } = await createService({
      getSettings: mock(async () => ({
        ...settings,
        private_supplier_writes_enabled: false,
      })),
    });
    await service.createSharedRelationship(
      auth(["supplier.manage"]),
      {
        supplier_id: SUPPLIER_ID,
        code_source: "manual",
        internal_supplier_code: "LOCAL-001",
      },
      "create-shared-1",
    );
    expect(accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.anything(),
      "supplier.manage",
    );
    expect(repository.createSharedRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: TENANT_ID, supplier_id: SUPPLIER_ID }),
    );
  });

  test("updates only through the tenant-private guarded repository command", async () => {
    const { service, repository } = await createService();
    await service.updatePrivateSupplierMaster(
      auth(["supplier.master.manage"]),
      RELATIONSHIP_ID,
      { expected_version: 1, name: "新版私有供应商" },
    );
    expect(repository.updatePrivateSupplierMaster).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      expected_version: 1,
      name: "新版私有供应商",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
    });
  });

  test("rejects platform and foreign private masters at the service boundary", async () => {
    for (const supplierOverride of [
      { ownership_scope: "platform", owner_tenant_id: null },
      {
        ownership_scope: "tenant",
        owner_tenant_id: "00000000-0000-4000-8000-000000000999",
      },
    ]) {
      const { service, repository } = await createService({
        findRelationship: mock(async () => ({
          ...privateRelationship,
          supplier: { ...privateRelationship.supplier, ...supplierOverride },
        })),
      });
      await expect(service.updatePrivateSupplierMaster(
        auth(["supplier.master.manage"]),
        RELATIONSHIP_ID,
        { expected_version: 1, name: "越权更新" },
      )).rejects.toMatchObject({
        code: supplierOverride.ownership_scope === "platform"
          ? "PRIVATE_RESOURCE_FORBIDDEN"
          : "TENANT_SUPPLIER_NOT_FOUND",
      });
      expect(repository.updatePrivateSupplierMaster).not.toHaveBeenCalled();
    }
  });
});

function auth(permissionCodes: string[]): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: TENANT_ID,
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

const settings = {
  tenant_id: TENANT_ID,
  module_enabled: true,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: true,
  private_supplier_writes_enabled: true,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  enabled_by_employee_id: EMPLOYEE_ID,
  enabled_at: "2026-08-13T00:00:00Z",
  version: 1,
  created_at: "2026-08-13T00:00:00Z",
  updated_at: "2026-08-13T00:00:00Z",
};
const supplier = {
  id: SUPPLIER_ID,
  code: "SUP-001",
  name: "平台供应商",
  legal_name: "平台供应商有限公司",
  supplier_type: "manufacturer",
  ownership_scope: "platform",
  owner_tenant_id: null,
  onboarding_status: "approved",
  operational_status: "active",
  version: 1,
};
const platformRelationship = { id: RELATIONSHIP_ID, supplier };
const privateRelationship = {
  id: RELATIONSHIP_ID,
  tenant_id: TENANT_ID,
  supplier_id: SUPPLIER_ID,
  relationship_status: "active",
  supplier: {
    ...supplier,
    code: "SUP-000001",
    ownership_scope: "tenant",
    owner_tenant_id: TENANT_ID,
  },
};
