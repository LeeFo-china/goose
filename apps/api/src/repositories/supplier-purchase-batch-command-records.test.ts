import { describe, expect, test } from "bun:test";
import {
  SupplierPurchaseBatchCommandEnvelopeSchema,
} from "./supplier-purchase-batch-command-records";
import {
  SupplierPurchaseBatchRecordSchema,
} from "./supplier-purchase-batch-records";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const BATCH_ID = "a0000000-0000-4000-8000-000000000002";
const PROJECT_ID = "a0000000-0000-4000-8000-000000000003";
const EMPLOYEE_ID = "a0000000-0000-4000-8000-000000000004";
const CATEGORY_ID = "a0000000-0000-4000-8000-000000000005";
const RELATIONSHIP_ID = "a0000000-0000-4000-8000-000000000006";
const SUPPLIER_ID = "a0000000-0000-4000-8000-000000000007";
const RELATIONSHIP_ID_2 = "b0000000-0000-4000-8000-000000000006";
const SUPPLIER_ID_2 = "b0000000-0000-4000-8000-000000000007";
const SKU_ID = "a0000000-0000-4000-8000-000000000008";
const REQUISITION_ID = "a0000000-0000-4000-8000-000000000009";
const ORDER_ID = "a0000000-0000-4000-8000-00000000000a";
const AT = "2026-08-27T08:00:00.000Z";

const batch = {
  id: BATCH_ID, tenant_id: TENANT_ID, project_id: PROJECT_ID,
  batch_no: "PB-20260827-00000001", status: "draft",
  reason: "项目主材采购", expected_delivery_date: null, remark: null,
  priced_at: AT, currency: "CNY", subtotal_amount: "100.00",
  tax_amount: "13.00", total_amount: "113.00", budget_checked_at: null,
  budget_status: "unchecked", budget_snapshot: {}, split_generation: 0,
  supplier_count: 1, item_count: 1, version: 1,
  created_by_employee_id: EMPLOYEE_ID, updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: null, submitted_at: null,
  reviewed_by_employee_id: null, reviewed_at: null, review_remark: null,
  cancelled_by_employee_id: null, cancelled_at: null, cancel_reason: null,
  created_at: AT, updated_at: AT,
} as const;

const splitPreview = [{
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  supplier_name: "测试供应商",
  item_count: 1,
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
}] as const;

