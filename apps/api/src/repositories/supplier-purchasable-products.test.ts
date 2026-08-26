import { describe, expect, mock, test } from "bun:test";

import {
  SupplierPurchasableProductCommandEnvelopeSchema,
  type SupplierPurchasableProductCreatedResult,
} from "./supplier-purchasable-product-records";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const SKU_ID = "20000000-0000-4000-8000-000000000002";
const TENANT_ID = "30000000-0000-4000-8000-000000000003";
const TENANT_SUPPLIER_ID = "40000000-0000-4000-8000-000000000004";
const SUPPLIER_ID = "50000000-0000-4000-8000-000000000005";
const USER_ID = "60000000-0000-4000-8000-000000000006";
const EMPLOYEE_ID = "70000000-0000-4000-8000-000000000007";
const CATEGORY_ID = "80000000-0000-4000-8000-000000000008";
const BRAND_ID = "90000000-0000-4000-8000-000000000009";
const UNIT_ID = "a0000000-0000-4000-8000-00000000000a";
const PRICE_LIST_ID = "b0000000-0000-4000-8000-00000000000b";
const PRICE_ITEM_ID = "c0000000-0000-4000-8000-00000000000c";
const NOW = "2026-08-27T08:00:00+00:00";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const command = {
  product_id: PRODUCT_ID,
  sku_id: SKU_ID,
  tenant_id: TENANT_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  supplier_id: SUPPLIER_ID,
  product: {
    product_code: "TP-1000000000004000",
    name: "耐水腻子粉",
    category_id: CATEGORY_ID,
    brand_id: BRAND_ID,
  },
  sku: {
    sku_code: "TS-2000000000004000",
    name: "20kg/袋",
    purchase_unit_id: UNIT_ID,
    spec_values: { weight: "20kg" },
  },
  price: {
    unit_price: "48.00",
    tax_rate: "0.130000",
    tax_inclusive: true,
  },
  actor_user_id: USER_ID,
  actor_employee_id: EMPLOYEE_ID,
  idempotency_key: "purchasable-product-test-key",
};

function createdResult(
  idempotent: boolean,
): SupplierPurchasableProductCreatedResult {
  return {
    status: "created",
    idempotent,
    product: {
      id: PRODUCT_ID,
      supplier_id: SUPPLIER_ID,
      product_code: command.product.product_code,
      name: command.product.name,
      category_id: CATEGORY_ID,
      brand_id: BRAND_ID,
      description: null,
      status: "active",
      version: 2,
      ownership_scope: "tenant",
      owner_tenant_id: TENANT_ID,
      acting_tenant_id: TENANT_ID,
      acting_employee_id: EMPLOYEE_ID,
      operation_source: "tenant",
      proxy_reason: null,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID,
      created_at: NOW,
      updated_at: NOW,
    },
    sku: {
      id: SKU_ID,
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      sku_code: command.sku.sku_code,
      name: command.sku.name,
      specification: null,
      model: null,
      spec_values: command.sku.spec_values,
      purchase_unit_id: UNIT_ID,
      base_unit_id: UNIT_ID,
      base_unit_conversion: 1,
      batch_managed: false,
      color_managed: false,
      serial_managed: false,
      status: "active",
      version: 2,
      ownership_scope: "tenant",
      owner_tenant_id: TENANT_ID,
      acting_tenant_id: TENANT_ID,
      acting_employee_id: EMPLOYEE_ID,
      operation_source: "tenant",
      proxy_reason: null,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID,
      created_at: NOW,
      updated_at: NOW,
    },
    price: {
      id: PRICE_ITEM_ID,
      tenant_id: TENANT_ID,
      supplier_id: SUPPLIER_ID,
      supplier_price_list_id: PRICE_LIST_ID,
      supplier_product_id: PRODUCT_ID,
      supplier_sku_id: SKU_ID,
      minimum_quantity: "1.0000",
      maximum_quantity: null,
      purchase_unit_id: UNIT_ID,
      base_unit_id: UNIT_ID,
      base_unit_conversion: "1.00000000",
      unit_price: "48.00",
      tax_rate: "0.130000",
      tax_inclusive: true,
      acting_tenant_id: TENANT_ID,
      acting_employee_id: EMPLOYEE_ID,
      operation_source: "tenant",
      proxy_reason: null,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID,
      created_at: NOW,
      updated_at: NOW,
    },
    catalog_item: {
      supplier_product_id: PRODUCT_ID,
      product_code: command.product.product_code,
      product_name: command.product.name,
      supplier_sku_id: SKU_ID,
      sku_code: command.sku.sku_code,
      sku_name: command.sku.name,
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
      unit_price: "48.00",
      tax_rate: "0.130000",
      tax_inclusive: true,
    },
  };
}

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

