import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "60000000-0000-4000-8000-000000000001";
const PROJECT_ID = "60000000-0000-4000-8000-000000000002";
const USER_ID = "60000000-0000-4000-8000-000000000003";
const EMPLOYEE_ID = "60000000-0000-4000-8000-000000000004";

function auth(
  permissions: string[],
  overrides: Partial<AuthContext> = {},
): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    tenantName: "测试租户",
    tenantSlug: "test",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "采购员",
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
    permissions: permissions.map((code) => ({ code, scope: "all" })),
    ...overrides,
  };
}

function dependencies(overrides: {
  moduleEnabled?: boolean;
  projectAccess?: boolean;
  visibleProjectIds?: string[] | null;
} = {}) {
  return {
    accessPolicy: {
      assertTenantContext: mock((context: AuthContext) => {
        if (!context.tenantId) {
          throw Object.assign(new Error(), { code: "TENANT_CONTEXT_REQUIRED" });
        }
        return context.tenantId;
      }),
      assertPermission: mock((context: AuthContext, permission: string) => {
        if (!context.permissions.some(({ code }) => code === permission)) {
          throw Object.assign(new Error(), { code: "FORBIDDEN" });
        }
      }),
      getVisibleProjectIds: mock(async () =>
        overrides.visibleProjectIds === undefined
          ? [PROJECT_ID]
          : overrides.visibleProjectIds
      ),
      canAccessProject: mock(async () => overrides.projectAccess ?? true),
    },
    repository: {
      getSettings: mock(async () => ({
        tenant_id: TENANT_ID,
        module_enabled: overrides.moduleEnabled ?? true,
      })),
    },
  };
}

describe("SupplierPurchaseOrderAccessService", () => {
  test("uses distinct purchase-order view and manage permissions", async () => {
    const deps = dependencies();
    const { SupplierPurchaseOrderAccessService } = await import(
      "./supplier-purchase-order-access"
    );
    const service = new SupplierPurchaseOrderAccessService(deps as never);

    await service.requireRead(auth(["supplier.purchase-order.view"]));
    await service.requireManage(auth(["supplier.purchase-order.manage"]));

    expect(deps.accessPolicy.assertPermission).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "supplier.purchase-order.view",
    );
    expect(deps.accessPolicy.assertPermission).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "supplier.purchase-order.manage",
    );
  });

  test("rejects missing tenant, actor identities, and disabled modules", async () => {
    const { SupplierPurchaseOrderAccessService } = await import(
      "./supplier-purchase-order-access"
    );
    await expect(
      new SupplierPurchaseOrderAccessService(dependencies() as never)
        .requireRead(auth(["supplier.purchase-order.view"], {
          tenantId: null,
        })),
    ).rejects.toMatchObject({ code: "TENANT_CONTEXT_REQUIRED" });
    await expect(
      new SupplierPurchaseOrderAccessService(dependencies() as never)
        .requireRead(auth(["supplier.purchase-order.view"], {
          employeeId: null,
        })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      new SupplierPurchaseOrderAccessService(dependencies() as never)
        .requireManage(auth(["supplier.purchase-order.manage"], {
          authUserId: "",
        })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      new SupplierPurchaseOrderAccessService(
        dependencies({ moduleEnabled: false }) as never,
      ).requireRead(auth(["supplier.purchase-order.view"])),
    ).rejects.toMatchObject({ code: "SUPPLIER_MODULE_DISABLED" });
  });

  test("delegates project scope and object checks with the exact permission", async () => {
    const deps = dependencies({ visibleProjectIds: [PROJECT_ID] });
    const { SupplierPurchaseOrderAccessService } = await import(
      "./supplier-purchase-order-access"
    );
    const service = new SupplierPurchaseOrderAccessService(deps as never);
    const context = auth([
      "supplier.purchase-order.view",
      "supplier.purchase-order.manage",
      "project.read",
      "project.update",
    ]);

    expect(await service.getVisibleProjectIds(context)).toEqual([PROJECT_ID]);
    await service.assertProjectRead(context, PROJECT_ID);
    await service.assertProjectUpdate(context, PROJECT_ID);

    expect(deps.accessPolicy.getVisibleProjectIds).toHaveBeenCalledWith(
      context,
      "project.read",
    );
    expect(deps.accessPolicy.canAccessProject).toHaveBeenNthCalledWith(
      1,
      context,
      PROJECT_ID,
      "project.read",
    );
    expect(deps.accessPolicy.canAccessProject).toHaveBeenNthCalledWith(
      2,
      context,
      PROJECT_ID,
      "project.update",
    );
  });

  test("rejects a project outside the effective scope", async () => {
    const { SupplierPurchaseOrderAccessService } = await import(
      "./supplier-purchase-order-access"
    );
    const service = new SupplierPurchaseOrderAccessService(
      dependencies({ projectAccess: false }) as never,
    );

    await expect(service.assertProjectRead(
      auth(["project.read"]),
      PROJECT_ID,
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
