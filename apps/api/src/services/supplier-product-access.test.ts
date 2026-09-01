import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import { resolveSupplierRelationshipAccess } from "./supplier-ownership-access";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type AccessServiceConstructor = typeof import(
  "./supplier-product-access"
)["SupplierProductAccessService"];
let SupplierProductAccessService: AccessServiceConstructor;

beforeAll(async () => {
  ({ SupplierProductAccessService } = await import("./supplier-product-access"));
});

const TENANT_ID = "30000000-0000-4000-8000-000000000001";
const TENANT_SUPPLIER_ID = "30000000-0000-4000-8000-000000000002";
const SUPPLIER_ID = "30000000-0000-4000-8000-000000000003";
const USER_ID = "30000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "30000000-0000-4000-8000-000000000005";

function auth(permissions: string | readonly string[]): AuthContext {
  const permissionCodes = typeof permissions === "string"
    ? [permissions]
    : permissions;
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
    permissions: permissionCodes.map((code) => ({ code, scope: "all" })),
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    accessPolicy: {
      assertTenantContext: mock((context: AuthContext) => {
        if (!context.tenantId) throw Object.assign(new Error(), {
          code: "TENANT_CONTEXT_REQUIRED",
          statusCode: 403,
        });
        return context.tenantId;
      }),
      assertPermission: mock((context: AuthContext, permission: string) => {
        if (!context.permissions.some(({ code }) => code === permission)) {
          throw Object.assign(new Error(), {
            code: "FORBIDDEN",
            statusCode: 403,
          });
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
    relationshipAccess: mock(resolveSupplierRelationshipAccess),
    ...overrides,
  };
}

type CompositeAccessCase = {
  method: "requirePurchasableSkuPriceRead" | "requirePurchasableSkuWrite";
  permissions: readonly [string, string];
};

const COMPOSITE_ACCESS_CASES: CompositeAccessCase[] = [
  {
    method: "requirePurchasableSkuPriceRead",
    permissions: ["supplier.product.manage", "supplier.cost-price.view"],
  },
  {
    method: "requirePurchasableSkuWrite",
    permissions: ["supplier.product.manage", "supplier.cost-price.manage"],
  },
];

function service(deps: ReturnType<typeof dependencies>) {
  return new SupplierProductAccessService(deps as never);
}

async function assertEachCompositePermissionIsRequired(
  accessCase: CompositeAccessCase,
): Promise<void> {
  for (const grantedPermission of accessCase.permissions) {
    const deps = dependencies();
    await expect(service(deps)[accessCase.method](
      auth(grantedPermission),
      TENANT_SUPPLIER_ID,
    )).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(deps.repository.getSettings).not.toHaveBeenCalled();
    expect(deps.repository.findRelationship).not.toHaveBeenCalled();
  }
}

async function assertCompositeWriteRelationshipGate(
  accessCase: CompositeAccessCase,
): Promise<void> {
  const active = dependencies();
  await expect(service(active)[accessCase.method](
    auth(accessCase.permissions),
    TENANT_SUPPLIER_ID,
  )).resolves.toMatchObject({ tenantSupplierId: TENANT_SUPPLIER_ID });
  expect(active.repository.getSettings).toHaveBeenCalledTimes(1);
  expect(active.repository.findRelationship).toHaveBeenCalledTimes(1);
  expect(active.relationshipAccess).toHaveBeenCalledWith({
    relationshipStatus: "active",
    operation: "write",
    permissionGranted: true,
  });

  for (const status of ["suspended", "terminated"] as const) {
    const inactive = dependenciesWithRelationship({
      relationship_status: status,
    });
    await expect(service(inactive)[accessCase.method](
      auth(accessCase.permissions),
      TENANT_SUPPLIER_ID,
    )).rejects.toMatchObject({ code: "SUPPLIER_ORDER_NOT_ELIGIBLE" });
    expect(inactive.relationshipAccess).toHaveBeenCalledWith({
      relationshipStatus: status,
      operation: "write",
      permissionGranted: true,
    });
  }
}

function dependenciesWithRelationship(
  relationshipPatch: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return dependencies({
    repository: {
      getSettings: mock(async () => ({
        tenant_id: TENANT_ID,
        module_enabled: true,
      })),
      findRelationship: mock(async () => ({
        ...relationship,
        ...relationshipPatch,
      })),
    },
    ...overrides,
  });
}

describe("SupplierProductAccessService", () => {
  test("preserves tenant-context denial before purchasable product permissions and data reads", async () => {
    const deps = dependencies();

    await expect(service(deps).requirePurchasableProductWrite(
      { ...auth([]), tenantId: null },
      TENANT_SUPPLIER_ID,
    )).rejects.toMatchObject({
      code: "TENANT_CONTEXT_REQUIRED",
      statusCode: 403,
    });
    expect(deps.repository.getSettings).not.toHaveBeenCalled();
    expect(deps.repository.findRelationship).not.toHaveBeenCalled();
  });

  test.each([
    ["product", "supplier.product.manage"],
    ["cost-price", "supplier.cost-price.manage"],
  ])("rejects purchasable product writes with only %s permission before data reads", async (
    _label,
    permission,
  ) => {
    const deps = dependencies();
    await expect(service(deps).requirePurchasableProductWrite(
      auth(permission),
      TENANT_SUPPLIER_ID,
    )).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(deps.repository.getSettings).not.toHaveBeenCalled();
    expect(deps.repository.findRelationship).not.toHaveBeenCalled();
  });

  test("authorizes purchasable product writes with one settings and relationship read", async () => {
    const deps = dependencies();

    await expect(service(deps).requirePurchasableProductWrite(
      auth([
        "supplier.product.manage",
        "supplier.cost-price.manage",
      ]),
      TENANT_SUPPLIER_ID,
    )).resolves.toMatchObject({ supplierId: SUPPLIER_ID });
    expect(deps.repository.getSettings).toHaveBeenCalledTimes(1);
    expect(deps.repository.findRelationship).toHaveBeenCalledTimes(1);
  });

  test.each(COMPOSITE_ACCESS_CASES)(
    "$method requires both permissions and an active write relationship",
    async (accessCase) => {
      await assertEachCompositePermissionIsRequired(accessCase);
      await assertCompositeWriteRelationshipGate(accessCase);
    },
  );

  test("allows an active tenant-owned private supplier for purchasable product writes", async () => {
    const deps = dependenciesWithRelationship({
      supplier: {
        ...relationship.supplier,
        ownership_scope: "tenant",
        owner_tenant_id: TENANT_ID,
        onboarding_status: "draft",
        operational_status: "active",
      },
    });
    await expect(service(deps)
      .requirePurchasableProductWrite(
        auth([
          "supplier.product.manage",
          "supplier.cost-price.manage",
        ]),
        TENANT_SUPPLIER_ID,
      )).resolves.toMatchObject({ supplierId: SUPPLIER_ID });
  });

  test.each([
    ["pending_review", false],
    ["approved", true],
  ] as const)(
    "%s platform suppliers have the expected purchasable product eligibility",
    async (onboardingStatus, allowed) => {
      const deps = dependenciesWithRelationship({
        supplier: {
          ...relationship.supplier,
          ownership_scope: "platform",
          owner_tenant_id: null,
          onboarding_status: onboardingStatus,
          operational_status: "active",
        },
      });
      const result = service(deps)
        .requirePurchasableProductWrite(
          auth([
            "supplier.product.manage",
            "supplier.cost-price.manage",
          ]),
          TENANT_SUPPLIER_ID,
        );

      if (allowed) {
        await expect(result).resolves.toMatchObject({ supplierId: SUPPLIER_ID });
      } else {
        await expect(result).rejects.toMatchObject({
          code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
          statusCode: 409,
        });
      }
    },
  );

  test("allows cost-price readers to load the product and SKU references needed for pricing", async () => {
    const deps = dependencies();
    const accessService = service(deps);

    await accessService.requireProductRead(
      auth("supplier.product.view"),
      TENANT_SUPPLIER_ID,
    );
    await accessService.requireProductRead(
      auth("supplier.cost-price.view"),
      TENANT_SUPPLIER_ID,
    );
    await accessService.requireProductRead(
      auth("supplier.product.manage"),
      TENANT_SUPPLIER_ID,
    );
    await accessService.requirePriceRead(
      auth("supplier.cost-price.view"),
      TENANT_SUPPLIER_ID,
    );
    await accessService.requirePriceRead(
      auth("supplier.cost-price.manage"),
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
    expect(deps.accessPolicy.assertPermission).toHaveBeenNthCalledWith(
      3,
      expect.anything(),
      "supplier.product.manage",
    );
    expect(deps.accessPolicy.assertPermission).toHaveBeenNthCalledWith(
      4,
      expect.anything(),
      "supplier.cost-price.view",
    );
    expect(deps.accessPolicy.assertPermission).toHaveBeenNthCalledWith(
      5,
      expect.anything(),
      "supplier.cost-price.manage",
    );
  });

  test("returns a server-derived supplier proxy scope", async () => {
    const deps = dependencies();

    await expect(service(deps).requireProductWrite(
      auth("supplier.product.manage"),
      TENANT_SUPPLIER_ID,
    )).resolves.toEqual({
      tenantId: TENANT_ID,
      tenantSupplierId: TENANT_SUPPLIER_ID,
      supplierId: SUPPLIER_ID,
      authUserId: USER_ID,
      employeeId: EMPLOYEE_ID,
    });
    expect(deps.relationshipAccess).toHaveBeenCalledWith({
      relationshipStatus: "active",
      operation: "write",
      permissionGranted: true,
    });
  });

  test("allows tenant-owned private suppliers to write products without platform onboarding semantics", async () => {
    const deps = dependenciesWithRelationship({
      supplier: {
        ...relationship.supplier,
        ownership_scope: "tenant",
        owner_tenant_id: TENANT_ID,
        onboarding_status: "draft",
        operational_status: "active",
      },
    });
    await expect(service(deps)
      .requireProductWrite(
        auth("supplier.product.manage"),
        TENANT_SUPPLIER_ID,
      )).resolves.toMatchObject({ supplierId: SUPPLIER_ID });
  });

  test("rejects disabled modules and non-active write relationships", async () => {
    const disabled = dependencies({
      repository: {
        getSettings: mock(async () => ({
          tenant_id: TENANT_ID,
          module_enabled: false,
        })),
        findRelationship: mock(async () => relationship),
      },
    });
    await expect(service(disabled)
      .requireProductRead(
        auth("supplier.product.view"),
        TENANT_SUPPLIER_ID,
      )).rejects.toMatchObject({ code: "SUPPLIER_MODULE_DISABLED" });

    const suspended = dependenciesWithRelationship({
      relationship_status: "suspended",
    });
    await expect(service(suspended)
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
      const deps = dependenciesWithRelationship({
        relationship_status: relationshipStatus,
      }, {
        relationshipAccess: mock(() => ({
          visible: true,
          writable: false,
          historicalOnly: true,
          reason: "inactive_relationship" as const,
        })),
      });
      await expect(service(deps)
        .requireProductRead(
          auth("supplier.product.view"),
          TENANT_SUPPLIER_ID,
        )).resolves.toMatchObject({ supplierId: SUPPLIER_ID });
      expect(deps.relationshipAccess).toHaveBeenCalledWith({
        relationshipStatus,
        operation: "read",
        permissionGranted: true,
      });
    },
  );

  test("maps pure-policy write denial to the existing eligibility error", async () => {
    const deps = dependencies({
      relationshipAccess: mock(() => ({
        visible: true,
        writable: false,
        historicalOnly: true,
        reason: "inactive_relationship" as const,
      })),
    });
    await expect(service(deps)
      .requireProductWrite(
        auth("supplier.product.manage"),
        TENANT_SUPPLIER_ID,
      )).rejects.toMatchObject({
        statusCode: 409,
        code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
      });
  });

  test("maps a foreign tenant relationship to the existing non-disclosing error", async () => {
    const deps = dependenciesWithRelationship({
      tenant_id: "30000000-0000-4000-8000-000000000099",
    });
    await expect(service(deps)
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
