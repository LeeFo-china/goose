import type { SmokeSql } from "./supplier-purchase-order-smoke-fixture";
import {
  convertRequisition,
  reviewRequisition,
  saveRequisition,
  submitRequisition,
  type RequisitionSmokeFixture,
} from "./supplier-purchase-requisition-smoke-sql";

class SupplierPurchaseOrderSmokeRequisitionError extends Error {}

export async function createDraftOrderFromApprovedRequisition(
  sql: SmokeSql,
  fixture: RequisitionSmokeFixture,
  requisitionId: string,
  orderId: string,
  idempotencyPrefix: string,
) {
  await saveRequisition(
    sql,
    fixture,
    requisitionId,
    0,
    `${idempotencyPrefix}-save`,
    2,
  );
  await submitRequisition(
    sql,
    fixture,
    requisitionId,
    1,
    `${idempotencyPrefix}-submit`,
  );
  await reviewRequisition(
    sql,
    fixture,
    requisitionId,
    2,
    "approve",
    `${idempotencyPrefix}-approve`,
  );
  const result = await convertRequisition(
    sql,
    fixture,
    requisitionId,
    orderId,
    3,
    `${idempotencyPrefix}-convert`,
  );
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw new SupplierPurchaseOrderSmokeRequisitionError(
      "converted requisition must be an object",
    );
  }
  const converted = result as Record<string, unknown>;
  if (
    converted.status !== "converted" ||
    converted.purchase_order_id !== orderId
  ) {
    throw new SupplierPurchaseOrderSmokeRequisitionError(
      "approved requisition must convert to the requested purchase order",
    );
  }
}
