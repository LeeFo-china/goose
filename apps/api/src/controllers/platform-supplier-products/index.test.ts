import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "90000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "90000000-0000-4000-8000-000000000002";
const SKU_ID = "90000000-0000-4000-8000-000000000003";
const UNIT_ID = "90000000-0000-4000-8000-000000000004";
const TARGET_UNIT_ID = "90000000-0000-4000-8000-000000000005";
const auth = { employeeId: "90000000-0000-4000-8000-000000000006" };

const updateProduct = mock(async (..._args: unknown[]) => ({ status: "updated" }));
const replaceSkuUnitConversions = mock(async (..._args: unknown[]) => ({
  status: "updated",
}));
const listSkuUnitConversions = mock(async (..._args: unknown[]) => []);

mock.module("@/services/platform-supplier-products", () => ({
  platformSupplierProductsService: {
    listProducts: mock(async () => ({})),
    getProduct: mock(async () => ({})),
    createProduct: mock(async () => ({})),
    updateProduct,
    mutateProduct: mock(async () => ({})),
    listSkus: mock(async () => ({})),
    createSku: mock(async () => ({})),
    updateSku: mock(async () => ({})),
    mutateSku: mock(async () => ({})),
    listSkuUnitConversions,
    replaceSkuUnitConversions,
  },
}));

const requirePlatformPermission = mock(async () => auth);

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredPlatformPermissionContext", {
    configurable: true,
    value: requirePlatformPermission,
  });
  return value;
}

describe("PlatformSupplierProductsController", () => {
  beforeEach(() => {
    updateProduct.mockClear();
    replaceSkuUnitConversions.mockClear();
    listSkuUnitConversions.mockClear();
    requirePlatformPermission.mockClear();
  });

  test("registers the complete platform product and SKU command surface", async () => {
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
      path: "/platform/supplier-products",
    });
    expect(routes).toContainEqual({
      method: "GET",
      path: "/platform/supplier-products/:id",
    });
    expect(routes).toContainEqual({
      method: "POST",
      path: "/platform/supplier-products/:id",
    });
    expect(routes).toContainEqual({
      method: "GET",
      path: "/platform/supplier-products/:id/skus/:skuId/unit-conversions",
    });
    expect(routes).toContainEqual({
      method: "PUT",
      path: "/platform/supplier-products/:id/skus/:skuId/unit-conversions",
    });
  });

  test("forwards platform conversion reads through the manage boundary", async () => {
    const value = await controller() as unknown as {
      listSkuUnitConversions: (request: unknown) => Promise<unknown>;
    };

    await value.listSkuUnitConversions({
      params: { id: PRODUCT_ID, skuId: SKU_ID },
      query: { supplierId: SUPPLIER_ID },
    });

    expect(requirePlatformPermission).toHaveBeenCalledWith(
      expect.anything(),
      "platform.supplier-product.manage",
    );
    expect(listSkuUnitConversions).toHaveBeenCalledWith(
      auth,
      SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
    );
  });

  test("requires dedicated permission and idempotency for updates", async () => {
    const value = await controller() as unknown as {
      updateProduct: (request: unknown) => Promise<unknown>;
    };
    expect(typeof value.updateProduct).toBe("function");

    await value.updateProduct({
      params: { id: PRODUCT_ID },
      query: { supplierId: SUPPLIER_ID },
      body: { expected_version: 2, name: "平台防滑瓷砖" },
      headers: { "idempotency-key": "platform-product:update" },
    });

    expect(requirePlatformPermission).toHaveBeenCalledWith(
      expect.anything(),
      "platform.supplier-product.manage",
    );
    expect(updateProduct).toHaveBeenCalledWith(
      auth,
      SUPPLIER_ID,
      PRODUCT_ID,
      { expected_version: 2, name: "平台防滑瓷砖" },
      "platform-product:update",
    );
  });

  test("forwards platform conversion writes with no tenant input", async () => {
    const value = await controller() as unknown as {
      replaceSkuUnitConversions: (request: unknown) => Promise<unknown>;
    };
    expect(typeof value.replaceSkuUnitConversions).toBe("function");

    await value.replaceSkuUnitConversions({
      params: { id: PRODUCT_ID, skuId: SKU_ID },
      query: { supplierId: SUPPLIER_ID },
      body: {
        expected_version: 3,
        conversions: [{
          from_unit_id: UNIT_ID,
          to_unit_id: TARGET_UNIT_ID,
          factor: "8",
        }],
      },
      headers: { "idempotency-key": "platform-sku:conversions" },
    });

    expect(replaceSkuUnitConversions).toHaveBeenCalledWith(
      auth,
      SUPPLIER_ID,
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
      "platform-sku:conversions",
    );
  });

  test("is registered by the API route registry", async () => {
    const routesSource = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();

    expect(routesSource).toContain(
      'import PlatformSupplierProductsController from "@/controllers/platform-supplier-products";',
    );
    expect(routesSource).toContain(
      "PlatformSupplierProductsController.registerExtraRoutes(app);",
    );
  });
});
