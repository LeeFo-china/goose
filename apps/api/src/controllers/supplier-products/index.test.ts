import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "80000000-0000-4000-8000-000000000001";
const TENANT_SUPPLIER_ID = "80000000-0000-4000-8000-000000000002";
const PRODUCT_ID = "80000000-0000-4000-8000-000000000003";
const SKU_ID = "80000000-0000-4000-8000-000000000004";
const UNIT_ID = "80000000-0000-4000-8000-000000000005";
const TARGET_UNIT_ID = "80000000-0000-4000-8000-000000000006";

const updateProduct = mock(async (..._args: unknown[]) => ({ status: "updated" }));
const createProduct = mock(async (..._args: unknown[]) => ({ status: "created" }));
const createSku = mock(async (..._args: unknown[]) => ({ status: "created" }));
const mutateProduct = mock(async (..._args: unknown[]) => ({ status: "updated" }));
const mutateSku = mock(async (..._args: unknown[]) => ({ status: "updated" }));
const replaceSkuUnitConversions = mock(async (..._args: unknown[]) => ({
  status: "updated",
}));
const listSkuUnitConversions = mock(async (..._args: unknown[]) => []);

mock.module("@/services/supplier-products", () => ({
  supplierProductsService: {
    listProducts: mock(async () => ({})),
    getProduct: mock(async () => ({})),
    createProduct,
    updateProduct,
    mutateProduct,
    listSkus: mock(async () => ({})),
    createSku,
    updateSku: mock(async () => ({})),
    mutateSku,
    listSkuUnitConversions,
    replaceSkuUnitConversions,
  },
}));

const auth = { tenantId: TENANT_ID };

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

describe("SupplierProductsController", () => {
  beforeEach(() => {
    updateProduct.mockClear();
    createProduct.mockClear();
    createSku.mockClear();
    mutateProduct.mockClear();
    mutateSku.mockClear();
    replaceSkuUnitConversions.mockClear();
    listSkuUnitConversions.mockClear();
  });

  test("discards legacy proxy reasons before tenant create and lifecycle services", async () => {
    const value = await controller() as unknown as {
      createProduct: (request: unknown) => Promise<unknown>;
      createSku: (request: unknown) => Promise<unknown>;
      activateProduct: (request: unknown) => Promise<unknown>;
      activateSku: (request: unknown) => Promise<unknown>;
    };
    const headers = { "idempotency-key": "legacy-admin" };
    const query = { tenantSupplierId: TENANT_SUPPLIER_ID };

    await value.createProduct({
      params: { id: PRODUCT_ID },
      query,
      headers,
      body: {
        product_code: "P-LEGACY",
        name: "旧版商品",
        category_id: UNIT_ID,
        brand_id: TARGET_UNIT_ID,
        proxy_reason: "旧版商品代录原因",
      },
    });
    await value.createSku({
      params: { id: PRODUCT_ID, skuId: SKU_ID },
      query,
      headers,
      body: {
        sku_code: "SKU-LEGACY",
        name: "旧版 SKU",
        purchase_unit_id: UNIT_ID,
        proxy_reason: "旧版 SKU 代录原因",
      },
    });
    await value.activateProduct({
      params: { id: PRODUCT_ID },
      query,
      headers,
      body: { expected_version: 2, proxy_reason: "旧版商品启用原因" },
    });
    await value.activateSku({
      params: { id: PRODUCT_ID, skuId: SKU_ID },
      query,
      headers,
      body: { expected_version: 2, proxy_reason: "旧版 SKU 启用原因" },
    });

    for (const serviceMock of [
      createProduct,
      createSku,
      mutateProduct,
      mutateSku,
    ]) {
      expect(serviceMock.mock.calls[0]).not.toContainEqual(
        expect.objectContaining({ proxy_reason: expect.anything() }),
      );
    }
  });

  test("registers tenant conversion replacement route", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];
    value.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
      put: (path: string) => routes.push({ method: "PUT", path }),
    } as never);

    expect(routes).toContainEqual({
      method: "GET",
      path: "/supplier-products/:id/skus/:skuId/unit-conversions",
    });
    expect(routes).toContainEqual({
      method: "PUT",
      path: "/supplier-products/:id/skus/:skuId/unit-conversions",
    });
  });

  test("forwards tenant conversion reads without requiring an idempotency key", async () => {
    const value = await controller() as unknown as {
      listSkuUnitConversions: (request: unknown) => Promise<unknown>;
    };

    await value.listSkuUnitConversions({
      params: { id: PRODUCT_ID, skuId: SKU_ID },
      query: { tenantSupplierId: TENANT_SUPPLIER_ID },
      headers: {},
    });

    expect(listSkuUnitConversions).toHaveBeenCalledWith(
      auth,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
    );
  });

  test("requires idempotency for ordinary product updates", async () => {
    const value = await controller();
    const request = {
      params: { id: PRODUCT_ID },
      query: { tenantSupplierId: TENANT_SUPPLIER_ID },
      body: { expected_version: 2, name: "防滑瓷砖" },
      headers: { "idempotency-key": "product:update" },
    };

    await value.updateProduct(request as never);

    expect(updateProduct).toHaveBeenCalledWith(
      auth,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      { expected_version: 2, name: "防滑瓷砖" },
      "product:update",
    );
  });

  test("validates and forwards versioned unit conversions", async () => {
    const value = await controller() as unknown as {
      replaceSkuUnitConversions: (request: unknown) => Promise<unknown>;
    };
    expect(typeof value.replaceSkuUnitConversions).toBe("function");

    await value.replaceSkuUnitConversions({
      params: { id: PRODUCT_ID, skuId: SKU_ID },
      query: { tenantSupplierId: TENANT_SUPPLIER_ID },
      body: {
        expected_version: 3,
        conversions: [{
          from_unit_id: UNIT_ID,
          to_unit_id: TARGET_UNIT_ID,
          factor: "8",
        }],
      },
      headers: { "idempotency-key": "sku:conversions" },
    });

    expect(replaceSkuUnitConversions).toHaveBeenCalledWith(
      auth,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
      {
        expected_version: 3,
        conversions: [{
          from_unit_id: UNIT_ID,
          to_unit_id: TARGET_UNIT_ID,
          factor: "8",
        }],
      },
      "sku:conversions",
    );
  });
});
