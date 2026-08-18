import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "70000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "70000000-0000-4000-8000-000000000002";
const SKU_ID = "70000000-0000-4000-8000-000000000003";
const USER_ID = "70000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "70000000-0000-4000-8000-000000000005";
const CATEGORY_ID = "70000000-0000-4000-8000-000000000006";
const BRAND_ID = "70000000-0000-4000-8000-000000000007";

function dependencies() {
  return {
    authorization: {
      assertPlatformSession: mock(async (context: AuthContext) => context),
      assertPermission: mock(() => undefined),
    },
    repository: {
      listPlatformProducts: mock(async () => page),
      findPlatformProduct: mock(async (): Promise<{ id: string } | null> => ({
        ...product,
      })),
      listPlatformSkus: mock(async () => page),
      listPlatformSkuUnitConversions: mock(async () => conversions),
      createPlatformProduct: mock(async () => ({ status: "created" })),
      updatePlatformProduct: mock(async () => ({ status: "updated" })),
      mutatePlatformProduct: mock(async () => ({ status: "updated" })),
      createPlatformSku: mock(async () => ({ status: "created" })),
      updatePlatformSku: mock(async () => ({ status: "updated" })),
      mutatePlatformSku: mock(async () => ({ status: "updated" })),
      replaceSkuUnitConversions: mock(async () => ({ status: "updated" })),
    },
    catalogRepository: {
      listSpecDefinitions: mock(async () => specPage),
    },
  };
}

describe("PlatformSupplierProductsService", () => {
  test("requires the dedicated permission and uses strict platform reads", async () => {
    const deps = dependencies();
    const { PlatformSupplierProductsService } = await import(
      "./platform-supplier-products"
    );
    const service = new PlatformSupplierProductsService(deps as never);

    await service.listProducts(auth, {
      supplierId: SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });
    await service.getProduct(auth, SUPPLIER_ID, PRODUCT_ID);

    expect(deps.authorization.assertPermission).toHaveBeenCalledTimes(2);
    expect(deps.authorization.assertPermission).toHaveBeenNthCalledWith(
      1,
      auth,
      "platform.supplier-product.manage",
    );
    expect(deps.repository.listPlatformProducts).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });
    expect(deps.repository.findPlatformProduct).toHaveBeenCalledWith(
      SUPPLIER_ID,
      PRODUCT_ID,
    );
  });

  test("builds NULL-tenant platform ownership and actor context", async () => {
    const deps = dependencies();
    const { PlatformSupplierProductsService } = await import(
      "./platform-supplier-products"
    );
    const service = new PlatformSupplierProductsService(deps as never);

    await service.createProduct(auth, SUPPLIER_ID, PRODUCT_ID, {
      product_code: "P-1",
      name: "平台瓷砖",
      category_id: CATEGORY_ID,
      brand_id: BRAND_ID,
    }, "platform-product:create");
    await service.updateProduct(auth, SUPPLIER_ID, PRODUCT_ID, {
      expected_version: 1,
      name: "平台防滑瓷砖",
    }, "platform-product:update");

    const commandContext = {
      tenant_id: null,
      tenant_supplier_id: null,
      supplier_id: SUPPLIER_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
    };
    expect(deps.repository.createPlatformProduct).toHaveBeenCalledWith({
      ...commandContext,
      product_id: PRODUCT_ID,
      product_code: "P-1",
      name: "平台瓷砖",
      category_id: CATEGORY_ID,
      brand_id: BRAND_ID,
      idempotency_key: "platform-product:create",
    });
    expect(deps.repository.updatePlatformProduct).toHaveBeenCalledWith({
      ...commandContext,
      product_id: PRODUCT_ID,
      expected_version: 1,
      name: "平台防滑瓷砖",
      idempotency_key: "platform-product:update",
    });
  });

  test("persists full platform SKU specs, flags and conversion context", async () => {
    const deps = dependencies();
    const { PlatformSupplierProductsService } = await import(
      "./platform-supplier-products"
    );
    const service = new PlatformSupplierProductsService(deps as never);

    await service.createSku(auth, SUPPLIER_ID, PRODUCT_ID, SKU_ID, {
      sku_code: "SKU-1",
      name: "灰色瓷砖",
      purchase_unit_id: CATEGORY_ID,
      batch_managed: true,
      color_managed: true,
      serial_managed: false,
      spec_values: { size: "600×600", colors: ["灰色"] },
    }, "platform-sku:create");
    await service.replaceSkuUnitConversions(
      auth,
      SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
      {
        expected_version: 1,
        conversions: [{
          from_unit_id: CATEGORY_ID,
          to_unit_id: BRAND_ID,
          factor: "8",
        }],
      },
      "platform-sku:conversions",
    );

    expect(deps.repository.createPlatformSku).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: null,
        tenant_supplier_id: null,
        supplier_id: SUPPLIER_ID,
        product_id: PRODUCT_ID,
        sku_id: SKU_ID,
        batch_managed: true,
        color_managed: true,
        serial_managed: false,
        spec_values: { size: "600×600", colors: ["灰色"] },
        actor_user_id: USER_ID,
        actor_employee_id: EMPLOYEE_ID,
      }),
    );
    expect(deps.repository.replaceSkuUnitConversions).toHaveBeenCalledWith({
      ownership_scope: "platform",
      tenant_id: null,
      tenant_supplier_id: null,
      supplier_id: SUPPLIER_ID,
      product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      expected_version: 1,
      conversions: [{
        from_unit_id: CATEGORY_ID,
        to_unit_id: BRAND_ID,
        factor: "8",
      }],
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "platform-sku:conversions",
    });
  });

  test("treats tenant-owned product ids as not found", async () => {
    const deps = dependencies();
    deps.repository.findPlatformProduct.mockResolvedValueOnce(null);
    const { PlatformSupplierProductsService } = await import(
      "./platform-supplier-products"
    );
    const service = new PlatformSupplierProductsService(deps as never);

    await expect(service.getProduct(auth, SUPPLIER_ID, PRODUCT_ID))
      .rejects.toMatchObject({
        statusCode: 404,
        code: "SUPPLIER_PRODUCT_NOT_FOUND",
      });
  });

  test("rejects a non-platform context even when it carries the permission", async () => {
    const deps = dependencies();
    deps.authorization.assertPlatformSession.mockResolvedValueOnce({
      ...auth,
      isPlatformAdmin: false,
      isPlatformStaff: false,
      roleCodes: [],
    });
    const { PlatformSupplierProductsService } = await import(
      "./platform-supplier-products"
    );
    const service = new PlatformSupplierProductsService(deps as never);

    await expect(service.listProducts({
      ...auth,
      isPlatformStaff: false,
      roleCodes: [],
    }, {
      supplierId: SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(deps.repository.listPlatformProducts).not.toHaveBeenCalled();
  });

  test("preserves platform superadmin privilege without an explicit permission", async () => {
    const deps = dependencies();
    const superAdmin = {
      ...auth,
      isPlatformAdmin: true,
      isPlatformSuperAdmin: true,
      roleCodes: ["platform_admin"],
      permissions: [],
    };
    deps.authorization.assertPlatformSession.mockResolvedValueOnce(superAdmin);
    const { PlatformSupplierProductsService } = await import(
      "./platform-supplier-products"
    );
    const service = new PlatformSupplierProductsService(deps as never);

    await service.listProducts(superAdmin, {
      supplierId: SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });

    expect(deps.authorization.assertPermission).toHaveBeenCalledWith(
      superAdmin,
      "platform.supplier-product.manage",
    );
    expect(deps.repository.listPlatformProducts).toHaveBeenCalledTimes(1);
  });

  test("reads platform conversion edges and validates specs with platform templates", async () => {
    const deps = dependencies();
    const { PlatformSupplierProductsService } = await import(
      "./platform-supplier-products"
    );
    const service = new PlatformSupplierProductsService(deps as never);

    expect(await service.listSkuUnitConversions(
      auth,
      SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
    )).toBe(conversions);
    expect(deps.repository.listPlatformSkuUnitConversions).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      sku_id: SKU_ID,
    });

    await expect(service.createSku(auth, SUPPLIER_ID, PRODUCT_ID, SKU_ID, {
      sku_code: "SKU-invalid",
      name: "错误枚举 SKU",
      purchase_unit_id: CATEGORY_ID,
      batch_managed: false,
      color_managed: false,
      serial_managed: false,
      spec_values: { color: "红色" },
    }, "platform-sku:invalid")).rejects.toMatchObject({
      code: "SPEC_TEMPLATE_VALIDATION_ERROR",
    });
    expect(deps.catalogRepository.listSpecDefinitions).toHaveBeenCalledWith(
      CATEGORY_ID,
      { page: 1, pageSize: 100, status: "active" },
      { kind: "platform" },
    );
  });
});

