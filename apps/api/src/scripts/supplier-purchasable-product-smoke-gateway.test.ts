import { describe, expect, test } from "bun:test";

import {
  commandSupplierPurchasableProduct,
  querySupplierPurchasableProductPriceSeriesSnapshot,
  type SupplierPurchasableProductPriceSeriesItemSnapshot,
  type SupplierPurchasableProductPriceSeriesListSnapshot,
  type SupplierPurchasableProductSmokeQuery,
} from "./supplier-purchasable-product-smoke-gateway";
import { runSupplierPurchasableProductSmokeRollbackOnly } from
  "./supplier-purchasable-product-smoke";

const SCOPE = {
  tenantId: "11000000-0000-4000-8000-000000000001",
  tenantSupplierId: "11000000-0000-4000-8000-000000000002",
  supplierId: "11000000-0000-4000-8000-000000000003",
};
const NOW = "2026-08-27T00:00:00+00:00";
const EMPLOYEE_ID = "11000000-0000-4000-8000-000000000004";
const LIST_ID = "22000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "22000000-0000-4000-8000-000000000002";
const SKU_ID = "22000000-0000-4000-8000-000000000003";
const UNIT_ID = "22000000-0000-4000-8000-000000000004";
const LIST: SupplierPurchasableProductPriceSeriesListSnapshot = {
  id: LIST_ID,
  tenant_id: SCOPE.tenantId,
  tenant_supplier_id: SCOPE.tenantSupplierId,
  supplier_id: SCOPE.supplierId,
  price_list_code: "DEFAULT",
  name: "Default supplier price",
  currency: "CNY",
  scope_type: "default",
  version_number: 1,
  lifecycle_status: "published",
  effective_from: NOW,
  effective_until: null,
  supersedes_price_list_id: null,
  row_version: 2,
  acting_tenant_id: SCOPE.tenantId,
  acting_employee_id: EMPLOYEE_ID,
  operation_source: "tenant",
  proxy_reason: null,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
  published_at: NOW,
};
const ITEM: SupplierPurchasableProductPriceSeriesItemSnapshot = {
  id: "22000000-0000-4000-8000-000000000005",
  tenant_id: SCOPE.tenantId,
  supplier_id: SCOPE.supplierId,
  supplier_price_list_id: LIST_ID,
  supplier_product_id: PRODUCT_ID,
  supplier_sku_id: SKU_ID,
  minimum_quantity: "1",
  maximum_quantity: null,
  purchase_unit_id: UNIT_ID,
  base_unit_id: UNIT_ID,
  base_unit_conversion: "1",
  unit_price: "100",
  tax_rate: "0.13",
  tax_inclusive: true,
  acting_tenant_id: SCOPE.tenantId,
  acting_employee_id: EMPLOYEE_ID,
  operation_source: "tenant",
  proxy_reason: null,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
};

type QueryCall = { text: string; values: readonly unknown[] };

function createQuery(responses: readonly unknown[][]) {
  const calls: QueryCall[] = [];
  let index = 0;
  const query = (<Rows extends unknown[]>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(responses[index++] as Rows);
  }) as SupplierPurchasableProductSmokeQuery;
  return { calls, query };
}