describe("supplier purchasable product command records", () => {
  test("strictly parses created and replay envelopes with complete stable rows", () => {
    expect(SupplierPurchasableProductCommandEnvelopeSchema.parse(
      createdResult(false),
    ).idempotent).toBe(false);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.parse(
      createdResult(true),
    ).idempotent).toBe(true);
  });

  test("rejects missing, mistyped, extra, and internally inconsistent data", () => {
    const created = createdResult(false);
    const { idempotent: _missing, ...withoutIdempotent } = created;

    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse(
      withoutIdempotent,
    ).success).toBe(false);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
      ...created,
      idempotent: "false",
    }).success).toBe(false);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
      ...created,
      debug_sql: "select secret",
    }).success).toBe(false);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
      ...created,
      product: { ...created.product, unstable: true },
    }).success).toBe(false);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
      ...created,
      catalog_item: {
        ...created.catalog_item,
        supplier_sku_id: PRODUCT_ID,
      },
    }).success).toBe(false);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
      ...created,
      catalog_item: {
        ...created.catalog_item,
        unit_price: "49.00",
      },
    }).success).toBe(false);
  });

  test("rejects a price acting tenant outside the price tenant", () => {
    const created = createdResult(false);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
      ...created,
      price: { ...created.price, acting_tenant_id: USER_ID },
    }).success).toBe(false);
  });

  test("compares SKU and price base conversions by decimal semantics", () => {
    const created = createdResult(false);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse(created)
      .success).toBe(true);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
      ...created,
      sku: { ...created.sku, base_unit_conversion: 2 },
    }).success).toBe(false);
  });

  test("rejects inconsistent creator and updater employee IDs on every row", () => {
    const mutations: Array<(
      result: SupplierPurchasableProductCreatedResult,
    ) => void> = [
      (result) => {
        result.product.created_by_employee_id = USER_ID;
      },
      (result) => {
        result.sku.created_by_employee_id = USER_ID;
      },
      (result) => {
        result.price.created_by_employee_id = USER_ID;
      },
      (result) => {
        result.product.updated_by_employee_id = USER_ID;
      },
      (result) => {
        result.sku.updated_by_employee_id = USER_ID;
      },
      (result) => {
        result.price.updated_by_employee_id = USER_ID;
      },
    ];

    for (const mutate of mutations) {
      const created = structuredClone(createdResult(false));
      mutate(created);
      expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse(created)
        .success).toBe(false);
    }
  });

  test("parses only stable known failure envelopes", () => {
    expect(SupplierPurchasableProductCommandEnvelopeSchema.parse({
      status: "validation_error",
      idempotent: false,
      error_code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
      reason: "invalid_price",
    })).toEqual({
      status: "validation_error",
      idempotent: false,
      error_code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
      reason: "invalid_price",
    });
    expect(SupplierPurchasableProductCommandEnvelopeSchema.parse({
      status: "state_conflict",
      idempotent: false,
      error_code: "SUPPLIER_PRICE_LIST_INVALID_ACTION",
      reason: "state_conflict",
    }).status).toBe("state_conflict");
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
      status: "state_conflict",
      idempotent: false,
      error_code: "DATABASE_INTERNAL_DIAGNOSTIC",
      reason: "relation public.secret does not exist",
    }).success).toBe(false);
    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
      status: "validation_error",
      idempotent: false,
      error_code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
      reason: "invalid_price",
      diagnostics: { sql: "select secret" },
    }).success).toBe(false);
  });

  test("accepts only database-ordered eligibility reason lists", () => {
    const envelope = {
      status: "state_conflict",
      idempotent: false,
      error_code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
      reason: "required_qualification_missing,active_contract_required",
    };

    expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse(envelope)
      .success).toBe(true);
    for (const reason of [
      "active_contract_required,required_qualification_missing",
      "required_qualification_missing, active_contract_required",
      "required_qualification_missing,,active_contract_required",
      "required_qualification_missing,unknown_reason",
      "required_qualification_missing,<script>",
    ]) {
      expect(SupplierPurchasableProductCommandEnvelopeSchema.safeParse({
        ...envelope,
        reason,
      }).success, reason).toBe(false);
    }
  });
});

