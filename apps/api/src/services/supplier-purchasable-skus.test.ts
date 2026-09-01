import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "4a000000-0000-4000-8000-000000000001";
const TENANT_SUPPLIER_ID = "4a000000-0000-4000-8000-000000000002";
const SUPPLIER_ID = "4a000000-0000-4000-8000-000000000003";
const PRODUCT_ID = "4a000000-0000-4000-8000-000000000004";
const SKU_ID = "4a000000-0000-4000-8000-000000000005";
const USER_ID = "4a000000-0000-4000-8000-000000000006";
const EMPLOYEE_ID = "4a000000-0000-4000-8000-000000000007";
const CATEGORY_ID = "4a000000-0000-4000-8000-000000000008";
const UNIT_ID = "4a000000-0000-4000-8000-000000000009";
const PRICE_LIST_ID = "4a000000-0000-4000-8000-00000000000a";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const auth: AuthContext = {
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
  permissions: [
    { code: "supplier.product.manage", scope: "all" },
    { code: "supplier.cost-price.view", scope: "all" },
  ],
};

const scope = {
  tenantId: TENANT_ID,
  tenantSupplierId: TENANT_SUPPLIER_ID,
  supplierId: SUPPLIER_ID,
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
};

const product = {
  id: PRODUCT_ID,
  supplier_id: SUPPLIER_ID,
  ownership_scope: "tenant",
  owner_tenant_id: TENANT_ID,
  category: { id: CATEGORY_ID },
};

const sku = {
  id: SKU_ID,
  supplier_id: SUPPLIER_ID,
  supplier_product_id: PRODUCT_ID,
  ownership_scope: "tenant",
  owner_tenant_id: TENANT_ID,
  status: "active",
  version: 4,
};

const emptyPriceContext = {
  currency: "CNY",
  recommended_tax_rate: "0.13",
  recommended_tax_inclusive: false,
  next_scheduled_effective_from: null,
  current_price: null,
} as const;