const auth: AuthContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: false,
  isPlatformStaff: true,
  isPlatformSuperAdmin: false,
  adminAuthVersion: 1,
  employeeName: "平台商品管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_staff"],
  roles: [],
  permissions: [{
    code: "platform.supplier-product.manage",
    scope: "all" as const,
  }],
};

const page = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const product = {
  id: PRODUCT_ID,
  ownership_scope: "platform",
  owner_tenant_id: null,
  category: { id: CATEGORY_ID },
};

const specPage = {
  list: [
    {
      code: "size",
      value_type: "text",
      enum_options: [],
      unit_dimension: null,
      is_required: false,
    },
    {
      code: "colors",
      value_type: "multi_enum",
      enum_options: ["灰色"],
      unit_dimension: null,
      is_required: false,
    },
    {
      code: "color",
      value_type: "single_enum",
      enum_options: ["灰色"],
      unit_dimension: null,
      is_required: false,
    },
  ],
  pagination: { page: 1, pageSize: 100, total: 3, totalPages: 1 },
};

const conversions = [{
  from_unit_id: CATEGORY_ID,
  to_unit_id: BRAND_ID,
  factor: "8.000000",
  from_unit: {
    id: CATEGORY_ID,
    code: "BOX",
    name: "箱",
    symbol: "箱",
    unit_dimension: "count",
  },
  to_unit: {
    id: BRAND_ID,
    code: "PIECE",
    name: "片",
    symbol: "片",
    unit_dimension: "count",
  },
}];