describe("SupplierPurchasableProductsRepository", () => {
  test("calls the composite RPC once with the exact full parameter contract", async () => {
    const rpc = mock(async () => ({ data: createdResult(false), error: null }));
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );
    const repository = new SupplierPurchasableProductsRepository(() => ({
      rpc,
    }));

    await expect(repository.create(command)).resolves.toEqual(
      createdResult(false),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "command_supplier_purchasable_product_v1",
      {
        p_product_id: PRODUCT_ID,
        p_sku_id: SKU_ID,
        p_tenant_id: TENANT_ID,
        p_tenant_supplier_id: TENANT_SUPPLIER_ID,
        p_supplier_id: SUPPLIER_ID,
        p_product: command.product,
        p_sku: command.sku,
        p_price: command.price,
        p_actor_user_id: USER_ID,
        p_actor_employee_id: EMPLOYEE_ID,
        p_idempotency_key: command.idempotency_key,
      },
    );
  });

  test("returns a replay envelope without changing idempotent", async () => {
    const rpc = mock(async () => ({ data: createdResult(true), error: null }));
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );

    await expect(new SupplierPurchasableProductsRepository(() => ({ rpc }))
      .create(command)).resolves.toEqual(createdResult(true));
  });

  test("returns a stable comma-separated eligibility failure envelope", async () => {
    const failure = {
      status: "state_conflict",
      idempotent: false,
      error_code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
      reason: "required_qualification_missing,active_contract_required",
    } as const;
    const rpc = mock(async () => ({ data: failure, error: null }));
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );

    await expect(new SupplierPurchasableProductsRepository(() => ({ rpc }))
      .create(command)).resolves.toEqual(failure);
  });

  test("canonicalizes uppercase UUIDs in a replay before identity checks", async () => {
    const rpc = mock(async () => ({
      data: uppercaseUuidValues(createdResult(true)),
      error: null,
    }));
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );

    await expect(new SupplierPurchasableProductsRepository(() => ({ rpc }))
      .create(command)).resolves.toEqual(createdResult(true));
  });

  test("maps malformed RPC output to a stable 500 without diagnostics", async () => {
    const rpc = mock(async () => ({
      data: { status: "created", internal: "unstable" },
      error: null,
    }));
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );

    await expect(new SupplierPurchasableProductsRepository(() => ({ rpc }))
      .create(command)).rejects.toMatchObject({
        statusCode: 500,
        code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
        message: "创建可采购商品失败",
        details: undefined,
      });
  });

  test("maps known Supabase command errors and hides unknown diagnostics", async () => {
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );
    const knownRpc = mock(async () => ({
      data: null,
      error: {
        code: "P0001",
        message: "SUPPLIER_IDEMPOTENCY_CONFLICT",
        details: "sensitive database context",
      },
    }));
    const unknownRpc = mock(async () => ({
      data: null,
      error: {
        code: "XX000",
        message: "internal database error",
        details: "select * from secret",
      },
    }));

    await expect(new SupplierPurchasableProductsRepository(() => ({
      rpc: knownRpc,
    })).create(command)).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
      details: undefined,
    });
    await expect(new SupplierPurchasableProductsRepository(() => ({
      rpc: unknownRpc,
    })).create(command)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "创建可采购商品失败",
      details: undefined,
    });
  });
});
