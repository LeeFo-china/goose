import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const TENANT_SUPPLIER_ID = "00000000-0000-4000-8000-000000000201";
const USER_ID = "00000000-0000-4000-8000-000000000501";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000601";

describe("TenantSuppliersService private supplier creation", () => {
  test("defaults system-managed fields for name-only private supplier input", async () => {
    const allocationId = "00000000-0000-4000-8000-000000000901";
    const repository = {
      getSettings: mock(async () => ({
        tenant_id: TENANT_ID,
        module_enabled: true,
        ownership_reads_enabled: true,
        private_supplier_writes_enabled: true,
        private_catalog_writes_enabled: false,
        procurement_snapshot_v1_enabled: false,
      })),
      allocateInternalCode: mock(async () => ({
        allocation_id: allocationId,
        code: "SUP-000001",
        idempotent: false,
      })),
      createPrivateSupplier: mock(async () => ({
        status: "created",
        idempotent: false,
        tenant_supplier: { id: TENANT_SUPPLIER_ID },
        version: 1,
      })),
    };
    const accessPolicy = {
      assertTenantContext: mock((context: AuthContext) => context.tenantId!),
      assertPermission: mock((): "all" => "all"),
      hasPermission: mock(() => false),
    };
    const { TenantSuppliersService } = await import("./tenant-suppliers");
    const service = new TenantSuppliersService({
      repository: repository as never,
      accessPolicy,
    });

    await service.createPrivateSupplier(
      auth(),
      { name: "固始晴天装饰工程有限公司" },
      "private-create-key",
    );

    expect(repository.allocateInternalCode).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
      }),
    );
    expect(repository.createPrivateSupplier).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        name: "固始晴天装饰工程有限公司",
        legal_name: "固始晴天装饰工程有限公司",
        supplier_type: "other",
        code_source: "generated",
        internal_supplier_code: "SUP-000001",
        allocation_id: allocationId,
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
        idempotency_key: "private-create-key",
      }),
    );
  });
});

function auth(): AuthContext {
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
    permissions: [{ code: "supplier.master.manage", scope: "all" }],
  };
}
