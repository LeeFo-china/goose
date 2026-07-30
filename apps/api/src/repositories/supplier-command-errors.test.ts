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
    ["SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED", 409],
  ])("maps %s to a business response", (code, statusCode) => {
    expect(mapSupplierCommandDatabaseError({
      code: "P0001",
      message: code,
      details: null,
    })).toMatchObject({ code, statusCode });
  });

  test.each([
    [
      "FULFILLMENT_NOT_CONFIRMED",
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_NOT_CONFIRMED",
      "供应商采购单尚未确认履约",
      409,
    ],
    [
      "FULFILLMENT_VERSION_CONFLICT",
      "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT",
      "采购履约版本已变化，请刷新后重试",
      409,
    ],
    [
      "OVER_SHIPPED",
      "SUPPLIER_PURCHASE_ORDER_OVER_SHIPPED",
      "本次发货数量超过采购数量",
      409,
    ],
    [
      "OVER_RECEIVED",
      "SUPPLIER_PURCHASE_ORDER_OVER_RECEIVED",
      "本次收货数量超过累计发货数量",
      409,
    ],
    [
      "VARIANCE_REASON_REQUIRED",
      "SUPPLIER_PURCHASE_ORDER_VARIANCE_REASON_REQUIRED",
      "存在拒收数量时必须填写差异原因",
      400,
    ],
  ])(
    "normalizes %s to stable public code %s",
    (inputCode, publicCode, message, statusCode) => {
      expect(mapSupplierCommandDatabaseError(inputCode)).toMatchObject({
        code: publicCode,
        message,
        statusCode,
      });
    },
  );

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

  test("maps every P0001 raised by the fulfillment migration", () => {
    const sql = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260730100000_create_supplier_purchase_fulfillment.sql",
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

  test("maps every command envelope error code in the fulfillment migration", () => {
    const sql = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260730100000_create_supplier_purchase_fulfillment.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const codes = [
      ...sql.matchAll(/'error_code',\s*'([^']+)'/g),
    ].map((match) => match[1]!);

    expect(codes.length).toBeGreaterThan(0);
    for (const code of new Set(codes)) {
      expect(mapSupplierCommandDatabaseError(code), code).not.toBeNull();
    }
    expect(mapSupplierCommandDatabaseError(
      "SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR",
    )).toMatchObject({ statusCode: 400 });
  });
});