describe("SupplierPurchasableSkusService", () => {
  test("gets defaults after composite access and canonicalizes query, path, and scope UUIDs", async () => {
    const calls: string[] = [];
    const access = {
      requirePurchasableSkuPriceRead: mock(async (
        _auth: AuthContext,
        tenantSupplierId: string,
      ) => {
        calls.push("access");
        expect(tenantSupplierId).toBe(TENANT_SUPPLIER_ID);
        return uppercaseUuidValues(scope);
      }),
    };
    const supplierProductsRepository = {
      findProduct: mock(async (...args: unknown[]) => {
        calls.push("product");
        expect(args).toEqual([SUPPLIER_ID, PRODUCT_ID, TENANT_ID, false]);
        return uppercaseUuidValues(product);
      }),
    };
    const repository = {
      getPriceDefaults: mock(async (input: unknown) => {
        calls.push("price");
        expect(input).toEqual({
          tenant_id: TENANT_ID,
          tenant_supplier_id: TENANT_SUPPLIER_ID,
          supplier_id: SUPPLIER_ID,
          supplier_product_id: PRODUCT_ID,
        });
        return emptyPriceContext;
      }),
      getCurrentPrice: mock(),
      findTenantSkuIdentity: mock(),
    };
    const { SupplierPurchasableSkusService } = await import(
      "./supplier-purchasable-skus"
    );
    const service = new SupplierPurchasableSkusService({
      access,
      supplierProductsRepository,
      repository,
    } as never);

    await expect(service.getPriceDefaults(
      auth,
      TENANT_SUPPLIER_ID.toUpperCase(),
      PRODUCT_ID.toUpperCase(),
    )).resolves.toEqual(emptyPriceContext);
    expect(calls).toEqual(["access", "product", "price"]);
    expect(access.requirePurchasableSkuPriceRead).toHaveBeenCalledTimes(1);
  });

  test("never falls back to product-only permission when composite access is denied", async () => {
    const denied = Object.assign(new Error("无权限"), {
      code: "FORBIDDEN",
      statusCode: 403,
    });
    const access = {
      requirePurchasableSkuPriceRead: mock(async () => {
        throw denied;
      }),
    };
    const supplierProductsRepository = { findProduct: mock() };
    const repository = {
      getPriceDefaults: mock(),
      getCurrentPrice: mock(),
      findTenantSkuIdentity: mock(),
    };
    const { SupplierPurchasableSkusService } = await import(
      "./supplier-purchasable-skus"
    );

    await expect(new SupplierPurchasableSkusService({
      access,
      supplierProductsRepository,
      repository,
    } as never).getPriceDefaults(
      auth,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
    )).rejects.toBe(denied);
    expect(supplierProductsRepository.findProduct).not.toHaveBeenCalled();
    expect(repository.getPriceDefaults).not.toHaveBeenCalled();
  });

  test.each([
    ["missing", null, "SUPPLIER_PRODUCT_NOT_FOUND"],
    ["wrong ID", { ...product, id: SKU_ID }, "SUPPLIER_PRODUCT_NOT_FOUND"],
    ["wrong supplier", {
      ...product,
      supplier_id: SKU_ID,
    }, "SUPPLIER_PRODUCT_NOT_FOUND"],
    ["foreign tenant", {
      ...product,
      owner_tenant_id: SKU_ID,
    }, "SUPPLIER_PRODUCT_NOT_FOUND"],
    ["platform-owned", {
      ...product,
      ownership_scope: "platform",
      owner_tenant_id: null,
    }, "SHARED_RESOURCE_READ_ONLY"],
  ])("rejects a %s product before the price read", async (
    _label,
    foundProduct,
    expectedCode,
  ) => {
    const repository = {
      getPriceDefaults: mock(),
      getCurrentPrice: mock(),
      findTenantSkuIdentity: mock(),
    };
    const { SupplierPurchasableSkusService } = await import(
      "./supplier-purchasable-skus"
    );
    const service = new SupplierPurchasableSkusService({
      access: { requirePurchasableSkuPriceRead: mock(async () => scope) },
      supplierProductsRepository: {
        findProduct: mock(async () => foundProduct),
      },
      repository,
    } as never);

    await expect(service.getPriceDefaults(
      auth,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
    )).rejects.toMatchObject({ code: expectedCode });
    expect(repository.getPriceDefaults).not.toHaveBeenCalled();
  });

  test("gets a nullable current price using only server-resolved scope", async () => {
    const calls: string[] = [];
    const access = {
      requirePurchasableSkuPriceRead: mock(async () => {
        calls.push("access");
        return uppercaseUuidValues(scope);
      }),
    };
    const supplierProductsRepository = {
      findProduct: mock(async () => {
        calls.push("product");
        return uppercaseUuidValues(product);
      }),
    };
    const repository = {
      findTenantSkuIdentity: mock(async (input: unknown) => {
        calls.push("sku");
        expect(input).toEqual({
          tenant_id: TENANT_ID,
          tenant_supplier_id: TENANT_SUPPLIER_ID,
          supplier_id: SUPPLIER_ID,
          supplier_product_id: PRODUCT_ID,
          sku_id: SKU_ID,
        });
        return uppercaseUuidValues(sku);
      }),
      getCurrentPrice: mock(async (input: unknown) => {
        calls.push("price");
        expect(input).toEqual({
          tenant_id: TENANT_ID,
          tenant_supplier_id: TENANT_SUPPLIER_ID,
          supplier_id: SUPPLIER_ID,
          supplier_product_id: PRODUCT_ID,
          sku_id: SKU_ID,
        });
        return emptyPriceContext;
      }),
      getPriceDefaults: mock(),
    };
    const { SupplierPurchasableSkusService } = await import(
      "./supplier-purchasable-skus"
    );

    await expect(new SupplierPurchasableSkusService({
      access,
      supplierProductsRepository,
      repository,
    } as never).getCurrentPrice(
      auth,
      TENANT_SUPPLIER_ID.toUpperCase(),
      PRODUCT_ID.toUpperCase(),
      SKU_ID.toUpperCase(),
    )).resolves.toEqual(emptyPriceContext);
    expect(calls).toEqual(["access", "product", "sku", "price"]);
  });

  test.each([
    ["missing", null, "SUPPLIER_SKU_NOT_FOUND"],
    ["wrong ID", { ...sku, id: PRODUCT_ID }, "SUPPLIER_SKU_NOT_FOUND"],
    ["wrong supplier", {
      ...sku,
      supplier_id: PRODUCT_ID,
    }, "SUPPLIER_SKU_NOT_FOUND"],
    ["wrong product", {
      ...sku,
      supplier_product_id: SKU_ID,
    }, "SUPPLIER_SKU_NOT_FOUND"],
    ["foreign tenant", {
      ...sku,
      owner_tenant_id: PRODUCT_ID,
    }, "SUPPLIER_SKU_NOT_FOUND"],
    ["platform-owned", {
      ...sku,
      ownership_scope: "platform",
      owner_tenant_id: null,
    }, "SHARED_RESOURCE_READ_ONLY"],
  ])("rejects a %s SKU before the current-price RPC", async (
    _label,
    foundSku,
    expectedCode,
  ) => {
    const repository = {
      getPriceDefaults: mock(),
      getCurrentPrice: mock(),
      findTenantSkuIdentity: mock(async () => foundSku),
    };
    const { SupplierPurchasableSkusService } = await import(
      "./supplier-purchasable-skus"
    );
    const service = new SupplierPurchasableSkusService({
      access: { requirePurchasableSkuPriceRead: mock(async () => scope) },
      supplierProductsRepository: {
        findProduct: mock(async () => product),
      },
      repository,
    } as never);

    await expect(service.getCurrentPrice(
      auth,
      TENANT_SUPPLIER_ID,
      PRODUCT_ID,
      SKU_ID,
    )).rejects.toMatchObject({ code: expectedCode });
    expect(repository.getCurrentPrice).not.toHaveBeenCalled();
  });
});