describe("supplier purchase batch command records", () => {
  test("requires exact success fields and an explicit idempotent boolean", () => {
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "saved", idempotent: false, batch, version: 1,
      split_preview: splitPreview,
    }).success).toBe(true);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "saved", batch, version: 1, split_preview: splitPreview,
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "saved", idempotent: false, batch, version: 1,
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "cancelled", idempotent: false,
      batch: { ...batch, status: "cancelled", version: 2 }, version: 2,
      split_preview: splitPreview,
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "saved", idempotent: false,
      batch: { ...batch, supplier_count: 2 }, version: 1,
      split_preview: splitPreview,
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "saved", idempotent: false,
      batch: { ...batch, supplier_count: 2 }, version: 1,
      split_preview: [splitPreview[0], splitPreview[0]],
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "saved", idempotent: false, batch, version: 1,
      split_preview: [{ ...splitPreview[0], total_amount: "112.99" }],
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "saved", idempotent: false,
      batch: { ...batch, supplier_count: 2 }, version: 1,
      split_preview: [
        { ...splitPreview[0], subtotal_amount: "40.00",
          tax_amount: "5.00", total_amount: "45.00" },
        { ...splitPreview[0], tenant_supplier_id: RELATIONSHIP_ID_2,
          supplier_id: SUPPLIER_ID_2, subtotal_amount: "60.00",
          tax_amount: "8.00", total_amount: "68.00" },
      ],
    }).success).toBe(false);
  });

  test("binds submitted results to unique requisition ids", () => {
    const submitted = { ...batch, status: "pending_approval", version: 2 };
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "submitted", idempotent: true, batch: submitted, version: 2,
      requisition_ids: [REQUISITION_ID],
    }).success).toBe(true);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "submitted", idempotent: false, batch: submitted, version: 2,
      requisition_ids: [REQUISITION_ID, REQUISITION_ID],
    }).success).toBe(false);
  });

  test("binds each error status to legal codes, version, and details", () => {
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "version_conflict", idempotent: true,
      error_code: "SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT", version: 2,
    }).success).toBe(true);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "version_conflict", idempotent: false,
      error_code: "SUPPLIER_PURCHASE_BATCH_NOT_FOUND", version: 2,
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "version_conflict", idempotent: false,
      error_code: "SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT", version: 0,
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "not_found", idempotent: false,
      error_code: "SUPPLIER_PURCHASE_BATCH_NOT_FOUND", version: 0,
    }).success).toBe(true);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "not_found", idempotent: false,
      error_code: "SUPPLIER_PURCHASE_BATCH_NOT_FOUND", version: 1,
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "state_conflict", idempotent: false,
      error_code: "SUPPLIER_PURCHASE_BATCH_ID_CONFLICT", version: 1,
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "price_changed", idempotent: false,
      error_code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", version: 1,
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "price_changed", idempotent: false,
      error_code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED", version: 1,
      details: [{ kind: "price", supplier_sku_id: SKU_ID, product_name: "商品",
        sku_name: "规格", frozen_unit_price: "100.00",
        current_unit_price: null, frozen_price_version: 1,
        current_price_version: null }],
    }).success).toBe(true);
  });

  test("accepts only UUID-keyed decimal-string budget snapshots", () => {
    const snapshot = { [CATEGORY_ID]: {
      requested_amount: "113.00", budget_amount: "100.00",
      expense_amount: "20.00", other_commitment_amount: "5.00",
      available_amount: "-25.00",
    } };
    expect(SupplierPurchaseBatchRecordSchema.safeParse({
      ...batch, budget_snapshot: snapshot,
    }).success).toBe(true);
    for (const budget_snapshot of [
      { invalid: snapshot[CATEGORY_ID] },
      { [CATEGORY_ID]: { ...snapshot[CATEGORY_ID], requested_amount: 113 } },
      { [CATEGORY_ID]: { ...snapshot[CATEGORY_ID], available_amount: "--1" } },
      { [CATEGORY_ID]: { ...snapshot[CATEGORY_ID], extra: "0.00" } },
    ]) {
      expect(SupplierPurchaseBatchRecordSchema.safeParse({
        ...batch, budget_snapshot,
      }).success).toBe(false);
    }
  });

  test("binds ordered results to stable submitted order summaries", () => {
    const ordered = { ...batch, status: "ordered", version: 3,
      submitted_by_employee_id: EMPLOYEE_ID, submitted_at: AT,
      reviewed_by_employee_id: EMPLOYEE_ID, reviewed_at: AT };
    const order = { id: ORDER_ID, order_no: "PO-20260827-00000001",
      tenant_supplier_id: RELATIONSHIP_ID, supplier_id: SUPPLIER_ID,
      supplier_name: "测试供应商", status: "submitted" };
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "ordered", idempotent: false, batch: ordered, version: 3,
      requisition_ids: [REQUISITION_ID], orders: [order],
    }).success).toBe(true);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "ordered", idempotent: false, batch: ordered, version: 3,
      requisition_ids: [REQUISITION_ID], orders: [order, order],
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "ordered", idempotent: false, batch: ordered, version: 3,
      requisition_ids: [REQUISITION_ID], orders: [{ ...order,
        status: "draft" }],
    }).success).toBe(false);
  });

  test("accepts rejected and persisted revision-required outcomes", () => {
    const rejected = { ...batch, status: "rejected", version: 3,
      submitted_by_employee_id: EMPLOYEE_ID, submitted_at: AT,
      reviewed_by_employee_id: EMPLOYEE_ID, reviewed_at: AT,
      review_remark: "价格需要重新协商" };
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "rejected", idempotent: false, batch: rejected, version: 3,
    }).success).toBe(true);

    const revised = { ...batch, status: "draft", version: 3 };
    const details = [{ kind: "price", supplier_sku_id: SKU_ID,
      product_name: "商品", sku_name: "规格", frozen_unit_price: "100.00",
      current_unit_price: "101.00", frozen_price_version: 1,
      current_price_version: 2 }];
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "revision_required", idempotent: false, batch: revised,
      version: 3, error_code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
      details,
    }).success).toBe(true);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      status: "revision_required", idempotent: false, batch: revised,
      version: 3, error_code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
      details: [{ ...details[0], current_unit_price: 101 }],
    }).success).toBe(false);
  });

  test("uses strict discriminated revision blockers", () => {
    const revised = { ...batch, status: "draft", version: 3 };
    const envelope = (details: unknown) => ({
      status: "revision_required", idempotent: false, batch: revised,
      version: 3, error_code: "SUPPLIER_PURCHASE_BATCH_BUDGET_CHANGED",
      details,
    });
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse(envelope([
      { kind: "budget", cost_category_id: CATEGORY_ID,
        submitted_requested_amount: "113.00",
        current_requested_amount: "113.00",
        submitted_available_amount: "500.00",
        current_available_amount: "490.00" },
      { kind: "supplier", tenant_supplier_id: RELATIONSHIP_ID,
        supplier_id: SUPPLIER_ID, reason: "inactive" },
      { kind: "item", supplier_sku_id: SKU_ID,
        reason: "child_snapshot_mismatch" },
    ])).success).toBe(true);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse(envelope([
      { kind: "supplier", tenant_supplier_id: RELATIONSHIP_ID,
        supplier_id: SUPPLIER_ID, reason: "inactive" },
      { kind: "budget", cost_category_id: CATEGORY_ID,
        submitted_requested_amount: "113.00",
        current_requested_amount: "113.00",
        submitted_available_amount: "500.00",
        current_available_amount: "490.00" },
    ])).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse({
      ...envelope([]), details: [],
    }).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse(envelope([
      { kind: "budget", cost_category_id: CATEGORY_ID,
        submitted_requested_amount: 113, current_requested_amount: "113.00",
        submitted_available_amount: "500.00",
        current_available_amount: "490.00" },
    ])).success).toBe(false);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse(envelope([
      { kind: "unknown", reason: "not allowed" },
    ])).success).toBe(false);
  });

  test("bounds the complete worst-case revision blocker set", () => {
    const revised = { ...batch, status: "draft", version: 3 };
    const item = { kind: "item", supplier_sku_id: SKU_ID,
      reason: "all_concurrent_changes" } as const;
    const envelope = (count: number) => ({
      status: "revision_required", idempotent: false, batch: revised,
      version: 3, error_code: "SUPPLIER_PURCHASE_BATCH_ITEM_UNAVAILABLE",
      details: Array.from({ length: count }, () => item),
    });
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse(
      envelope(540),
    ).success).toBe(true);
    expect(SupplierPurchaseBatchCommandEnvelopeSchema.safeParse(
      envelope(541),
    ).success).toBe(false);
  });
});
