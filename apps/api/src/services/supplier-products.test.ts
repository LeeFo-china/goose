import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_SUPPLIER_ID = "60000000-0000-4000-8000-000000000001";
const TENANT_ID = "60000000-0000-4000-8000-000000000002";
const SUPPLIER_ID = "60000000-0000-4000-8000-000000000003";
const USER_ID = "60000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "60000000-0000-4000-8000-000000000005";
const PRODUCT_ID = "60000000-0000-4000-8000-000000000006";
const CATEGORY_ID = "60000000-0000-4000-8000-000000000007";
const BRAND_ID = "60000000-0000-4000-8000-000000000008";
const SKU_ID = "60000000-0000-4000-8000-000000000009";

function dependencies() {
  return {
    access: {
      requireProductRead: mock(async () => scope),
      requireProductWrite: mock(async () => scope),
    },
    repository: {
      listProducts: mock(async () => page),
      findProduct: mock(async () => product),
      listSkus: mock(async () => page),
      listSkuUnitConversions: mock(async () => conversions),
      createProduct: mock(async (_input: unknown) => ({
        status: "created",
        product: { id: PRODUCT_ID },
      })),
      updateProduct: mock(async (input: unknown) => input),
      createSku: mock(async (_input: unknown) => ({ status: "created" })),
      updateSku: mock(async (input: unknown) => input),
      mutateProduct: mock(async () => ({ status: "updated" })),
      mutateSku: mock(async () => ({ status: "updated" })),
      replaceSkuUnitConversions: mock(async () => ({ status: "updated" })),
    },
    catalogRepository: {
      listSpecDefinitions: mock(async () => specPage),
    },
  };
}

