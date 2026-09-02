import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import {
  EMPLOYEE_ID,
  PRICE_LIST_ID,
  PRODUCT_ID,
  SKU_ID,
  SUPPLIER_ID,
  TENANT_ID,
  TENANT_SUPPLIER_ID,
  UNIT_ID,
  USER_ID,
  auth,
  product,
  scope,
  sku,
  uppercaseUuidValues,
} from "./supplier-purchasable-skus-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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
    const gapSaved = {
      status: "saved",
      idempotent: false,
      price_version_created: false,
      current_price: { effective_until: "2026-09-09T00:00:00Z" },
      next_scheduled_effective_from: "2026-09-10T00:00:00Z",
    } as const;
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
        return gapSaved;
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

    await expect(service.update(auth, {
      tenantSupplierId: TENANT_SUPPLIER_ID, productId: PRODUCT_ID,
      skuId: SKU_ID, body, idempotencyKey: "sku:update:price",
    })).resolves.toBe(gapSaved as never);
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