describe("supplier purchasable product smoke gateway", () => {
  test("binds command payloads as JSON objects instead of JSON strings", async () => {
    const fake = createQuery([[{ result: { status: "created" } }]]);
    const input = {
      product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      tenant_id: SCOPE.tenantId,
      tenant_supplier_id: SCOPE.tenantSupplierId,
      supplier_id: SCOPE.supplierId,
      product: {
        product_code: "TP-2200000000004000",
        name: "Smoke product",
        category_id: UNIT_ID,
        brand_id: LIST_ID,
      },
      sku: {
        sku_code: "TS-2200000000004000",
        name: "Smoke SKU",
        purchase_unit_id: UNIT_ID,
        spec_values: {},
      },
      price: {
        unit_price: "100.00",
        tax_rate: "0.130000",
        tax_inclusive: true,
      },
      actor_user_id: EMPLOYEE_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "supplier-purchasable-smoke:gateway-json",
    };

    await expect(commandSupplierPurchasableProduct(fake.query, input))
      .resolves.toEqual({ status: "created" });

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.values.slice(5, 8)).toEqual([
      input.product,
      input.sku,
      input.price,
    ]);
  });

  test("snapshots the bounded default CNY series and all its items", async () => {
    const lists = [LIST];
    const items = [ITEM];
    const fake = createQuery([lists, items]);

    await expect(querySupplierPurchasableProductPriceSeriesSnapshot(
      fake.query,
      SCOPE,
    )).resolves.toEqual({ lists, items });

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]?.values).toEqual([
      SCOPE.tenantId,
      SCOPE.tenantSupplierId,
      SCOPE.supplierId,
      101,
    ]);
    expect(fake.calls[1]?.values).toEqual([
      SCOPE.tenantId,
      SCOPE.tenantSupplierId,
      SCOPE.supplierId,
      101,
    ]);
    const listSql = fake.calls[0]?.text ?? "";
    for (const field of [
      "version_number",
      "lifecycle_status",
      "effective_from",
      "effective_until",
      "supersedes_price_list_id",
      "row_version",
      "updated_at",
    ]) expect(listSql).toContain(field);
    expect(listSql).toContain("scope_type = 'default'");
    expect(listSql).toContain("currency = 'CNY'");
    expect(listSql).toContain("order by version_number, id limit ?");

    const itemSql = fake.calls[1]?.text ?? "";
    for (const field of [
      "supplier_price_list_id",
      "supplier_product_id",
      "supplier_sku_id",
      "unit_price",
      "tax_rate",
      "tax_inclusive",
      "updated_at",
    ]) expect(itemSql).toContain(field);
    expect(itemSql).toContain("join public.supplier_price_lists");
    expect(itemSql).toContain("order by item.id limit ?");
  });

  test("fails closed when either series collection exceeds 100 rows", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({ id: index }));
    const listOverflow = createQuery([rows]);
    await expect(querySupplierPurchasableProductPriceSeriesSnapshot(
      listOverflow.query,
      SCOPE,
    )).rejects.toThrow("SMOKE_PRICE_SERIES_TOO_LARGE");

    const itemOverflow = createQuery([[{ id: "list" }], rows]);
    await expect(querySupplierPurchasableProductPriceSeriesSnapshot(
      itemOverflow.query,
      SCOPE,
    )).rejects.toThrow("SMOKE_PRICE_SERIES_TOO_LARGE");
  });

  test("observes the exact rollback sentinel and returns callback result", async () => {
    const events: string[] = [];
    const executor = {
      async begin<Result>(callback: (value: { marker: true }) => Promise<Result>) {
        events.push("begin");
        try {
          return await callback({ marker: true });
        } catch (error) {
          events.push("rollback");
          throw error;
        }
      },
    };
    await expect(runSupplierPurchasableProductSmokeRollbackOnly(
      executor,
      async (value) => value.marker && "done",
    )).resolves.toBe("done");
    expect(events).toEqual(["begin", "rollback"]);
  });

  test("fails closed when executor swallows the rollback sentinel", async () => {
    const executor = {
      async begin<Result>(callback: (value: true) => Promise<Result>) {
        try {
          return await callback(true);
        } catch {
          return undefined as Result;
        }
      },
    };
    await expect(runSupplierPurchasableProductSmokeRollbackOnly(
      executor,
      async () => "done",
    )).rejects.toThrow("SMOKE_ROLLBACK_NOT_OBSERVED");
  });

  test("rolls back before rethrowing the callback failure", async () => {
    const events: string[] = [];
    const failure = new Error("primary");
    const executor = {
      async begin<Result>(callback: (value: true) => Promise<Result>) {
        try {
          return await callback(true);
        } catch (error) {
          events.push("rollback");
          throw error;
        }
      },
    };
    let observed: unknown;
    try {
      await runSupplierPurchasableProductSmokeRollbackOnly(
        executor,
        async () => {
          throw failure;
        },
      );
    } catch (error) {
      observed = error;
    }
    expect(observed).toBe(failure);
    expect(events).toEqual(["rollback"]);
  });
});
