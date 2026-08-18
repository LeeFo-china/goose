import { describe, expect, mock, test } from "bun:test";

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
      findProduct: mock(async () => ({ id: PRODUCT_ID })),
      listSkus: mock(async () => page),
      createProduct: mock(async () => ({
        status: "created",
        product: { id: PRODUCT_ID },
      })),
      updateProduct: mock(async (input: unknown) => input),
      createSku: mock(async () => ({ status: "created" })),
      updateSku: mock(async (input: unknown) => input),
      mutateProduct: mock(async () => ({ status: "updated" })),
      mutateSku: mock(async () => ({ status: "updated" })),
    },
  };
}

describe("SupplierProductsService", () => {
  test("derives supplier id from the tenant relationship for lists", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await service.listProducts({} as never, {
      tenantSupplierId: TENANT_SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });

    expect(deps.repository.listProducts).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    });
  });

  test("passes the trusted tenant to product details and SKU lists", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await service.getProduct(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
    );
    await service.listSkus(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      { page: 1, pageSize: 20 },
    );

    expect(deps.repository.findProduct).toHaveBeenCalledWith(
      SUPPLIER_ID,
      PRODUCT_ID,
      TENANT_ID,
    );
    expect(deps.repository.listSkus).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    });
  });

  test("maps product creates to immutable proxy audit context", async () => {
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
        proxy_reason: "供应商资料代录",
      },
      "product:create",
    );

    expect(deps.repository.createProduct).toHaveBeenCalledWith({
      product_id: PRODUCT_ID,
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      product_code: "P-1",
      name: "瓷砖",
      category_id: CATEGORY_ID,
      brand_id: BRAND_ID,
      description: null,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "product:create",
      proxy_reason: "供应商资料代录",
    });
  });

  test("never forwards tenant or auth fields from ordinary updates", async () => {
    const deps = dependencies();
    const { SupplierProductsService } = await import("./supplier-products");
    const service = new SupplierProductsService(deps as never);

    await service.updateProduct(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      {
        expected_version: 2,
        name: "防滑瓷砖",
        proxy_reason: "供应商书面变更",
      },
    );

    expect(deps.repository.updateProduct).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      product_id: PRODUCT_ID,
      expected_version: 2,
      name: "防滑瓷砖",
      acting_tenant_id: TENANT_ID,
      acting_employee_id: EMPLOYEE_ID,
      operation_source: "tenant_proxy",
      proxy_reason: "供应商书面变更",
      updated_by_employee_id: EMPLOYEE_ID,
      updated_at: expect.any(String),
    });
  });

  test("keeps the parent product id in SKU update and lifecycle commands", async () => {
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
        proxy_reason: "供应商书面变更",
      },
    );
    await service.mutateSku(
      {} as never,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
      "activate",
      {
        expected_version: 3,
        proxy_reason: "供应商确认启用",
      },
      "sku:activate",
    );

    expect(deps.repository.updateSku).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_id: SUPPLIER_ID,
        tenant_id: TENANT_ID,
        supplier_product_id: PRODUCT_ID,
        sku_id: SKU_ID,
      }),
    );
    expect(deps.repository.mutateSku).toHaveBeenCalledWith({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      action: "activate",
      expected_version: 3,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "sku:activate",
      proxy_reason: "供应商确认启用",
    });
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
