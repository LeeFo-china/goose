import { describe, expect, test } from "bun:test";

import {
  PROJECT_COST_COMMITMENT_SELECT,
  SUPPLIER_PURCHASE_REQUISITION_ITEM_SELECT,
  SUPPLIER_PURCHASE_REQUISITION_SELECT,
  ProjectCostCommitmentRecordSchema,
  SupplierPurchaseRequisitionCommandEnvelopeSchema,
  SupplierPurchaseRequisitionDetailSchema,
  SupplierPurchaseRequisitionItemPageSchema,
  SupplierPurchaseRequisitionItemSchema,
  SupplierPurchaseRequisitionRecordSchema,
} from "./supplier-purchase-requisition-records";

const ID = "20000000-0000-4000-8000-000000000001",
  TENANT_ID = "20000000-0000-4000-8000-000000000002",
  PROJECT_ID = "20000000-0000-4000-8000-000000000003",
  TENANT_SUPPLIER_ID = "20000000-0000-4000-8000-000000000004";
const SUPPLIER_ID = "20000000-0000-4000-8000-000000000005",
  EMPLOYEE_ID = "20000000-0000-4000-8000-000000000006",
  ITEM_ID = "20000000-0000-4000-8000-000000000007",
  COST_CATEGORY_ID = "20000000-0000-4000-8000-000000000008";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000009",
  SKU_ID = "20000000-0000-4000-8000-000000000010",
  PRICE_LIST_ID = "20000000-0000-4000-8000-000000000011",
  PRICE_LIST_ITEM_ID = "20000000-0000-4000-8000-000000000012";
const PURCHASE_UNIT_ID = "20000000-0000-4000-8000-000000000013",
  BASE_UNIT_ID = "20000000-0000-4000-8000-000000000014",
  COMMITMENT_ID = "20000000-0000-4000-8000-000000000015",
  PURCHASE_ORDER_ID = "20000000-0000-4000-8000-000000000016",
  WAREHOUSE_ID = "20000000-0000-4000-8000-000000000017";
const AT = "2026-07-30T02:00:00.000Z";

const requisition = {
  id: ID, tenant_id: TENANT_ID, request_no: "PR-20260730-00000001",
  project_id: PROJECT_ID, destination_type: "project", warehouse_id: null,
  tenant_supplier_id: TENANT_SUPPLIER_ID, supplier_id: SUPPLIER_ID,
  status: "pending_approval", budget_status: "over_budget", currency: "CNY",
  reason: "项目现场需要首批主材", expected_delivery_date: "2026-08-15",
  remark: null, priced_at: AT, subtotal_amount: "100.00",
  tax_amount: "13.00", total_amount: "113.00", purchase_order_id: null,
  purchase_batch_id: null, split_generation: null, version: 2,
  created_by_employee_id: EMPLOYEE_ID, updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: EMPLOYEE_ID, submitted_at: AT,
  reviewed_by_employee_id: null, reviewed_at: null, review_remark: null,
  cancelled_by_employee_id: null, cancelled_at: null, cancel_reason: null,
  created_at: AT, updated_at: AT,
  project: { id: PROJECT_ID, name: "示范项目", status: "active" },
  warehouse: null,
} as const;

