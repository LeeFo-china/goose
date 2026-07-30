import { describe, expect, test } from "bun:test";

import {
  PROJECT_COST_COMMITMENT_SELECT,
  SUPPLIER_PURCHASE_REQUISITION_ITEM_SELECT,
  SUPPLIER_PURCHASE_REQUISITION_SELECT,
  ProjectCostCommitmentRecordSchema,
  SupplierPurchaseRequisitionCommandEnvelopeSchema,
  SupplierPurchaseRequisitionDetailSchema,
  SupplierPurchaseRequisitionItemSchema,
  SupplierPurchaseRequisitionRecordSchema,
} from "./supplier-purchase-requisition-records";

const ID = "20000000-0000-4000-8000-000000000001";
const TENANT_ID = "20000000-0000-4000-8000-000000000002";
const PROJECT_ID = "20000000-0000-4000-8000-000000000003";
const TENANT_SUPPLIER_ID = "20000000-0000-4000-8000-000000000004";
const SUPPLIER_ID = "20000000-0000-4000-8000-000000000005";
const EMPLOYEE_ID = "20000000-0000-4000-8000-000000000006";
const ITEM_ID = "20000000-0000-4000-8000-000000000007";
const COST_CATEGORY_ID = "20000000-0000-4000-8000-000000000008";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000009";
const SKU_ID = "20000000-0000-4000-8000-000000000010";
const PRICE_LIST_ID = "20000000-0000-4000-8000-000000000011";
const PRICE_LIST_ITEM_ID = "20000000-0000-4000-8000-000000000012";
const PURCHASE_UNIT_ID = "20000000-0000-4000-8000-000000000013";
const BASE_UNIT_ID = "20000000-0000-4000-8000-000000000014";
const COMMITMENT_ID = "20000000-0000-4000-8000-000000000015";
const PURCHASE_ORDER_ID = "20000000-0000-4000-8000-000000000016";
const AT = "2026-07-30T02:00:00.000Z";

const requisition = {
  id: ID,
  tenant_id: TENANT_ID,
  request_no: "PR-20260730-00000001",
  project_id: PROJECT_ID,
  tenant_supplier_id: TENANT_SUPPLIER_ID,
  supplier_id: SUPPLIER_ID,
  status: "pending_approval",
  budget_status: "over_budget",
  currency: "CNY",
  reason: "项目现场需要首批主材",
  expected_delivery_date: "2026-08-15",
  remark: null,
  priced_at: AT,
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
  purchase_order_id: null,
  version: 2,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: EMPLOYEE_ID,
  submitted_at: AT,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: AT,
  updated_at: AT,
} as const;

const item = {
  id: ITEM_ID,
  tenant_id: TENANT_ID,
  purchase_requisition_id: ID,
  line_no: 1,
  cost_category_id: COST_CATEGORY_ID,
  supplier_product_id: PRODUCT_ID,
  supplier_sku_id: SKU_ID,
  supplier_price_list_id: PRICE_LIST_ID,
  supplier_price_list_item_id: PRICE_LIST_ITEM_ID,
  product_code_snapshot: "MAT-001",
  product_name_snapshot: "乳胶漆",
  sku_code_snapshot: "MAT-001-WHITE",
  sku_name_snapshot: "乳胶漆白色",
  specification_snapshot: "20L",
  model_snapshot: null,
  purchase_unit_id: PURCHASE_UNIT_ID,
  purchase_unit_code_snapshot: "BUCKET",
  purchase_unit_name_snapshot: "桶",
  purchase_unit_symbol_snapshot: "桶",
  base_unit_id: BASE_UNIT_ID,
  base_unit_code_snapshot: "L",
  base_unit_name_snapshot: "升",
  base_unit_symbol_snapshot: "L",
  base_unit_conversion: "20.0000",
  price_list_code_snapshot: "PL-001",
  price_list_version_snapshot: 3,
  price_effective_from_snapshot: AT,
  price_effective_until_snapshot: null,
  quantity: "2.5000",
  unit_price: "40.00",
  tax_rate: "0.1300",
  tax_inclusive: false,
  line_subtotal_amount: "100.00",
  line_tax_amount: "13.00",
  line_total_amount: "113.00",
  created_at: AT,
} as const;

const commitment = {
  id: COMMITMENT_ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  cost_category_id: COST_CATEGORY_ID,
  source_type: "supplier_purchase_requisition",
  source_id: ID,
  amount: "113.00",
  status: "reserved",
  budget_amount_snapshot: "1000.00",
  expense_amount_snapshot: "800.00",
  other_commitment_amount_snapshot: "150.00",
  available_amount_snapshot: "-63.00",
  created_by_employee_id: EMPLOYEE_ID,
  released_by_employee_id: null,
  released_at: null,
  release_reason: null,
  created_at: AT,
  updated_at: AT,
} as const;

