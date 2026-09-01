import { describe, expect, mock, test } from "bun:test";

import type { SupplierPurchasableSkuCommandResult, SupplierPurchasableSkuIdentity, SupplierPurchasableSkuPriceContext } from "./supplier-purchasable-sku-records";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "40000000-0000-4000-8000-000000000001";
const TENANT_SUPPLIER_ID = "40000000-0000-4000-8000-000000000002";
const SUPPLIER_ID = "40000000-0000-4000-8000-000000000003";
const PRODUCT_ID = "40000000-0000-4000-8000-000000000004";
const SKU_ID = "40000000-0000-4000-8000-000000000005";
const PRICE_LIST_ID = "40000000-0000-4000-8000-000000000006";
const PRICE_ITEM_ID = "40000000-0000-4000-8000-000000000007";
const USER_ID = "40000000-0000-4000-8000-000000000008";
const EMPLOYEE_ID = "40000000-0000-4000-8000-000000000009";
const UNIT_ID = "40000000-0000-4000-8000-00000000000a";

const scopeInput = {
  tenant_id: TENANT_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  supplier_id: SUPPLIER_ID,
  supplier_product_id: PRODUCT_ID,
};

function priceEnvelope(skuId: string | null = SKU_ID) {
  return {
    tenant_id: TENANT_ID,
    tenant_supplier_id: TENANT_SUPPLIER_ID,
    supplier_id: SUPPLIER_ID,
    supplier_product_id: PRODUCT_ID,
    supplier_sku_id: skuId,
    currency: "CNY",
    recommended_tax_rate: "0.13",
    recommended_tax_inclusive: false,
    next_scheduled_effective_from: "2026-09-10T00:00:00Z",
    current_price: skuId === null ? null : {
      supplier_price_list_id: PRICE_LIST_ID,
      supplier_price_list_version: 3,
      supplier_price_list_row_version: 5,
      supplier_price_list_item_id: PRICE_ITEM_ID,
      unit_price: "328.00",
      tax_rate: "0.130000",
      tax_inclusive: false,
      effective_from: "2026-09-01T08:00:00+08:00",
      effective_until: null,
    },
  } as const;
}

function publicContext(
  skuId: string | null = SKU_ID,
): SupplierPurchasableSkuPriceContext {
  const {
    tenant_id: _tenantId,
    tenant_supplier_id: _tenantSupplierId,
    supplier_id: _supplierId,
    supplier_product_id: _productId,
    supplier_sku_id: _skuId,
    ...context
  } = priceEnvelope(skuId);
  return context;
}

