import { describe, expect, test } from "bun:test";

import { mapSupplierCommandDatabaseError } from "./supplier-command-errors";

describe("mapSupplierCommandDatabaseError", () => {
  test.each([
    ["SUPPLIER_IDEMPOTENCY_CONFLICT", 409],
    ["SUPPLIER_PRODUCT_NOT_FOUND", 404],
    ["SUPPLIER_PROXY_ACTOR_INVALID", 403],
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
});