const warehouseRequisition = {
  ...requisition,
  project_id: null,
  destination_type: "warehouse",
  warehouse_id: WAREHOUSE_ID,
  project: null,
  warehouse: { id: WAREHOUSE_ID, name: "中心仓", status: "active" },
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
    expect(SUPPLIER_PURCHASE_REQUISITION_SELECT).toContain(
      "destination_type",
    );
    expect(SUPPLIER_PURCHASE_REQUISITION_SELECT).toContain("warehouse_id");
    expect(SUPPLIER_PURCHASE_REQUISITION_SELECT).toContain("project:projects!supplier_purchase_requisitions_project_tenant_fkey(id,name,status)");
    expect(SUPPLIER_PURCHASE_REQUISITION_SELECT).toContain("warehouse:warehouses!supplier_purchase_requisitions_warehouse_tenant_fkey(id,name,status)");
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

  test("parses project and warehouse destination headers", () => {
    expect(SupplierPurchaseRequisitionRecordSchema.parse(requisition))
      .toMatchObject({ destination_type: "project", project_id: PROJECT_ID,
        warehouse_id: null, warehouse: null });
    expect(SupplierPurchaseRequisitionRecordSchema.parse(warehouseRequisition))
      .toMatchObject({
        destination_type: "warehouse",
        project_id: null,
        warehouse_id: WAREHOUSE_ID,
        project: null,
        warehouse: { id: WAREHOUSE_ID, name: "中心仓", status: "active" },
      });
  });

  test("rejects inconsistent requisition destinations", () => {
    for (const invalid of [
      { ...requisition, project_id: null },
      { ...requisition, warehouse_id: WAREHOUSE_ID },
      { ...warehouseRequisition, project_id: PROJECT_ID },
      { ...warehouseRequisition, warehouse_id: null },
    ]) {
      expect(SupplierPurchaseRequisitionRecordSchema.safeParse(invalid).success)
        .toBe(false);
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

  test("requires a complete nullable batch ownership pair", () => {
    for (const field of ["purchase_batch_id", "split_generation"] as const) {
      const missing = Object.fromEntries(
        Object.entries(requisition).filter(([key]) => key !== field),
      );
      expect(SupplierPurchaseRequisitionRecordSchema.safeParse(missing).success)
        .toBe(false);
    }
    expect(SupplierPurchaseRequisitionRecordSchema.safeParse({
      ...requisition,
      purchase_batch_id: ID,
      split_generation: 1,
    }).success).toBe(true);
    for (const invalid of [
      { ...requisition, purchase_batch_id: ID },
      { ...requisition, split_generation: 1 },
    ]) {
      expect(SupplierPurchaseRequisitionRecordSchema.safeParse(invalid).success)
        .toBe(false);
    }
  });

  test("enforces numeric eighteen scale two header money", () => {
    for (const field of [
      "subtotal_amount",
      "tax_amount",
      "total_amount",
    ] as const) {
      expect(SupplierPurchaseRequisitionRecordSchema.parse({
        ...requisition,
        [field]: "0.00",
      })[field]).toBe("0.00");
      expect(SupplierPurchaseRequisitionRecordSchema.parse({
        ...requisition,
        [field]: "9999999999999999.99",
      })[field]).toBe("9999999999999999.99");
      for (const value of [
        1,
        "-0.01",
        "1.001",
        "10000000000000000",
        "not-numeric",
      ]) {
        expect(SupplierPurchaseRequisitionRecordSchema.safeParse({
          ...requisition,
          [field]: value,
        }).success).toBe(false);
      }
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

  test("enforces precise string quantity, conversion, price and tax domains", () => {
    const boundaries = {
      quantity: "99999999999999.9999",
      base_unit_conversion: "9999999999.99999999",
      unit_price: "999999999999.99",
      tax_rate: "1.000000",
    } as const;
    for (const [field, value] of Object.entries(boundaries)) {
      expect(SupplierPurchaseRequisitionItemSchema.parse({
        ...item,
        [field]: value,
      })[field as keyof typeof item]).toBe(value);
    }
    expect(SupplierPurchaseRequisitionItemSchema.parse({
      ...item,
      unit_price: "0.00",
      tax_rate: "0.000000",
    })).toMatchObject({
      unit_price: "0.00",
      tax_rate: "0.000000",
    });
    for (const [field, values] of Object.entries({
      quantity: [1, "0", "-0.0001", "1.00001", "100000000000000"],
      base_unit_conversion: [
        1,
        "0",
        "-0.00000001",
        "1.000000001",
        "10000000000",
      ],
      unit_price: [1, "-0.01", "1.001", "1000000000000"],
      tax_rate: [1, "-0.000001", "1.000001", "2", "0.0000001"],
    })) {
      for (const value of values) {
        expect(SupplierPurchaseRequisitionItemSchema.safeParse({
          ...item,
          [field]: value,
        }).success).toBe(false);
      }
    }
  });

  test("enforces numeric eighteen scale two line money", () => {
    for (const field of [
      "line_subtotal_amount",
      "line_tax_amount",
      "line_total_amount",
    ] as const) {
      expect(SupplierPurchaseRequisitionItemSchema.parse({
        ...item,
        [field]: "0.00",
      })[field]).toBe("0.00");
      expect(SupplierPurchaseRequisitionItemSchema.parse({
        ...item,
        [field]: "9999999999999999.99",
      })[field]).toBe("9999999999999999.99");
      for (const value of [
        1,
        "-0.01",
        "1.001",
        "10000000000000000",
      ]) {
        expect(SupplierPurchaseRequisitionItemSchema.safeParse({
          ...item,
          [field]: value,
        }).success).toBe(false);
      }
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
    ] as const) {
      expect(ProjectCostCommitmentRecordSchema.parse({
        ...commitment,
        [field]: "0.00",
      })[field]).toBe("0.00");
      expect(ProjectCostCommitmentRecordSchema.parse({
        ...commitment,
        [field]: "9999999999999999.99",
      })[field]).toBe("9999999999999999.99");
      for (const value of [
        1,
        "-0.01",
        "1.001",
        "10000000000000000",
      ]) {
        expect(ProjectCostCommitmentRecordSchema.safeParse({
          ...commitment,
          [field]: value,
        }).success).toBe(false);
      }
    }
    expect(ProjectCostCommitmentRecordSchema.parse({
      ...commitment,
      available_amount_snapshot: "-9999999999999999.99",
    }).available_amount_snapshot).toBe("-9999999999999999.99");
    for (const value of [
      1,
      "-1.001",
      "-10000000000000000",
      "10000000000000000",
    ]) {
      expect(ProjectCostCommitmentRecordSchema.safeParse({
        ...commitment,
        available_amount_snapshot: value,
      }).success).toBe(false);
    }
  });

  test("keeps detail free of unpaginated item arrays", () => {
    const detail = {
      requisition,
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
    expect(SupplierPurchaseRequisitionDetailSchema.safeParse({
      ...detail,
      items: [item],
    }).success).toBe(false);
  });

  test("strictly parses a paginated requisition item page", () => {
    const page = {
      list: [item],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
    };
    expect(SupplierPurchaseRequisitionItemPageSchema.parse(page)).toEqual(page);
    expect(SupplierPurchaseRequisitionItemPageSchema.safeParse({
      ...page,
      pagination: { ...page.pagination, pageSize: 101 },
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionItemPageSchema.safeParse({
      ...page,
      pagination: { ...page.pagination, extra: true },
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionItemPageSchema.safeParse({
      ...page,
      unknown: true,
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
      purchase_order_id: PURCHASE_ORDER_ID,
      version: 3,
      error_code: "ALREADY_CONVERTED",
      reason: "幂等重放",
    })).toMatchObject({
      status: "converted",
      idempotent: true,
      purchase_order_id: PURCHASE_ORDER_ID,
      version: 3,
    });
    expect(SupplierPurchaseRequisitionCommandEnvelopeSchema.safeParse({
      status: "saved",
      unknown: PURCHASE_ORDER_ID,
    }).success).toBe(false);
    expect(SupplierPurchaseRequisitionCommandEnvelopeSchema.safeParse({
      status: "saved",
      version: -1,
    }).success).toBe(false);
  });
});