function commandResult(): SupplierPurchasableSkuCommandResult {
  const now = "2026-09-01T08:00:00+08:00";
  return {
    status: "saved",
    idempotent: false,
    price_version_created: true,
    currency: "CNY",
    product: {
      id: PRODUCT_ID, supplier_id: SUPPLIER_ID,
      product_code: "TP-40000000000040008000000000000004",
      name: "净味乳胶漆", category_id: UNIT_ID, brand_id: PRICE_ITEM_ID,
      description: null, status: "active", version: 2,
      ownership_scope: "tenant", owner_tenant_id: TENANT_ID,
      acting_tenant_id: TENANT_ID, acting_employee_id: EMPLOYEE_ID,
      operation_source: "tenant", proxy_reason: null,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID, created_at: now, updated_at: now,
    },
    sku: {
      id: SKU_ID, supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      sku_code: "TS-40000000000040008000000000000005",
      name: "净味乳胶漆 18L 新包装", specification: "18L", model: null,
      spec_values: {}, purchase_unit_id: UNIT_ID, base_unit_id: UNIT_ID,
      base_unit_conversion: 1, batch_managed: false, color_managed: false,
      serial_managed: false, status: "active", version: 4,
      ownership_scope: "tenant", owner_tenant_id: TENANT_ID,
      acting_tenant_id: TENANT_ID, acting_employee_id: EMPLOYEE_ID,
      operation_source: "tenant", proxy_reason: null,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID, created_at: now, updated_at: now,
    },
    current_price: {
      supplier_price_list_id: PRICE_LIST_ID,
      supplier_price_list_version: 3,
      supplier_price_list_row_version: 6,
      supplier_price_list_item_id: PRICE_ITEM_ID,
      unit_price: "318.00", tax_rate: "0.130000", tax_inclusive: false,
      effective_from: now, effective_until: null,
    },
    catalog_item: {
      supplier_product_id: PRODUCT_ID,
      product_code: "TP-40000000000040008000000000000004",
      product_name: "净味乳胶漆", supplier_sku_id: SKU_ID,
      sku_code: "TS-40000000000040008000000000000005",
      sku_name: "净味乳胶漆 18L 新包装", specification: "18L", model: null,
      supplier_price_list_id: PRICE_LIST_ID, price_list_code: "DEFAULT",
      price_list_version: 3, effective_from: now, effective_until: null,
      supplier_price_list_item_id: PRICE_ITEM_ID,
      purchase_unit_id: UNIT_ID, purchase_unit_code: "BARREL",
      purchase_unit_name: "桶", purchase_unit_symbol: "桶",
      base_unit_id: UNIT_ID, base_unit_code: "BARREL",
      base_unit_name: "桶", base_unit_symbol: "桶",
      base_unit_conversion: "1.00000000", unit_price: "318.00",
      tax_rate: "0.130000", tax_inclusive: false,
    },
    next_scheduled_effective_from: null,
    available_actions: ["edit", "deactivate"],
  };
}

describe("supplier purchasable SKU price context records", () => {
  test("strictly parses nullable current prices while preserving decimal strings", async () => {
    const { SupplierPurchasableSkuPriceContextEnvelopeSchema } = await import(
      "./supplier-purchasable-sku-records"
    );

    const parsed = SupplierPurchasableSkuPriceContextEnvelopeSchema.parse(
      priceEnvelope(),
    );
    expect(parsed.current_price?.unit_price).toBe("328.00");
    expect(parsed.current_price?.tax_rate).toBe("0.130000");
    expect(SupplierPurchasableSkuPriceContextEnvelopeSchema.parse(
      priceEnvelope(null),
    ).current_price).toBeNull();
  });

  test("rejects malformed envelopes, non-string decimals, and extra keys", async () => {
    const { SupplierPurchasableSkuPriceContextEnvelopeSchema } = await import(
      "./supplier-purchasable-sku-records"
    );
    const valid = priceEnvelope();
    const { currency: _currency, ...missingCurrency } = valid;

    const malformed = [
      missingCurrency,
      { ...valid, debug_sql: "select secret" },
      { ...valid, recommended_tax_rate: 0.13 },
      {
        ...valid,
        current_price: { ...valid.current_price, unit_price: 328 },
      },
      {
        ...valid,
        current_price: { ...valid.current_price, tax_rate: 0.13 },
      },
      {
        ...valid,
        current_price: { ...valid.current_price, internal_note: "secret" },
      },
      { ...valid, next_scheduled_effective_from: "not-a-timestamp" },
    ];

    expect(malformed.filter((value) =>
      SupplierPurchasableSkuPriceContextEnvelopeSchema.safeParse(value).success
    )).toEqual([]);
  });
});

