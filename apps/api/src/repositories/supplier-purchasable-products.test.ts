import { describe, expect, mock, test } from "bun:test";

import { SupplierPurchasableProductCommandEnvelopeSchema,
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ResultMutation = (result: SupplierPurchasableProductCreatedResult) => void;

const command = {
  product_id: PRODUCT_ID,
  sku_id: SKU_ID,
  tenant_id: TENANT_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  supplier_id: SUPPLIER_ID,
  product: { product_code: "TP-1000000000004000", name: "耐水腻子粉",
    category_id: CATEGORY_ID, brand_id: BRAND_ID },
  sku: {
    sku_code: "TS-20000000000040008000000000000002",
    name: "20kg/袋",
    purchase_unit_id: UNIT_ID,
    spec_values: { weight: "20kg", count: 1, tags: ["bulk", "dry"] },
  },
  price: { unit_price: "48.00", tax_rate: "0.130000", tax_inclusive: true },
  actor_user_id: USER_ID,
  actor_employee_id: EMPLOYEE_ID,
  idempotency_key: "purchasable-product-test-key",
};

function createdResult(idempotent: boolean): SupplierPurchasableProductCreatedResult {
  return {
    status: "created", idempotent,
    product: {
      id: PRODUCT_ID, supplier_id: SUPPLIER_ID,
      product_code: command.product.product_code, name: command.product.name,
      category_id: CATEGORY_ID, brand_id: BRAND_ID, description: null,
      status: "active", version: 2, ownership_scope: "tenant",
      owner_tenant_id: TENANT_ID, acting_tenant_id: TENANT_ID,
      acting_employee_id: EMPLOYEE_ID, operation_source: "tenant",
      proxy_reason: null, created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID, created_at: NOW, updated_at: NOW,
    },
    sku: {
      id: SKU_ID, supplier_id: SUPPLIER_ID, supplier_product_id: PRODUCT_ID,
      sku_code: command.sku.sku_code, name: command.sku.name,
      specification: null, model: null, spec_values: command.sku.spec_values,
      purchase_unit_id: UNIT_ID, base_unit_id: UNIT_ID,
      base_unit_conversion: 1, batch_managed: false, color_managed: false,
      serial_managed: false, status: "active", version: 2,
      ownership_scope: "tenant", owner_tenant_id: TENANT_ID,
      acting_tenant_id: TENANT_ID, acting_employee_id: EMPLOYEE_ID,
      operation_source: "tenant", proxy_reason: null,
      created_by_employee_id: EMPLOYEE_ID, updated_by_employee_id: EMPLOYEE_ID,
      created_at: NOW, updated_at: NOW,
    },
    price: {
      id: PRICE_ITEM_ID, tenant_id: TENANT_ID, supplier_id: SUPPLIER_ID,
      supplier_price_list_id: PRICE_LIST_ID, supplier_product_id: PRODUCT_ID,
      supplier_sku_id: SKU_ID, minimum_quantity: "1.0000",
      maximum_quantity: null, purchase_unit_id: UNIT_ID, base_unit_id: UNIT_ID,
      base_unit_conversion: "1.00000000", unit_price: "48.00",
      tax_rate: "0.130000", tax_inclusive: true,
      acting_tenant_id: TENANT_ID, acting_employee_id: EMPLOYEE_ID,
      operation_source: "tenant", proxy_reason: null,
      created_by_employee_id: EMPLOYEE_ID, updated_by_employee_id: EMPLOYEE_ID,
      created_at: NOW, updated_at: NOW,
    },
    catalog_item: {
      supplier_product_id: PRODUCT_ID, product_code: command.product.product_code,
      product_name: command.product.name, supplier_sku_id: SKU_ID,
      sku_code: command.sku.sku_code, sku_name: command.sku.name,
      specification: null, model: null, supplier_price_list_id: PRICE_LIST_ID,
      price_list_code: "DEFAULT", price_list_version: 1, effective_from: NOW,
      effective_until: null, supplier_price_list_item_id: PRICE_ITEM_ID,
      purchase_unit_id: UNIT_ID, purchase_unit_code: "BAG",
      purchase_unit_name: "袋", purchase_unit_symbol: "袋", base_unit_id: UNIT_ID,
      base_unit_code: "BAG", base_unit_name: "袋", base_unit_symbol: "袋",
      base_unit_conversion: "1.00000000", unit_price: "48.00",
      tax_rate: "0.130000", tax_inclusive: true,
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

function parses(value: unknown): boolean {
  return SupplierPurchasableProductCommandEnvelopeSchema.safeParse(value)
    .success;
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

    expect(parses(withoutIdempotent)).toBe(false);
    expect(parses({
      ...created,
      idempotent: "false",
    })).toBe(false);
    expect(parses({
      ...created,
      debug_sql: "select secret",
    })).toBe(false);
    expect(parses({
      ...created,
      product: { ...created.product, unstable: true },
    })).toBe(false);
    expect(parses({
      ...created,
      catalog_item: {
        ...created.catalog_item,
        supplier_sku_id: PRODUCT_ID,
      },
    })).toBe(false);
    expect(parses({
      ...created,
      catalog_item: {
        ...created.catalog_item,
        unit_price: "49.00",
      },
    })).toBe(false);
  });

  test("rejects a price acting tenant outside the price tenant", () => {
    const created = createdResult(false);
    expect(parses({
      ...created,
      price: { ...created.price, acting_tenant_id: USER_ID },
    })).toBe(false);
  });

  test("compares SKU and price base conversions by decimal semantics", () => {
    const created = createdResult(false);
    expect(parses(created)).toBe(true);
    expect(parses({
      ...created,
      sku: { ...created.sku, base_unit_conversion: 2 },
    })).toBe(false);
  });

  test("rejects malformed timestamps and out-of-contract created numerics", () => {
    const offsetAndMicroseconds = structuredClone(createdResult(false));
    offsetAndMicroseconds.product.created_at = "2026-08-27T08:00:00.123456Z";
    offsetAndMicroseconds.sku.updated_at = "2026-08-27T16:00:00+08:00";
    expect(parses(offsetAndMicroseconds)).toBe(true);

    const cases: Array<{ label: string; mutate: ResultMutation }> = [
      { label: "invalid timestamp", mutate: (r) => {
        r.product.created_at = "not-a-timestamp"; } },
      { label: "tax above one", mutate: (r) => {
        r.price.tax_rate = r.catalog_item.tax_rate = "1.000001"; } },
      { label: "unit price scale", mutate: (r) => {
        r.price.unit_price = r.catalog_item.unit_price = "48.001"; } },
      { label: "tax scale", mutate: (r) => {
        r.price.tax_rate = r.catalog_item.tax_rate = "0.1234567"; } },
      { label: "base conversion scale", mutate: (r) => {
        r.price.base_unit_conversion =
          r.catalog_item.base_unit_conversion = "1.000000001"; } },
      { label: "minimum not one", mutate: (r) => {
        r.price.minimum_quantity = "2.0000"; } },
      { label: "minimum scale", mutate: (r) => {
        r.price.minimum_quantity = "1.00000"; } },
      { label: "maximum non-null", mutate: (r) => {
        Reflect.set(r.price, "maximum_quantity", "2.0000"); } },
      { label: "conversion not one", mutate: (r) => {
        r.sku.base_unit_conversion = 2;
        r.price.base_unit_conversion =
          r.catalog_item.base_unit_conversion = "2.00000000"; } },
      { label: "product description", mutate: (r) => { Reflect.set(r.product, "description", "unexpected"); } },
      { label: "product version", mutate: (r) => { Reflect.set(r.product, "version", 3); } },
      { label: "sku specification", mutate: (r) => { Reflect.set(r.sku, "specification", "unexpected"); Reflect.set(r.catalog_item, "specification", "unexpected"); } },
      { label: "sku model", mutate: (r) => { Reflect.set(r.sku, "model", "unexpected"); Reflect.set(r.catalog_item, "model", "unexpected"); } },
      { label: "sku batch", mutate: (r) => { Reflect.set(r.sku, "batch_managed", true); } },
      { label: "sku color", mutate: (r) => { Reflect.set(r.sku, "color_managed", true); } },
      { label: "sku serial", mutate: (r) => { Reflect.set(r.sku, "serial_managed", true); } },
      { label: "sku version", mutate: (r) => { Reflect.set(r.sku, "version", 3); } },
    ];
    const accepted = [false, true].flatMap((idempotent) =>
      cases.filter(({ mutate }) => {
        const result = structuredClone(createdResult(idempotent));
        mutate(result);
        return parses(result);
      }).map(({ label }) => `${idempotent ? "replay" : "created"}:${label}`)
    );
    expect(accepted).toEqual([]);
  });

  test("rejects inconsistent creator and updater employee IDs on every row", () => {
    const mutations: ResultMutation[] = [
      (r) => { r.product.created_by_employee_id = USER_ID; },
      (r) => { r.sku.created_by_employee_id = USER_ID; },
      (r) => { r.price.created_by_employee_id = USER_ID; },
      (r) => { r.product.updated_by_employee_id = USER_ID; },
      (r) => { r.sku.updated_by_employee_id = USER_ID; },
      (r) => { r.price.updated_by_employee_id = USER_ID; },
    ];

    for (const mutate of mutations) {
      const created = structuredClone(createdResult(false));
      mutate(created);
      expect(parses(created)).toBe(false);
    }
  });

  test("accepts every real migration failure pair and rejects impossible pairs", () => {
    const envelope = (status: string, error_code: string, reason: string) => ({
      status, idempotent: false, error_code, reason,
    });
    const createValidation = [
      "validation_error", "invalid_product", "invalid_sku", "invalid_price",
    ].map((reason) => envelope("validation_error",
      "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED", reason));
    const createState = [
      "default_price_list_draft_exists", "multiple_published_default_price_lists",
      "category_not_found", "brand_not_found", "purchase_unit_not_found",
      "product_conflict", "sku_conflict", "unique_conflict", "state_conflict",
      "product_create_failed", "product_activate_failed", "sku_create_failed",
      "sku_activate_failed", "price_list_version_failed",
      "price_list_copy_incomplete", "price_list_prepare_failed",
      "price_item_upsert_failed", "price_list_retire_failed",
      "price_list_publish_failed", "catalog_result_not_exact",
      "catalog_item_mismatch", "SUPPLIER_PRODUCT_NOT_FOUND",
      "SUPPLIER_PRODUCT_VERSION_CONFLICT", "SUPPLIER_PRODUCT_STATE_CONFLICT",
      "SUPPLIER_SKU_NOT_FOUND", "SUPPLIER_SKU_VERSION_CONFLICT",
      "SUPPLIER_SKU_STATE_CONFLICT", "SUPPLIER_PRICE_LIST_NOT_FOUND",
      "SUPPLIER_PRICE_LIST_VERSION_CONFLICT", "SUPPLIER_PRICE_PERIOD_CONFLICT",
      "SUPPLIER_PRICE_LIST_INVALID_ACTION", "SUPPLIER_PRICE_ITEM_NOT_FOUND",
    ].map((reason) => envelope("state_conflict",
      "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED", reason));
    const caughtState = [
      "TENANT_SUPPLIER_NOT_FOUND", "SUPPLIER_NOT_FOUND",
      "SUPPLIER_PRODUCT_STATE_CONFLICT", "SUPPLIER_SKU_STATE_CONFLICT",
      "SUPPLIER_PRICE_LIST_INVALID_ACTION", "UNIT_CONVERSION_INVALID",
    ].map((code) => envelope("state_conflict", code, "state_conflict"));
    const valid = [...createValidation, ...createState, ...caughtState,
      envelope("validation_error", "SUPPLIER_PROXY_ACTOR_INVALID", "actor_invalid"),
      envelope("state_conflict", "SUPPLIER_ORDER_NOT_ELIGIBLE",
        "tenant_supplier_unavailable"),
      envelope("state_conflict", "SUPPLIER_ORDER_NOT_ELIGIBLE",
        "tenant_supplier_not_found"),
      envelope("state_conflict", "SUPPLIER_ORDER_NOT_ELIGIBLE", "state_conflict")];
    const impossible = [
      envelope("validation_error", "SUPPLIER_PROXY_ACTOR_INVALID", "invalid_price"),
      envelope("state_conflict", "TENANT_SUPPLIER_NOT_FOUND", "actor_invalid"),
      envelope("state_conflict", "DATABASE_INTERNAL_DIAGNOSTIC", "state_conflict"),
    ];
    expect(impossible.filter((value) =>
      parses(value)
    )).toEqual([]);
    expect(valid.filter((value) =>
      !parses(value)
    )).toEqual([]);
  });

  test("accepts only database-ordered eligibility reason lists", () => {
    const envelope = {
      status: "state_conflict",
      idempotent: false,
      error_code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
      reason: "required_qualification_missing,active_contract_required",
    };

    expect(parses(envelope)).toBe(true);
    for (const reason of [
      "active_contract_required,required_qualification_missing",
      "required_qualification_missing, active_contract_required",
      "required_qualification_missing,,active_contract_required",
      "required_qualification_missing,unknown_reason",
      "required_qualification_missing,<script>",
    ]) {
      expect(parses({ ...envelope, reason }), reason).toBe(false);
    }
  });
});

describe("SupplierPurchasableProductsRepository", () => {
  test("calls the composite RPC once with the exact full parameter contract", async () => {
    const rpc = mock(async () => ({ data: createdResult(false), error: null }));
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );
    const repository = new SupplierPurchasableProductsRepository(() => ({ rpc }));

    await expect(repository.create(command)).resolves.toEqual(
      createdResult(false),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "command_supplier_purchasable_product_v2",
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
    const replay = createdResult(true);
    replay.sku.spec_values = {
      tags: ["bulk", "dry"], count: 1.0, weight: "20kg",
    };
    replay.price.unit_price = replay.catalog_item.unit_price = "48.0";
    replay.price.tax_rate = replay.catalog_item.tax_rate = "0.13";
    const rpc = mock(async () => ({ data: replay, error: null }));
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );
    const repository = new SupplierPurchasableProductsRepository(() => ({ rpc }));
    await expect(repository.create(command)).resolves.toEqual(replay);
    replay.sku.sku_code = replay.catalog_item.sku_code =
      "TS-2000000000004000";
    await expect(repository.create(command)).resolves.toEqual(replay);
    replay.idempotent = false;
    await expect(repository.create(command)).rejects.toMatchObject({
      code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
    });
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

  test("binds every echoed product, SKU, and price value to the command", async () => {
    const mutations: Array<{ label: string; mutate: ResultMutation }> = [
      { label: "product name", mutate: (r) => {
        r.product.name = r.catalog_item.product_name = "错误商品"; } },
      { label: "category", mutate: (r) => {
        r.product.category_id = USER_ID; } },
      { label: "brand", mutate: (r) => {
        r.product.brand_id = USER_ID; } },
      { label: "sku name", mutate: (r) => {
        r.sku.name = r.catalog_item.sku_name = "错误 SKU"; } },
      { label: "purchase unit", mutate: (r) => {
        r.sku.purchase_unit_id = r.sku.base_unit_id = CATEGORY_ID;
        r.price.purchase_unit_id = r.price.base_unit_id = CATEGORY_ID;
        r.catalog_item.purchase_unit_id = r.catalog_item.base_unit_id = CATEGORY_ID; } },
      { label: "spec values", mutate: (r) => {
        r.sku.spec_values = { weight: "25kg" }; } },
      { label: "unit price", mutate: (r) => {
        r.price.unit_price = r.catalog_item.unit_price = "49.00"; } },
      { label: "tax rate", mutate: (r) => {
        r.price.tax_rate = r.catalog_item.tax_rate = "0.090000"; } },
      { label: "tax inclusive", mutate: (r) => {
        r.price.tax_inclusive = r.catalog_item.tax_inclusive = false; } },
    ];
    const accepted: string[] = [];
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );
    for (const idempotent of [false, true]) {
      for (const { label, mutate } of mutations) {
        const response = structuredClone(createdResult(idempotent));
        mutate(response);
        const rpc = mock(async () => ({ data: response, error: null }));
        try {
          await new SupplierPurchasableProductsRepository(() => ({ rpc }))
            .create(command);
          accepted.push(`${idempotent ? "replay" : "created"}:${label}`);
        } catch (error) {
          expect(error).toMatchObject({
            statusCode: 500,
            code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
            details: undefined,
          });
        }
        expect(rpc).toHaveBeenCalledTimes(1);
      }
    }
    expect(accepted).toEqual([]);
  });

  test("maps malformed RPC output to a stable 500 without diagnostics", async () => {
    const { SupplierPurchasableProductsRepository } = await import(
      "./supplier-purchasable-products"
    );
    for (const data of [
      { status: "created", internal: "unstable" },
      { status: "validation_error", idempotent: false,
        error_code: "SUPPLIER_PROXY_ACTOR_INVALID", reason: "invalid_price" },
      { status: "state_conflict", idempotent: false,
        error_code: "DATABASE_INTERNAL_DIAGNOSTIC", reason: "state_conflict" },
    ]) {
      const rpc = mock(async () => ({ data, error: null }));
      await expect(new SupplierPurchasableProductsRepository(() => ({ rpc }))
        .create(command)).rejects.toMatchObject({ statusCode: 500,
          code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
          message: "创建可采购商品失败", details: undefined });
      expect(rpc).toHaveBeenCalledTimes(1);
    }
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