describe("SupplierProductsService", () => {
  test("derives supplier and tenant from the relationship for merged lists", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await service.listProducts({} as never, {
      tenantSupplierId: TENANT_SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });

    expect(deps.access.requireProductRead).toHaveBeenCalledWith(
      {},
      TENANT_SUPPLIER_ID,
    );
    expect(deps.repository.listProducts).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    });
  });

  test("builds immutable tenant ownership and actor context for creates", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await service.createProduct(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      {
        product_code: "P-1",
        name: "瓷砖",
        category_id: CATEGORY_ID,
        brand_id: BRAND_ID,
        description: null,
        proxy_reason: "不得进入 command",
      } as never,
      "product:create",
    );

    expect(deps.repository.createProduct).toHaveBeenCalledWith({
      product_id: PRODUCT_ID,
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      product_code: "P-1",
      name: "瓷砖",
      category_id: CATEGORY_ID,
      brand_id: BRAND_ID,
      description: null,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "product:create",
    });
    expect(deps.repository.createProduct.mock.calls[0]![0])
      .not.toHaveProperty("proxy_reason");
  });

  test("uses an idempotent v2 command context for ordinary updates", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await service.updateProduct(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      { expected_version: 2, name: "防滑瓷砖" },
      "product:update",
    );

    expect(deps.repository.updateProduct).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      product_id: PRODUCT_ID,
      expected_version: 2,
      name: "防滑瓷砖",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "product:update",
    });
  });

  test("preserves the category migration conflict returned by the repository", async () => {
    const deps = dependencies();
    deps.repository.updateProduct.mockRejectedValueOnce(Object.assign(
      new Error("商品已有 SKU，变更分类前必须先迁移 SKU 规格"),
      {
        statusCode: 409,
        code: "PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION",
      },
    ));
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await expect(service.updateProduct(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      { expected_version: 1, category_id: CATEGORY_ID },
      "product:category",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "PRODUCT_CATEGORY_CHANGE_REQUIRES_SKU_MIGRATION",
    });
  });

  test("turns tenant update version conflicts into error-factory responses", async () => {
    const deps = dependencies();
    deps.repository.updateProduct.mockResolvedValueOnce({
      status: "version_conflict",
      error_code: "SUPPLIER_PRODUCT_VERSION_CONFLICT",
      version: 3,
    });
    deps.repository.updateSku.mockResolvedValueOnce({
      status: "version_conflict",
      error_code: "SUPPLIER_SKU_VERSION_CONFLICT",
      version: 4,
    });
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await expect(service.updateProduct(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      { expected_version: 2, name: "冲突商品" },
      "product:conflict",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PRODUCT_VERSION_CONFLICT",
    });
    await expect(service.updateSku(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
      { expected_version: 3, name: "冲突 SKU" },
      "sku:conflict",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_SKU_VERSION_CONFLICT",
    });
  });

  test("keeps the parent and tenant relationship in SKU commands", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await service.updateSku(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
      {
        expected_version: 2,
        name: "防滑瓷砖 SKU",
        spec_values: { size: "600×600" },
      },
      "sku:update",
    );
    await service.mutateSku(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
      "activate",
      {
        expected_version: 3,
        proxy_reason: "旧版生命周期字段不得进入 command",
      } as never,
      "sku:activate",
    );

    expect(deps.repository.updateSku).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id: SUPPLIER_ID,
        tenant_id: TENANT_ID,
        tenant_supplier_id: TENANT_SUPPLIER_ID,
        supplier_product_id: PRODUCT_ID,
        sku_id: SKU_ID,
        idempotency_key: "sku:update",
      }),
    );
    expect(deps.repository.mutateSku).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      action: "activate",
      expected_version: 3,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "sku:activate",
    });
  });

  test("discards a legacy proxy reason from direct tenant SKU creates", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await service.createSku(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
      {
        sku_code: "SKU-LEGACY",
        name: "旧版 SKU",
        purchase_unit_id: CATEGORY_ID,
        batch_managed: false,
        color_managed: false,
        serial_managed: false,
        spec_values: { size: "600×600" },
        proxy_reason: "不得进入 SKU command",
      } as never,
      "sku:legacy-create",
    );

    expect(deps.repository.createSku).toHaveBeenCalledTimes(1);
    expect(deps.repository.createSku.mock.calls[0]![0])
      .not.toHaveProperty("proxy_reason");
  });

  test("builds the full trusted boundary for unit conversion writes", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never) as
      InstanceType<typeof SupplierProductsService> & {
        replaceSkuUnitConversions: (...args: unknown[]) => Promise<unknown>;
      };

    expect(typeof service.replaceSkuUnitConversions).toBe("function");
    await service.replaceSkuUnitConversions(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
      {
        expected_version: 3,
        conversions: [{
          from_unit_id: CATEGORY_ID,
          to_unit_id: BRAND_ID,
          factor: "8",
        }],
      },
      "sku:conversions",
    );

    expect(deps.repository.replaceSkuUnitConversions).toHaveBeenCalledWith({
      ownership_scope: "tenant",
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      supplier_id: SUPPLIER_ID,
      product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      expected_version: 3,
      conversions: [{
        from_unit_id: CATEGORY_ID,
        to_unit_id: BRAND_ID,
        factor: "8",
      }],
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "sku:conversions",
    });
  });

  test("reads conversion edges only after relationship and SKU scope validation", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    const result = await service.listSkuUnitConversions(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
    );

    expect(result).toBe(conversions);
    expect(deps.access.requireProductRead).toHaveBeenCalledWith(
      {},
      TENANT_SUPPLIER_ID,
    );
    expect(deps.repository.listSkuUnitConversions).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      tenant_id: TENANT_ID,
    });
  });

  test("loads the active category template and rejects invalid SKU specs before RPC", async () => {
    const deps = dependencies();
    deps.catalogRepository.listSpecDefinitions.mockResolvedValueOnce({
      ...specPage,
      list: [{ ...specPage.list[0]!, is_required: true }],
    });
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await expect(service.createSku(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
      {
        sku_code: "SKU-1",
        name: "无规格 SKU",
        purchase_unit_id: CATEGORY_ID,
        batch_managed: false,
        color_managed: false,
        serial_managed: false,
        spec_values: {},
      },
      "sku:create-invalid",
    )).rejects.toMatchObject({ code: "SPEC_TEMPLATE_VALIDATION_ERROR" });

    expect(deps.catalogRepository.listSpecDefinitions).toHaveBeenCalledWith(
      CATEGORY_ID,
      { page: 1, pageSize: 100, status: "active" },
      { kind: "tenant", tenantId: TENANT_ID },
    );
    expect(deps.repository.createSku).not.toHaveBeenCalled();
  });
});

const scope = {
  tenantId: TENANT_ID,
  tenantSupplierId: TENANT_SUPPLIER_ID,
  supplierId: SUPPLIER_ID,
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
};

const page = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

const product = {
  id: PRODUCT_ID,
  ownership_scope: "tenant",
  owner_tenant_id: TENANT_ID,
  category: { id: CATEGORY_ID },
};

const specPage = {
  list: [{
    code: "size",
    value_type: "text",
    enum_options: [],
    unit_dimension: null,
    is_required: false,
  }],
  pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
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