describe("SupplierPurchasableSkusRepository price reads", () => {
  test("calls the defaults RPC once with the exact null SKU contract", async () => {
    const rpc = mock(async () => ({ data: priceEnvelope(null), error: null }));
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );
    const repository = new SupplierPurchasableSkusRepository(
      () => ({ rpc } as never),
    );

    await expect(repository.getPriceDefaults(scopeInput)).resolves.toEqual(
      publicContext(null),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "get_supplier_purchasable_sku_price_context_v1",
      {
        p_tenant_id: TENANT_ID,
        p_tenant_supplier_id: TENANT_SUPPLIER_ID,
        p_supplier_id: SUPPLIER_ID,
        p_supplier_product_id: PRODUCT_ID,
        p_supplier_sku_id: null,
      },
    );
  });

  test("passes the real SKU ID to the current-price RPC", async () => {
    const rpc = mock(async () => ({ data: priceEnvelope(), error: null }));
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );
    const repository = new SupplierPurchasableSkusRepository(
      () => ({ rpc } as never),
    );

    await expect(repository.getCurrentPrice({
      ...scopeInput,
      sku_id: SKU_ID,
    })).resolves.toEqual(publicContext());
    expect(rpc).toHaveBeenCalledWith(
      "get_supplier_purchasable_sku_price_context_v1",
      {
        p_tenant_id: TENANT_ID,
        p_tenant_supplier_id: TENANT_SUPPLIER_ID,
        p_supplier_id: SUPPLIER_ID,
        p_supplier_product_id: PRODUCT_ID,
        p_supplier_sku_id: SKU_ID,
      },
    );
  });

  test("rejects malformed and cross-scope RPC identities", async () => {
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );
    const foreignId = "40000000-0000-4000-8000-000000000099";
    const mutations = [
      { tenant_id: foreignId },
      { tenant_supplier_id: foreignId },
      { supplier_id: foreignId },
      { supplier_product_id: foreignId },
      { supplier_sku_id: foreignId },
    ];

    for (const mutation of mutations) {
      const rpc = mock(async () => ({
        data: { ...priceEnvelope(), ...mutation },
        error: null,
      }));
      await expect(new SupplierPurchasableSkusRepository(
        () => ({ rpc } as never),
      ).getCurrentPrice({ ...scopeInput, sku_id: SKU_ID })).rejects.toMatchObject({
        code: "DB_ERROR",
        message: "查询供应商 SKU 当前价格失败",
      });
    }
  });

  test("wraps RPC errors with the stable database error", async () => {
    const rpc = mock(async () => ({
      data: null,
      error: { code: "XX000", message: "internal detail" },
    }));
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );

    await expect(new SupplierPurchasableSkusRepository(
      () => ({ rpc } as never),
    ).getPriceDefaults(scopeInput)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "查询供应商 SKU 当前价格失败",
    });
  });
});

type QueryDouble = {
  select(columns: string): QueryDouble;
  eq(column: string, value: unknown): QueryDouble;
  maybeSingle(): Promise<{ data: unknown; error: unknown }>;
};

function skuQuery(data: unknown, error: unknown = null) {
  const select = mock((_columns: string) => query);
  const eq = mock((_column: string, _value: unknown) => query);
  const maybeSingle = mock(async () => ({ data, error }));
  const query: QueryDouble = { select, eq, maybeSingle };
  const from = mock((_table: string) => query);
  return { from, select, eq, maybeSingle };
}

