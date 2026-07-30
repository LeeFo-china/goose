import {
  FULFILLMENT_SMOKE_IDS,
  type FulfillmentSmokeFixture,
  type FulfillmentSmokeSql,
} from "./supplier-purchase-fulfillment-smoke-fixture";

type ResultRow = { result: unknown };
type ActorScope = {
  tenantId: string;
  userId: string;
  employeeId: string;
};
type ShipmentInput = {
  id: string;
  version: number;
  number: string;
  quantity: number;
  idempotencyKey: string;
};
type ReceiptInput = {
  id: string;
  version: number;
  number: string;
  acceptedQuantity: number;
  rejectedQuantity: number;
  varianceReason: string | null;
  idempotencyKey: string;
};

export type FulfillmentCommandExpectation = {
  status: "confirmed" | "shipment_created" | "receipt_created";
  idempotent: boolean;
  version: number;
  fulfillmentStatus:
    | "confirmed"
    | "partially_shipped"
    | "shipped"
    | "partially_received"
    | "received"
    | "received_with_variance"
    | "cancelled";
};

export class SupplierPurchaseFulfillmentSmokeAssertionError extends Error {}

export function requireRecord(value: unknown, label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      `${label} must be an object`,
    );
  }
  return value as Record<string, unknown>;
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      `${label} must equal ${String(expected)}`,
    );
  }
}

export function assertFulfillmentCommandResult(
  value: unknown,
  expected: FulfillmentCommandExpectation,
) {
  const result = requireRecord(value, "fulfillment command result");
  if (typeof result.status !== "string") {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "status must be a string",
    );
  }
  if (typeof result.idempotent !== "boolean") {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "idempotent must be a boolean",
    );
  }
  if (
    typeof result.version !== "number" ||
    !Number.isInteger(result.version) ||
    result.version <= 0
  ) {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "version must be a positive integer",
    );
  }
  const fulfillment = requireRecord(result.fulfillment, "fulfillment");
  if (typeof fulfillment.status !== "string") {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "fulfillment.status must be a string",
    );
  }
  assertEqual(result.status, expected.status, "status");
  assertEqual(result.idempotent, expected.idempotent, "idempotent");
  assertEqual(result.version, expected.version, "version");
  assertEqual(
    fulfillment.status,
    expected.fulfillmentStatus,
    "fulfillment.status",
  );
  return result;
}

export function assertErrorEnvelope(
  value: unknown,
  expectedStatus: string,
  expectedCode: string,
) {
  const result = requireRecord(value, "fulfillment error result");
  if (typeof result.status !== "string") {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "error status must be a string",
    );
  }
  if (typeof result.error_code !== "string") {
    throw new SupplierPurchaseFulfillmentSmokeAssertionError(
      "error_code must be a string",
    );
  }
  assertEqual(result.status, expectedStatus, "error status");
  assertEqual(result.error_code, expectedCode, "error_code");
  return result;
}

export function assertFulfillmentFacts(
  value: unknown,
  expected: {
    ordered: string;
    shipped: string;
    received: string;
    accepted: string;
    rejected: string;
    subtotal: string;
    tax: string;
    total: string;
  },
) {
  const result = requireRecord(value, "fulfillment facts");
  for (
    const [field, expectedValue] of [
      ["ordered_quantity", expected.ordered],
      ["shipped_quantity", expected.shipped],
      ["received_quantity", expected.received],
      ["accepted_quantity", expected.accepted],
      ["rejected_quantity", expected.rejected],
      ["accepted_subtotal_amount", expected.subtotal],
      ["accepted_tax_amount", expected.tax],
      ["accepted_total_amount", expected.total],
    ] as const
  ) {
    if (typeof result[field] !== "string") {
      throw new SupplierPurchaseFulfillmentSmokeAssertionError(
        `${field} must be a string`,
      );
    }
    assertEqual(result[field], expectedValue, field);
  }
  return result;
}

export async function confirmFulfillment(
  sql: FulfillmentSmokeSql,
  fixture: FulfillmentSmokeFixture,
  idempotencyKey: string,
  actor: ActorScope = {
    tenantId: fixture.tenant_id,
    userId: fixture.user_id,
    employeeId: fixture.employee_id,
  },
) {
  const rows = await sql<ResultRow[]>`
    select public.confirm_supplier_purchase_order_fulfillment(
      ${FULFILLMENT_SMOKE_IDS.order}::uuid,
      ${actor.tenantId}::uuid,
      2::integer,
      '2026-07-30T00:00:00.000Z'::timestamptz,
      '数据库履约 smoke',
      ${actor.userId}::uuid,
      ${actor.employeeId}::uuid,
      ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function createShipment(
  sql: FulfillmentSmokeSql,
  fixture: FulfillmentSmokeFixture,
  input: ShipmentInput,
) {
  const items = [{
    purchase_order_item_id: fixture.order_item_id,
    quantity: input.quantity,
  }];
  const rows = await sql<ResultRow[]>`
    select public.create_supplier_purchase_order_shipment(
      ${input.id}::uuid,
      ${FULFILLMENT_SMOKE_IDS.order}::uuid,
      ${fixture.tenant_id}::uuid,
      ${input.version}::integer,
      ${input.number},
      '2026-07-30T01:00:00.000Z'::timestamptz,
      '数据库承运方',
      'SMOKE-TRACKING',
      '数据库履约 smoke',
      ${items}::jsonb,
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      ${input.idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function createReceipt(
  sql: FulfillmentSmokeSql,
  fixture: FulfillmentSmokeFixture,
  input: ReceiptInput,
) {
  const items = [{
    purchase_order_item_id: fixture.order_item_id,
    accepted_quantity: input.acceptedQuantity,
    rejected_quantity: input.rejectedQuantity,
    variance_reason: input.varianceReason,
  }];
  const rows = await sql<ResultRow[]>`
    select public.create_supplier_purchase_order_receipt(
      ${input.id}::uuid,
      ${FULFILLMENT_SMOKE_IDS.order}::uuid,
      ${fixture.tenant_id}::uuid,
      ${input.version}::integer,
      ${input.number},
      '2026-07-30T02:00:00.000Z'::timestamptz,
      '数据库履约 smoke',
      ${items}::jsonb,
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      ${input.idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function cancelOrderAfterShipment(
  sql: FulfillmentSmokeSql,
  fixture: FulfillmentSmokeFixture,
) {
  const rows = await sql<ResultRow[]>`
    select public.cancel_supplier_purchase_order(
      ${FULFILLMENT_SMOKE_IDS.order}::uuid,
      ${fixture.tenant_id}::uuid,
      2::integer,
      '数据库履约 smoke 取消',
      ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid,
      'fulfillment-smoke-cancel-after-shipment'
    ) as result;
  `;
  return rows[0]?.result;
}

export async function expectIdempotencyConflict(
  sql: FulfillmentSmokeSql,
  callback: (savepoint: FulfillmentSmokeSql) => Promise<unknown>,
) {
  try {
    await sql.savepoint(callback);
  } catch (error) {
    if (
      error instanceof Bun.SQL.PostgresError &&
      error.errno === "P0001" &&
      error.message === "SUPPLIER_IDEMPOTENCY_CONFLICT"
    ) {
      return;
    }
    throw error;
  }
  throw new SupplierPurchaseFulfillmentSmokeAssertionError(
    "expected SUPPLIER_IDEMPOTENCY_CONFLICT",
  );
}
