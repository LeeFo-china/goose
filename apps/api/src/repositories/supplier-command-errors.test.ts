import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  mapSupplierCommandDatabaseError,
  mapSupplierPurchaseRequisitionEnvelopeError,
  mapSupplierPurchaseFulfillmentEnvelopeError,
} from "./supplier-command-errors";

const CONVERTED_ORDER_ERROR_PAIRS = [
  ["validation_error", "SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR", 400],
  ["validation_error", "SUPPLIER_PURCHASE_ORDER_DUPLICATE_SKU", 400],
  ["validation_error", "SUPPLIER_PURCHASE_ORDER_AMOUNT_LIMIT_EXCEEDED", 400],
  ["not_found", "SUPPLIER_PURCHASE_ORDER_NOT_FOUND", 404],
  ["version_conflict", "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT", 409],
  ["state_conflict", "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT", 409],
  ["state_conflict", "SUPPLIER_PURCHASE_ORDER_ID_CONFLICT", 409],
  ["price_missing", "SUPPLIER_PURCHASE_ORDER_PRICE_MISSING", 409],
  ["price_changed", "SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED", 409],
  ["supplier_not_eligible", "SUPPLIER_ORDER_NOT_ELIGIBLE", 409],
  ["project_invalid", "SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID", 409],
] as const;

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

  test.each([
    ["SUPPLIER_PURCHASE_REQUISITION_VALIDATION_ERROR", 400],
    ["SUPPLIER_PURCHASE_REQUISITION_DUPLICATE_SKU", 400],
    ["SUPPLIER_PURCHASE_REQUISITION_AMOUNT_LIMIT_EXCEEDED", 400],
    ["SUPPLIER_PURCHASE_REQUISITION_ID_CONFLICT", 409],
    ["SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND", 404],
    ["SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT", 409],
    ["SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT", 409],
    ["SUPPLIER_PURCHASE_REQUISITION_PROJECT_INVALID", 409],
    ["SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED", 409],
    ["SUPPLIER_PURCHASE_REQUISITION_BUDGET_CHANGED", 409],
    ["SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW", 409],
    ["SUPPLIER_PURCHASE_REQUISITION_ALREADY_CONVERTED", 409],
    ["SUPPLIER_PURCHASE_ORDER_ID_CONFLICT", 409],
    ["SUPPLIER_PURCHASE_ORDER_AMOUNT_LIMIT_EXCEEDED", 400],
  ])("maps purchase requisition command code %s", (code, statusCode) => {
    expect(mapSupplierCommandDatabaseError(code))
      .toMatchObject({ code, statusCode });
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
    const pairs = [...sql.matchAll(
      /'status',\s*'([^']+)',\s*'error_code',\s*'([^']+)'/g,
    )].map((match) => [match[1]!, match[2]!] as const);

    expect(pairs.length).toBeGreaterThan(0);
    for (const [status, code] of pairs) {
      expect(
        mapSupplierPurchaseFulfillmentEnvelopeError(status, code),
        `${status}:${code}`,
      ).not.toBeNull();
      expect(mapSupplierCommandDatabaseError(code), code).not.toBeNull();
    }
    expect(mapSupplierCommandDatabaseError(
      "SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR",
    )).toMatchObject({ statusCode: 400 });
  });

  test.each([
    ["validation_error", "SUPPLIER_PURCHASE_ORDER_SHIPMENT_VALIDATION_ERROR"],
    ["not_found", "SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND"],
    ["version_conflict", "FULFILLMENT_VERSION_CONFLICT"],
    ["state_conflict", "FULFILLMENT_NOT_CONFIRMED"],
    ["project_invalid", "SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID"],
    ["idempotency_conflict", "SUPPLIER_IDEMPOTENCY_CONFLICT"],
    ["over_shipped", "OVER_SHIPPED"],
    ["over_received", "OVER_RECEIVED"],
    ["variance_reason_required", "VARIANCE_REASON_REQUIRED"],
  ])("accepts a known %s envelope code", (status, code) => {
    expect(mapSupplierPurchaseFulfillmentEnvelopeError(status, code))
      .not.toBeNull();
  });

  test("maps every public purchase requisition envelope code by status", () => {
    const requisitionSql = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260730150000_create_supplier_purchase_requisitions.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const purchaseOrderSql = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260729180000_create_supplier_purchase_orders.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const commandSources = [
      extractFunction(requisitionSql, "convert_supplier_purchase_requisition"),
      extractFunction(
        requisitionSql,
        "create_supplier_purchase_order_from_requisition",
      ),
      extractFunction(purchaseOrderSql, "save_supplier_purchase_order_draft"),
    ].join("\n");
    const pairs = [...commandSources.matchAll(
      /'status',\s*'([^']+)',\s*'error_code',\s*'([^']+)'/g,
    )].map((match) => [match[1]!, match[2]!] as const);

    expect(pairs.length).toBeGreaterThan(0);
    for (const [status, code] of pairs) {
      expect(
        mapSupplierPurchaseRequisitionEnvelopeError(status, code),
        `${status}:${code}`,
      ).not.toBeNull();
      expect(mapSupplierCommandDatabaseError(code), code).not.toBeNull();
    }
  });

  test.each(CONVERTED_ORDER_ERROR_PAIRS)(
    "maps converted order passthrough %s + %s",
    (status, code, statusCode) => {
      expect(mapSupplierPurchaseRequisitionEnvelopeError(status, code))
        .toMatchObject({ code, statusCode });
    },
  );

  test("rejects mismatched or unknown purchase requisition envelope codes", () => {
    expect(mapSupplierPurchaseRequisitionEnvelopeError(
      "not_found",
      "SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW",
    )).toBeNull();
    expect(mapSupplierPurchaseRequisitionEnvelopeError(
      "state_conflict",
      "SUPPLIER_PURCHASE_REQUISITION_UNKNOWN",
    )).toBeNull();
  });
});

function extractFunction(sql: string, name: string) {
  const start = sql.indexOf(`FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`missing SQL function ${name}`);
  const bodyStart = sql.indexOf("AS $$", start);
  const end = sql.indexOf("\n$$;", bodyStart);
  if (bodyStart < 0 || end < 0) {
    throw new Error(`incomplete SQL function ${name}`);
  }
  return sql.slice(start, end + 4);
}