describe("SupplierPurchasableSkusRepository tenant SKU identity", () => {
  test("selects only focused identity fields with tenant-private filters", async () => {
    const row = {
      id: SKU_ID,
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      ownership_scope: "tenant",
      owner_tenant_id: TENANT_ID,
      status: "active",
      version: 7,
    } satisfies SupplierPurchasableSkuIdentity;
    const client = skuQuery(row);
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );
    const repository = new SupplierPurchasableSkusRepository(
      () => ({ ...client, rpc: mock() } as never),
    );

    await expect(repository.findTenantSkuIdentity({
      ...scopeInput,
      sku_id: SKU_ID,
    })).resolves.toEqual(row);
    expect(client.from).toHaveBeenCalledWith("supplier_skus");
    expect(client.select).toHaveBeenCalledWith(
      "id,supplier_id,supplier_product_id,ownership_scope,owner_tenant_id,status,version",
    );
    expect(client.eq.mock.calls).toEqual([
      ["id", SKU_ID],
      ["supplier_id", SUPPLIER_ID],
      ["supplier_product_id", PRODUCT_ID],
      ["ownership_scope", "tenant"],
      ["owner_tenant_id", TENANT_ID],
    ]);
    expect(client.maybeSingle).toHaveBeenCalledTimes(1);
  });

  test("returns null for a missing SKU and rejects query errors or extra fields", async () => {
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );
    const input = { ...scopeInput, sku_id: SKU_ID };
    const missing = skuQuery(null);
    await expect(new SupplierPurchasableSkusRepository(
      () => ({ ...missing, rpc: mock() } as never),
    ).findTenantSkuIdentity(input)).resolves.toBeNull();

    const failed = skuQuery(null, { code: "XX000" });
    await expect(new SupplierPurchasableSkusRepository(
      () => ({ ...failed, rpc: mock() } as never),
    ).findTenantSkuIdentity(input)).rejects.toMatchObject({
      code: "DB_ERROR",
      message: "查询供应商 SKU 失败",
    });

    const extra = skuQuery({
      id: SKU_ID,
      supplier_id: SUPPLIER_ID,
      supplier_product_id: PRODUCT_ID,
      ownership_scope: "tenant",
      owner_tenant_id: TENANT_ID,
      status: "active",
      version: 7,
      sku_code: "must-not-leak",
    });
    await expect(new SupplierPurchasableSkusRepository(
      () => ({ ...extra, rpc: mock() } as never),
    ).findTenantSkuIdentity(input)).rejects.toMatchObject({
      code: "DB_ERROR",
      message: "查询供应商 SKU 失败",
    });
  });
});

