import { beforeEach, describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type {
  SupplierPurchasableProductCreatedResult,
} from "@/repositories/supplier-purchasable-product-records";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "A1000000-0000-4000-8000-000000000001";
const TENANT_SUPPLIER_ID = "B1000000-0000-4000-8000-000000000002";
const SKU_ID = "C1000000-0000-4000-8000-000000000003";
const CATEGORY_ID = "D1000000-0000-4000-8000-000000000004";
const BRAND_ID = "E1000000-0000-4000-8000-000000000005";
const UNIT_ID = "F1000000-0000-4000-8000-000000000006";
const PRODUCT_ID = "a2000000-0000-4000-8000-000000000001";
const PRICE_LIST_ID = "a2000000-0000-4000-8000-000000000002";
const PRICE_ITEM_ID = "a2000000-0000-4000-8000-000000000003";
const NOW = "2026-08-27T08:00:00+00:00";
const auth = {
  authUserId: "a1000000-0000-4000-8000-000000000007",
  employeeId: "a1000000-0000-4000-8000-000000000008",
  tenantId: "a1000000-0000-4000-8000-000000000009",
};
const input = {
  sku_id: SKU_ID,
  product: {
    name: "耐水腻子粉",
    category_id: CATEGORY_ID,
    brand_id: BRAND_ID,
  },
  sku: {
    name: "20kg/袋",
    purchase_unit_id: UNIT_ID,
    spec_values: { color: "白色" },
  },
  price: {
    unit_price: "48.00",
    tax_rate: "0.130000",
    tax_inclusive: true,
  },
};
const created: SupplierPurchasableProductCreatedResult = {
  status: "created",
  idempotent: false,
  product: {
    id: PRODUCT_ID,
    supplier_id: SUPPLIER_ID,
    product_code: "TP-a200000000004000",
    name: input.product.name,
    category_id: CATEGORY_ID,
    brand_id: BRAND_ID,
    description: null,
    status: "active",
    version: 2,
    ownership_scope: "tenant",
    owner_tenant_id: auth.tenantId,
    acting_tenant_id: auth.tenantId,
    acting_employee_id: auth.employeeId,
    operation_source: "tenant",
    proxy_reason: null,
    created_by_employee_id: auth.employeeId,
    updated_by_employee_id: auth.employeeId,
    created_at: NOW,
    updated_at: NOW,
  },
  sku: {
    id: SKU_ID,
    supplier_id: SUPPLIER_ID,
    supplier_product_id: PRODUCT_ID,
    sku_code: "TS-c100000000004000",
    name: input.sku.name,
    specification: null,
    model: null,
    spec_values: input.sku.spec_values,
    purchase_unit_id: UNIT_ID,
    base_unit_id: UNIT_ID,
    base_unit_conversion: 1,
    batch_managed: false,
    color_managed: false,
    serial_managed: false,
    status: "active",
    version: 2,
    ownership_scope: "tenant",
    owner_tenant_id: auth.tenantId,
    acting_tenant_id: auth.tenantId,
    acting_employee_id: auth.employeeId,
    operation_source: "tenant",
    proxy_reason: null,
    created_by_employee_id: auth.employeeId,
    updated_by_employee_id: auth.employeeId,
    created_at: NOW,
    updated_at: NOW,
  },
  price: {
    id: PRICE_ITEM_ID,
    tenant_id: auth.tenantId,
    supplier_id: SUPPLIER_ID,
    supplier_price_list_id: PRICE_LIST_ID,
    supplier_product_id: PRODUCT_ID,
    supplier_sku_id: SKU_ID,
    minimum_quantity: "1.0000",
    maximum_quantity: null,
    purchase_unit_id: UNIT_ID,
    base_unit_id: UNIT_ID,
    base_unit_conversion: "1.00000000",
    unit_price: input.price.unit_price,
    tax_rate: input.price.tax_rate,
    tax_inclusive: input.price.tax_inclusive,
    acting_tenant_id: auth.tenantId,
    acting_employee_id: auth.employeeId,
    operation_source: "tenant",
    proxy_reason: null,
    created_by_employee_id: auth.employeeId,
    updated_by_employee_id: auth.employeeId,
    created_at: NOW,
    updated_at: NOW,
  },
  catalog_item: {
    supplier_product_id: PRODUCT_ID,
    product_code: "TP-a200000000004000",
    product_name: input.product.name,
    supplier_sku_id: SKU_ID,
    sku_code: "TS-c100000000004000",
    sku_name: input.sku.name,
    specification: null,
    model: null,
    supplier_price_list_id: PRICE_LIST_ID,
    price_list_code: "DEFAULT",
    price_list_version: 1,
    effective_from: NOW,
    effective_until: null,
    supplier_price_list_item_id: PRICE_ITEM_ID,
    purchase_unit_id: UNIT_ID,
    purchase_unit_code: "BAG",
    purchase_unit_name: "袋",
    purchase_unit_symbol: "袋",
    base_unit_id: UNIT_ID,
    base_unit_code: "BAG",
    base_unit_name: "袋",
    base_unit_symbol: "袋",
    base_unit_conversion: "1.00000000",
    unit_price: input.price.unit_price,
    tax_rate: input.price.tax_rate,
    tax_inclusive: input.price.tax_inclusive,
  },
};

const create = mock(async () => created);

mock.module("@/services/supplier-purchasable-products", () => ({
  supplierPurchasableProductsService: { create },
}));

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

function validRequest() {
  return {
    params: { id: SUPPLIER_ID },
    query: { tenantSupplierId: TENANT_SUPPLIER_ID },
    headers: { "idempotency-key": "purchasable-product:create" },
    body: input,
  };
}

describe("SupplierPurchasableProductsController", () => {
  beforeEach(() => {
    create.mockClear();
  });

  test("registers exactly one purchasable product route", async () => {
    const value = await controller();
    const routes: string[] = [];

    value.registerExtraRoutes({
      post: (path: string) => routes.push(`POST ${path}`),
    } as never);

    expect(routes).toEqual([
      "POST /supplier-purchasable-products/:id",
    ]);
  });

  test("passes the complete command once and wraps the response", async () => {
    const value = await controller();

    const response = await value.createPurchasableProduct(
      validRequest() as never,
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      input,
      "purchasable-product:create",
    );
    expect(response).toEqual({ data: created, message: "success" });
  });

  test.each([
    [
      "missing tenant supplier scope",
      { query: {} },
    ],
    [
      "invalid tenant supplier scope",
      { query: { tenantSupplierId: "not-a-uuid" } },
    ],
    [
      "missing supplier path id",
      { params: {} },
    ],
    [
      "invalid supplier path id",
      { params: { id: "not-a-uuid" } },
    ],
    [
      "invalid body",
      { body: { ...input, price: { ...input.price, unit_price: "0" } } },
    ],
    [
      "missing idempotency key",
      { headers: {} },
    ],
    [
      "duplicate idempotency key",
      {
        headers: {
          "idempotency-key": [
            "purchasable-product:create",
            "purchasable-product:duplicate",
          ],
        },
      },
    ],
    [
      "overlong idempotency key",
      { headers: { "idempotency-key": "x".repeat(121) } },
    ],
  ])("rejects %s before service", async (_name, override) => {
    const value = await controller();

    await expect(value.createPurchasableProduct({
      ...validRequest(),
      ...override,
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(create).not.toHaveBeenCalled();
  });

  test("requires auth context before parsing or calling service", async () => {
    const value = await controller();
    Object.defineProperty(value, "getRequiredTenantContext", {
      configurable: true,
      value: mock(async () => {
        throw Errors.unauthorized("需要租户认证上下文");
      }),
    });

    await expect(value.createPurchasableProduct({
      params: {},
      query: {},
      headers: {},
      body: {},
    } as never)).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
    expect(create).not.toHaveBeenCalled();
  });

  test("registers the controller once without resource factory CRUD", async () => {
    const controllerSource = await Bun.file(
      new URL("./index.ts", import.meta.url),
    ).text();
    const routesSource = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();

    expect(controllerSource).not.toContain(".from(");
    expect(controllerSource).not.toContain(".rpc(");
    expect(routesSource).toContain(
      'import SupplierPurchasableProductsController from "@/controllers/supplier-purchasable-products";',
    );
    expect(routesSource.match(
      /SupplierPurchasableProductsController\.registerExtraRoutes\(app\);/g,
    )).toHaveLength(1);
    expect(routesSource).not.toContain(
      'createResourceRoutes("supplier-purchasable-products"',
    );
  });
});