describe("supplier purchase requisition database records", () => {
  test("selects every numeric database fact as text", () => {
    for (const field of [
      "subtotal_amount::text",
      "tax_amount::text",
      "total_amount::text",
    ]) {
      expect(SUPPLIER_PURCHASE_REQUISITION_SELECT).toContain(field);
    }
    for (const field of [
      "base_unit_conversion::text",
      "quantity::text",
      "unit_price::text",
      "tax_rate::text",
      "line_subtotal_amount::text",
      "line_tax_amount::text",
      "line_total_amount::text",
    ]) {
      expect(SUPPLIER_PURCHASE_REQUISITION_ITEM_SELECT).toContain(field);
    }
    for (const field of [
      "amount::text",
      "budget_amount_snapshot::text",
      "expense_amount_snapshot::text",
      "other_commitment_amount_snapshot::text",
      "available_amount_snapshot::text",
    ]) {
      expect(PROJECT_COST_COMMITMENT_SELECT).toContain(field);
    }
  });

  test("strictly parses a requisition header", () => {
    expect(SupplierPurchaseRequisitionRecordSchema.parse(requisition))
      .toEqual(requisition);
    for (const invalid of [
      { ...requisition, status: "submitted" },
      { ...requisition, budget_status: "unknown" },
      { ...requisition, currency: "USD" },
      { ...requisition, expected_delivery_date: "30/07/2026" },
      { ...requisition, submitted_at: "yesterday" },
      { ...requisition, reviewed_by_employee_id: "invalid" },
      { ...requisition, version: 0 },
      { ...requisition, extra: true },
    ]) {
      expect(SupplierPurchaseRequisitionRecordSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  test("requires header amounts to remain numeric strings", () => {
    for (const field of [
      "subtotal_amount",
      "tax_amount",
      "total_amount",
    ] as const) {
      expect(SupplierPurchaseRequisitionRecordSchema.safeParse({
        ...requisition,
        [field]: 1,
      }).success).toBe(false);
      expect(SupplierPurchaseRequisitionRecordSchema.safeParse({
        ...requisition,
        [field]: "not-numeric",
      }).success).toBe(false);
    }
  });

  test("strictly parses an item with immutable price and unit snapshots", () => {
    expect(SupplierPurchaseRequisitionItemSchema.parse(item)).toEqual(item);
    expect(SupplierPurchaseRequisitionItemSchema.safeParse({
      ...item,
      line_no: 0,
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionItemSchema.safeParse({
      ...item,
      price_effective_from_snapshot: "invalid",
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionItemSchema.safeParse({
      ...item,
      updated_at: AT,
    }).success).toBe(false);
  });

  test("requires every item quantity and amount to remain a string", () => {
    for (const field of [
      "base_unit_conversion",
      "quantity",
      "unit_price",
      "tax_rate",
      "line_subtotal_amount",
      "line_tax_amount",
      "line_total_amount",
    ] as const) {
      expect(SupplierPurchaseRequisitionItemSchema.safeParse({
        ...item,
        [field]: 1,
      }).success).toBe(false);
    }
  });

  test("strictly parses project cost commitments and budget snapshots", () => {
    expect(ProjectCostCommitmentRecordSchema.parse(commitment))
      .toEqual(commitment);
    for (const invalid of [
      { ...commitment, source_type: "purchase_order" },
      { ...commitment, status: "pending" },
      { ...commitment, released_by_employee_id: "invalid" },
      { ...commitment, released_at: "invalid" },
      { ...commitment, extra: true },
    ]) {
      expect(ProjectCostCommitmentRecordSchema.safeParse(invalid).success)
        .toBe(false);
    }
    for (const field of [
      "amount",
      "budget_amount_snapshot",
      "expense_amount_snapshot",
      "other_commitment_amount_snapshot",
      "available_amount_snapshot",
    ] as const) {
      expect(ProjectCostCommitmentRecordSchema.safeParse({
        ...commitment,
        [field]: 1,
      }).success).toBe(false);
    }
  });

  test("strictly parses requisition details", () => {
    const detail = {
      requisition,
      items: [item],
      budget_snapshots: [commitment],
    };
    expect(SupplierPurchaseRequisitionDetailSchema.parse(detail))
      .toEqual(detail);
    expect(SupplierPurchaseRequisitionDetailSchema.safeParse({
      ...detail,
      unknown: true,
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionDetailSchema.safeParse({
      ...detail,
      budget_snapshots: [{ ...commitment, amount: 113 }],
    }).success).toBe(false);
  });
});

describe("supplier purchase requisition command envelope", () => {
  test("accepts only stable success and error statuses", () => {
    for (const status of [
      "saved",
      "submitted",
      "approved",
      "rejected",
      "cancelled",
      "converted",
      "validation_error",
      "not_found",
      "version_conflict",
      "state_conflict",
      "price_missing",
      "price_changed",
      "supplier_not_eligible",
      "project_invalid",
      "self_review",
      "idempotency_conflict",
    ] as const) {
      expect(SupplierPurchaseRequisitionCommandEnvelopeSchema.parse({ status }))
        .toEqual({ status });
    }
    expect(SupplierPurchaseRequisitionCommandEnvelopeSchema.safeParse({
      status: "budget_changed",
    }).success).toBe(false);
  });

  test("accepts bounded optional command facts and rejects unknown keys", () => {
    expect(SupplierPurchaseRequisitionCommandEnvelopeSchema.parse({
      status: "converted",
      idempotent: true,
      requisition: {
        ...requisition,
        status: "converted",
        purchase_order_id: PURCHASE_ORDER_ID,
      },
      version: 3,
      error_code: "ALREADY_CONVERTED",
      reason: "幂等重放",
    })).toMatchObject({
      status: "converted",
      idempotent: true,
      version: 3,
    });
    expect(SupplierPurchaseRequisitionCommandEnvelopeSchema.safeParse({
      status: "saved",
      purchase_order_id: PURCHASE_ORDER_ID,
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionCommandEnvelopeSchema.safeParse({
      status: "saved",
      version: -1,
    }).success).toBe(false);
  });
});