describe("SupplierPurchasableSkusService composite writes", () => {
  const specPage = {
    list: [{ code: "size", value_type: "text", enum_options: [],
      unit_dimension: null, is_required: false }],
    pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
  };
  const createBody = {
    sku: {
      name: "净味乳胶漆 18L", purchase_unit_id: UNIT_ID,
      specification: "18L", model: null, batch_managed: false,
      color_managed: false, serial_managed: false,
      spec_values: { size: "18L" },
    },
    price: { unit_price: "318.00", tax_rate: "0.130000",
      tax_inclusive: false },
  };

  test("creates through write access, current template validation, and one composite save", async () => {
    const calls: string[] = [];
    const access = {
      requirePurchasableSkuPriceRead: mock(),
      requirePurchasableSkuWrite: mock(async () => {
        calls.push("access");
        return uppercaseUuidValues(scope);
      }),
    };
    const supplierProductsRepository = { findProduct: mock(async () => {
      calls.push("product");
      return uppercaseUuidValues(product);
    }) };
    const catalogRepository = { listSpecDefinitions: mock(async () => {
      calls.push("specs");
      return specPage;
    }) };
    const saved = { status: "saved", idempotent: false };
    const repository = {
      getPriceDefaults: mock(), getCurrentPrice: mock(),
      findTenantSkuIdentity: mock(), save: mock(async (input: unknown) => {
        calls.push("save");
        expect(input).toEqual({
          action: "create", tenant_id: TENANT_ID,
          tenant_supplier_id: TENANT_SUPPLIER_ID, supplier_id: SUPPLIER_ID,
          supplier_product_id: PRODUCT_ID, supplier_sku_id: SKU_ID,
          expected_sku_version: null,
          sku: { ...createBody.sku, purchase_unit_id: UNIT_ID,
            sku_code: "TS-4A000000000040008000000000000005" },
          price: createBody.price, expected_price_list_id: null,
          expected_price_list_version: null, actor_user_id: USER_ID,
          actor_employee_id: EMPLOYEE_ID, idempotency_key: "sku:create:price",
        });
        return saved;
      }),
    };
    const { SupplierPurchasableSkusService } = await import(
      "./supplier-purchasable-skus"
    );
    const service = new SupplierPurchasableSkusService({
      access, supplierProductsRepository, catalogRepository, repository,
    } as never);

    await expect(service.create(auth, {
      tenantSupplierId: TENANT_SUPPLIER_ID.toUpperCase(),
      productId: PRODUCT_ID.toUpperCase(), skuId: SKU_ID.toUpperCase(),
      body: createBody, idempotencyKey: "sku:create:price",
    })).resolves.toBe(saved as never);
    expect(calls).toEqual(["access", "product", "specs", "save"]);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  test("updates only schema fields with exact SKU and price-list versions", async () => {
    const calls: string[] = [];
    const body = {
      sku: { expected_version: 4, name: "新包装", spec_values: {} },
      price: { unit_price: "299.90", tax_rate: "0.13",
        tax_inclusive: false, expected_price_list_id: PRICE_LIST_ID,
        expected_price_list_version: 6 },
    };
    const repository = {
      getPriceDefaults: mock(), getCurrentPrice: mock(),
      findTenantSkuIdentity: mock(async (input: unknown) => {
        calls.push("sku");
        expect(input).toMatchObject({ sku_id: SKU_ID,
          supplier_product_id: PRODUCT_ID });
        return uppercaseUuidValues(sku);
      }),
      save: mock(async (input: unknown) => {
        calls.push("save");
        expect(input).toMatchObject({
          action: "update", expected_sku_version: 4,
          sku: { name: "新包装", spec_values: {} },
          price: { unit_price: "299.90", tax_rate: "0.13",
            tax_inclusive: false },
          expected_price_list_id: PRICE_LIST_ID,
          expected_price_list_version: 6,
          actor_user_id: USER_ID, actor_employee_id: EMPLOYEE_ID,
        });
        expect((input as { sku: object }).sku).not.toHaveProperty("sku_code");
        expect((input as { sku: object }).sku).not.toHaveProperty(
          "purchase_unit_id",
        );
        return { status: "saved" };
      }),
    };
    const { SupplierPurchasableSkusService } = await import(
      "./supplier-purchasable-skus"
    );
    const service = new SupplierPurchasableSkusService({
      access: {
        requirePurchasableSkuPriceRead: mock(),
        requirePurchasableSkuWrite: mock(async () => {
          calls.push("access"); return scope;
        }),
      },
      supplierProductsRepository: { findProduct: mock(async () => {
        calls.push("product"); return product;
      }) },
      catalogRepository: { listSpecDefinitions: mock(async () => {
        calls.push("specs"); return specPage;
      }) },
      repository,
    } as never);

    await service.update(auth, {
      tenantSupplierId: TENANT_SUPPLIER_ID, productId: PRODUCT_ID,
      skuId: SKU_ID, body, idempotencyKey: "sku:update:price",
    });
    expect(calls).toEqual(["access", "product", "sku", "specs", "save"]);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  test("stops before all resource reads when composite write access is denied", async () => {
    const denied = Errors.forbidden();
    const repository = { getPriceDefaults: mock(), getCurrentPrice: mock(),
      findTenantSkuIdentity: mock(), save: mock() };
    const supplierProductsRepository = { findProduct: mock() };
    const { SupplierPurchasableSkusService } = await import(
      "./supplier-purchasable-skus"
    );
    const service = new SupplierPurchasableSkusService({
      access: { requirePurchasableSkuPriceRead: mock(),
        requirePurchasableSkuWrite: mock(async () => { throw denied; }) },
      supplierProductsRepository, repository,
      catalogRepository: { listSpecDefinitions: mock() },
    } as never);
    await expect(service.create(auth, {
      tenantSupplierId: TENANT_SUPPLIER_ID, productId: PRODUCT_ID,
      skuId: SKU_ID, body: createBody, idempotencyKey: "denied",
    })).rejects.toBe(denied);
    expect(supplierProductsRepository.findProduct).not.toHaveBeenCalled();
    expect(repository.findTenantSkuIdentity).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});

function uppercaseUuidValues(value: unknown): unknown {
  if (typeof value === "string") {
    return UUID_PATTERN.test(value) ? value.toUpperCase() : value;
  }
  if (Array.isArray(value)) return value.map(uppercaseUuidValues);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    uppercaseUuidValues(item),
  ]));
}
