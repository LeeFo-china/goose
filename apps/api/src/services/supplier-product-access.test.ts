import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import { resolveSupplierOwnershipAccess } from "./supplier-ownership-access";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "30000000-0000-4000-8000-000000000001";
const TENANT_SUPPLIER_ID = "30000000-0000-4000-8000-000000000002";
const SUPPLIER_ID = "30000000-0000-4000-8000-000000000003";
const USER_ID = "30000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "30000000-0000-4000-8000-000000000005";

function auth(permission: string): AuthContext {
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
    permissions: [{ code: permission, scope: "all" }],
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    accessPolicy: {
      assertTenantContext: mock((context: AuthContext) => {
        if (!context.tenantId) throw Object.assign(new Error(), {
          code: "TENANT_CONTEXT_REQUIRED",
        });
        return context.tenantId;
      }),
      assertPermission: mock((context: AuthContext, permission: string) => {
        if (!context.permissions.some(({ code }) => code === permission)) {
          throw Object.assign(new Error(), { code: "FORBIDDEN" });
        }
      }),
    },
    repository: {
      getSettings: mock(async () => ({
        tenant_id: TENANT_ID,
        module_enabled: true,
      })),
      findRelationship: mock(async () => relationship),
    },
    ownershipAccess: mock(resolveSupplierOwnershipAccess),
    ...overrides,
  };
}

describe("SupplierProductAccessService", () => {
  test("uses distinct product and cost-price read permissions", async () => {
    const deps = dependencies();
    const { SupplierProductAccessService } = await import(
      "./supplier-product-access"
    );
    const service = new SupplierProductAccessService(deps as never);

    await service.requireProductRead(
      auth("supplier.product.view"),
      TENANT_SUPPLIER_ID,
    );
    await service.requirePriceRead(
      auth("supplier.cost-price.view"),
      TENANT_SUPPLIER_ID,
    );

    expect(deps.accessPolicy.assertPermission).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "supplier.product.view",
    );
    expect(deps.accessPolicy.assertPermission).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      "supplier.cost-price.view",
    );
  });

  test("returns a server-derived supplier proxy scope", async () => {
    const deps = dependencies();
    const { SupplierProductAccessService } = await import(
      "./supplier-product-access"
    );
    const service = new SupplierProductAccessService(deps as never);

    await expect(service.requireProductWrite(
      auth("supplier.product.manage"),
      TENANT_SUPPLIER_ID,
    )).resolves.toEqual({
      tenantId: TENANT_ID,
      tenantSupplierId: TENANT_SUPPLIER_ID,
      supplierId: SUPPLIER_ID,
      authUserId: USER_ID,
      employeeId: EMPLOYEE_ID,
    });
    expect(deps.ownershipAccess).toHaveBeenCalledWith({
      actor: { kind: "tenant", tenantId: TENANT_ID },
      resourceKind: "product",
      ownership: {
        ownershipScope: "tenant",
        ownerTenantId: TENANT_ID,
      },
      relationshipStatus: "active",
      operation: "write",
      permissionGranted: true,
    });
  });

  test("rejects disabled modules and non-active write relationships", async () => {
    const { SupplierProductAccessService } = await import(
      "./supplier-product-access"
    );
    const disabled = dependencies({
      repository: {
        getSettings: mock(async () => ({
          tenant_id: TENANT_ID,
          module_enabled: false,
        })),
        findRelationship: mock(async () => relationship),
      },
    });
    await expect(new SupplierProductAccessService(disabled as never)
      .requireProductRead(
        auth("supplier.product.view"),
        TENANT_SUPPLIER_ID,
      )).rejects.toMatchObject({ code: "SUPPLIER_MODULE_DISABLED" });

    const suspended = dependencies({
      repository: {
        getSettings: mock(async () => ({
          tenant_id: TENANT_ID,
          module_enabled: true,
        })),
        findRelationship: mock(async () => ({
          ...relationship,
          relationship_status: "suspended",
        })),
      },
    });
    await expect(new SupplierProductAccessService(suspended as never)
      .requirePriceWrite(
        auth("supplier.cost-price.manage"),
        TENANT_SUPPLIER_ID,
      )).rejects.toMatchObject({ code: "SUPPLIER_ORDER_NOT_ELIGIBLE" });
  });

  test.each([
    "evaluating",
    "suspended",
    "terminated",
    "blacklisted",
  ] as const)(
    "allows historical product reads for a %s relationship through the policy",
    async (relationshipStatus) => {
      const deps = dependencies({
        repository: {
          getSettings: mock(async () => ({
            tenant_id: TENANT_ID,
            module_enabled: true,
          })),
          findRelationship: mock(async () => ({
            ...relationship,
            relationship_status: relationshipStatus,
          })),
        },
        ownershipAccess: mock(() => ({
          visible: true,
          writable: false,
          historicalOnly: true,
          reason: "inactive_relationship" as const,
        })),
      });
      const { SupplierProductAccessService } = await import(
        "./supplier-product-access"
      );

      await expect(new SupplierProductAccessService(deps as never)
        .requireProductRead(
          auth("supplier.product.view"),
          TENANT_SUPPLIER_ID,
        )).resolves.toMatchObject({ supplierId: SUPPLIER_ID });
      expect(deps.ownershipAccess).toHaveBeenCalledWith(expect.objectContaining({
        relationshipStatus,
        operation: "read",
      }));
    },
  );

  test("maps pure-policy write denial to the existing eligibility error", async () => {
    const deps = dependencies({
      ownershipAccess: mock(() => ({
        visible: true,
        writable: false,
        historicalOnly: true,
        reason: "inactive_relationship" as const,
      })),
    });
    const { SupplierProductAccessService } = await import(
      "./supplier-product-access"
    );

    await expect(new SupplierProductAccessService(deps as never)
      .requireProductWrite(
        auth("supplier.product.manage"),
        TENANT_SUPPLIER_ID,
      )).rejects.toMatchObject({
        statusCode: 409,
        code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
      });
  });

  test("maps a foreign tenant relationship to the existing non-disclosing error", async () => {
    const deps = dependencies({
      repository: {
        getSettings: mock(async () => ({
          tenant_id: TENANT_ID,
          module_enabled: true,
        })),
        findRelationship: mock(async () => ({
          ...relationship,
          tenant_id: "30000000-0000-4000-8000-000000000099",
        })),
      },
    });
    const { SupplierProductAccessService } = await import(
      "./supplier-product-access"
    );

    await expect(new SupplierProductAccessService(deps as never)
      .requireProductRead(
        auth("supplier.product.view"),
        TENANT_SUPPLIER_ID,
      )).rejects.toMatchObject({
        statusCode: 404,
        code: "TENANT_SUPPLIER_NOT_FOUND",
      });
  });
});

const relationship = {
  id: TENANT_SUPPLIER_ID,
  tenant_id: TENANT_ID,
  supplier_id: SUPPLIER_ID,
  relationship_status: "active",
  supplier: {
    id: SUPPLIER_ID,
    onboarding_status: "approved",
    operational_status: "active",
  },
};
