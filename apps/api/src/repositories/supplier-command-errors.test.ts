import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { mapSupplierCommandDatabaseError } from "./supplier-command-errors";

describe("mapSupplierCommandDatabaseError", () => {
  test.each([
    ["SUPPLIER_IDEMPOTENCY_CONFLICT", 409],
    ["SUPPLIER_PRODUCT_NOT_FOUND", 404],
    ["SUPPLIER_PROXY_ACTOR_INVALID", 403],
    ["SUPPLIER_ORDER_NOT_ELIGIBLE", 409],
    ["SUPPLIER_PRICE_LIST_INVALID_ACTION", 409],
  ])("maps %s to a business response", (code, statusCode) => {
    expect(mapSupplierCommandDatabaseError({
      code: "P0001",
      message: code,
      details: null,
    })).toMatchObject({ code, statusCode });
  });

  test("leaves unknown database failures for the generic DB wrapper", () => {
    expect(mapSupplierCommandDatabaseError({
      code: "XX000",
      message: "internal database error",
    })).toBeNull();
  });

  test("maps every P0001 supplier command raised by the pricing migration", () => {
    const sql = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260729160000_create_supplier_products_and_base_prices.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const codes = [
      ...sql.matchAll(
        /ERRCODE = 'P0001',\s*MESSAGE = '([^']+)'/g,
      ),
    ].map((match) => match[1]!);

    expect(codes.length).toBeGreaterThan(0);
    for (const code of new Set(codes)) {
      expect(mapSupplierCommandDatabaseError({
        code: "P0001",
        message: code,
      }), code).not.toBeNull();
    }
  });
});