describe("SupplierPurchasableSkusRepository composite save", () => {
  const updateInput = {
    action: "update" as const, ...scopeInput, supplier_sku_id: SKU_ID,
    expected_sku_version: 3,
    sku: {
      name: "净味乳胶漆 18L 新包装", specification: "18L", model: null,
      batch_managed: false, color_managed: false, serial_managed: false,
      spec_values: {},
    },
    price: { unit_price: "318.00", tax_rate: "0.13", tax_inclusive: false },
    expected_price_list_id: PRICE_LIST_ID,
    expected_price_list_version: 5,
    actor_user_id: USER_ID, actor_employee_id: EMPLOYEE_ID,
    idempotency_key: "sku:update:price",
  };

  test("strictly parses a saved result and calls the command RPC exactly once", async () => {
    const rpc = mock(async () => ({ data: commandResult(), error: null }));
    const { SupplierPurchasableSkuCommandResultSchema } = await import(
      "./supplier-purchasable-sku-records"
    );
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );
    expect(SupplierPurchasableSkuCommandResultSchema.parse(commandResult())
      .current_price.unit_price).toBe("318.00");
    await expect(new SupplierPurchasableSkusRepository(
      () => ({ rpc } as never),
    ).save(updateInput)).resolves.toEqual(commandResult());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("command_supplier_purchasable_sku_v1", {
      p_action: "update", p_tenant_id: TENANT_ID,
      p_tenant_supplier_id: TENANT_SUPPLIER_ID, p_supplier_id: SUPPLIER_ID,
      p_supplier_product_id: PRODUCT_ID, p_supplier_sku_id: SKU_ID,
      p_expected_sku_version: 3, p_sku: updateInput.sku,
      p_price: updateInput.price, p_expected_price_list_id: PRICE_LIST_ID,
      p_expected_price_list_version: 5, p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "sku:update:price",
    });
  });

  test("accepts supported historical audit fields, SKU codes, and null specs", async () => {
    const base = commandResult();
    const legacyCode = `TS-${SKU_ID.replaceAll("-", "").slice(0, 16)}`;
    const variants = [
      [{ ...base, product: { ...base.product, acting_employee_id: USER_ID } },
        updateInput],
      [{ ...base, sku: { ...base.sku, sku_code: legacyCode }, catalog_item: {
        ...base.catalog_item, sku_code: legacyCode,
      } }, updateInput],
      [{ ...base, sku: { ...base.sku, spec_values: null } }, {
        ...updateInput, sku: { name: updateInput.sku.name },
      }],
    ] as const;
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );
    const accepted = await Promise.all(variants.map(async ([data, input]) => {
      const rpc = mock(async () => ({ data, error: null }));
      return new SupplierPurchasableSkusRepository(
        () => ({ rpc } as never),
      ).save(input).then(() => true, () => false);
    }));
    expect(accepted).toEqual([true, true, true]);
  });

  test("maps known database errors and wraps unknown errors without leaking SQL", async () => {
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );
    for (const [error, expected] of [
      [{ message: "SUPPLIER_SKU_VERSION_CONFLICT select secret" },
        { statusCode: 409, code: "SUPPLIER_SKU_VERSION_CONFLICT" }],
      [{ message: "select secret from supplier_skus", constraint: "private_key" },
        { statusCode: 500, code: "DB_ERROR" }],
    ] as const) {
      const rpc = mock(async () => ({ data: null, error }));
      const caught = await new SupplierPurchasableSkusRepository(
          () => ({ rpc } as never),
        ).save(updateInput).then(() => null, (caught) => caught);
      expect(caught).toMatchObject(expected);
      expect(String((caught as Error).message)).not.toContain("select secret");
      expect((caught as { details?: unknown }).details).toBeUndefined();
      expect(JSON.stringify(caught)).not.toMatch(/select secret|private_key/);
    }
  });

  test("maps stable envelopes and uses composite failure for unknown envelopes", async () => {
    const { SupplierPurchasableSkusRepository } = await import(
      "./supplier-purchasable-skus"
    );
    for (const [data, expected] of [
      [{ status: "version_conflict", idempotent: false,
        error_code: "SUPPLIER_PRICE_LIST_VERSION_CONFLICT", version: 7,
        current_price_list_id: PRICE_LIST_ID },
      { statusCode: 409, code: "SUPPLIER_PRICE_LIST_VERSION_CONFLICT" }],
      [{ status: "state_conflict", idempotent: false,
        error_code: "UNKNOWN_SQL_FAILURE", reason: "select secret" },
      { statusCode: 500, code: "SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED" }],
    ] as const) {
      const rpc = mock(async () => ({ data, error: null }));
      await expect(new SupplierPurchasableSkusRepository(
        () => ({ rpc } as never),
      ).save(updateInput)).rejects.toMatchObject(expected);
    }
  });

  test("rejects malformed, extra-key, and identity-mismatched saved results", async () => {
    const result = commandResult();
    const { currency: _currency, ...withoutCurrency } = result;
    const scheduled = (until: string | null) => ({ ...result,
      next_scheduled_effective_from: "2026-09-10T00:00:00Z",
      current_price: { ...result.current_price, effective_until: until },
      catalog_item: { ...result.catalog_item, effective_until: until } });
    const mutations = [
      withoutCurrency, { ...result, currency: "USD" },
      { ...result, debug_sql: "select secret" },
      { ...result, current_price: { ...result.current_price, unit_price: 318 } },
      { ...result, sku: { ...result.sku, supplier_product_id: TENANT_ID } },
      { ...result, catalog_item: { ...result.catalog_item,
        supplier_price_list_item_id: TENANT_ID } },
      { ...result, sku: { ...result.sku, spec_values: { extra: "value" } } },
      scheduled(null), scheduled("2026-09-09T00:00:00Z"),
      scheduled("2026-09-11T00:00:00Z"),
    ];
    const { SupplierPurchasableSkusRepository } = await import("./supplier-purchasable-skus");
    for (const data of mutations) {
      const rpc = mock(async () => ({ data, error: null }));
      await expect(new SupplierPurchasableSkusRepository(
        () => ({ rpc } as never),
      ).save(updateInput)).rejects.toMatchObject({
        statusCode: 500, code: "SUPPLIER_PURCHASABLE_SKU_SAVE_FAILED", message: "保存供应商 SKU 与供货价失败",
      });
    }
  });
});
