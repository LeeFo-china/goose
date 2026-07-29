import { describe, expect, test } from "bun:test";

import {
  SupplierPurchaseOrderCancelSchema,
  SupplierPurchaseOrderCatalogQuerySchema,
  SupplierPurchaseOrderDraftSchema,
  SupplierPurchaseOrderFulfillmentConfirmSchema,
  SupplierPurchaseOrderFulfillmentEventListQuerySchema,
  SupplierPurchaseOrderListQuerySchema,
  SupplierPurchaseOrderOptionQuerySchema,
  SupplierPurchaseOrderReceiptCreateSchema,
  SupplierPurchaseOrderShipmentCreateSchema,
  SupplierPurchaseOrderSubmitSchema,
} from "./supplier-purchase-orders";

const projectId = "30000000-0000-4000-8000-000000000001";
const tenantSupplierId = "30000000-0000-4000-8000-000000000002";
const skuId = "30000000-0000-4000-8000-000000000003";
const purchaseOrderItemId = "30000000-0000-4000-8000-000000000004";
const secondPurchaseOrderItemId = "30000000-0000-4000-8000-000000000005";
const shipmentId = "30000000-0000-4000-8000-000000000006";
const receiptId = "30000000-0000-4000-8000-000000000007";
const caseVariantItemId = "abcdefab-cdef-4abc-8def-abcdefabcdef";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    project_id: projectId,
    tenant_supplier_id: tenantSupplierId,
    expected_version: 0,
    expected_delivery_date: "2026-08-15",
    remark: "主材首批采购",
    items: [{ supplier_sku_id: skuId, quantity: 2.5 }],
    ...overrides,
  };
}

describe("supplier purchase order schemas", () => {
  test("defaults and caps order list pagination", () => {
    expect(SupplierPurchaseOrderListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(SupplierPurchaseOrderListQuerySchema.safeParse({
      pageSize: "101",
    }).success).toBe(false);
  });

  test("accepts bounded order filters and rejects unknown filters", () => {
    expect(SupplierPurchaseOrderListQuerySchema.parse({
      keyword: " PO-20260729 ",
      status: "draft",
      projectId,
      tenantSupplierId,
    })).toMatchObject({
      keyword: "PO-20260729",
      status: "draft",
      projectId,
      tenantSupplierId,
    });
    expect(SupplierPurchaseOrderListQuerySchema.safeParse({
      project_id: projectId,
    }).success).toBe(false);
  });

  test("bounds project and supplier option pagination", () => {
    expect(SupplierPurchaseOrderOptionQuerySchema.parse({
      page: "2",
      pageSize: "100",
      keyword: " 建材 ",
    })).toEqual({
      page: 2,
      pageSize: 100,
      keyword: "建材",
    });
    expect(SupplierPurchaseOrderOptionQuerySchema.safeParse({
      page: 1,
      pageSize: 101,
    }).success).toBe(false);
  });

  test("requires a tenant supplier for the paginated purchase catalog", () => {
    expect(SupplierPurchaseOrderCatalogQuerySchema.parse({
      tenantSupplierId,
    })).toEqual({
      tenantSupplierId,
      page: 1,
      pageSize: 20,
    });
    expect(SupplierPurchaseOrderCatalogQuerySchema.safeParse({}).success)
      .toBe(false);
  });

  test("accepts a project-bound draft without client price facts", () => {
    expect(SupplierPurchaseOrderDraftSchema.parse(draft())).toEqual(draft());
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [{
        supplier_sku_id: skuId,
        quantity: 2,
        unit_price: 1,
      }],
    })).success).toBe(false);
  });

  test("requires one to one hundred unique SKU lines", () => {
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [],
    })).success).toBe(false);
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [
        { supplier_sku_id: skuId, quantity: 1 },
        { supplier_sku_id: skuId, quantity: 2 },
      ],
    })).success).toBe(false);
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: Array.from({ length: 101 }, (_, index) => ({
        supplier_sku_id: `30000000-0000-4000-8000-${
          String(index + 10).padStart(12, "0")
        }`,
        quantity: 1,
      })),
    })).success).toBe(false);
  });

  test("rejects invalid quantity precision and nonpositive quantities", () => {
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [{ supplier_sku_id: skuId, quantity: 0 }],
    })).success).toBe(false);
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      items: [{ supplier_sku_id: skuId, quantity: 1.00001 }],
    })).success).toBe(false);
  });

  test("uses version zero only for draft creation", () => {
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      expected_version: -1,
    })).success).toBe(false);
    expect(SupplierPurchaseOrderDraftSchema.safeParse(draft({
      expected_version: 1,
    })).success).toBe(true);
    expect(SupplierPurchaseOrderSubmitSchema.safeParse({
      expected_version: 0,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderSubmitSchema.parse({
      expected_version: 2,
    })).toEqual({ expected_version: 2 });
  });

  test("requires a bounded nonblank cancellation reason", () => {
    expect(SupplierPurchaseOrderCancelSchema.safeParse({
      expected_version: 2,
      reason: " ",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderCancelSchema.parse({
      expected_version: 2,
      reason: " 项目采购计划调整 ",
    })).toEqual({
      expected_version: 2,
      reason: "项目采购计划调整",
    });
  });
});

describe("supplier purchase order fulfillment schemas", () => {
  test("accepts a strict confirmation with a positive version and offset time", () => {
    expect(SupplierPurchaseOrderFulfillmentConfirmSchema.parse({
      expected_version: 3,
      confirmed_at: "2026-07-30T10:00:00.000+08:00",
      remark: " 供应商电话确认 ",
    })).toEqual({
      expected_version: 3,
      confirmed_at: "2026-07-30T10:00:00.000+08:00",
      remark: "供应商电话确认",
    });
    expect(SupplierPurchaseOrderFulfillmentConfirmSchema.safeParse({
      expected_version: 0,
      confirmed_at: "2026-07-30T10:00:00.000+08:00",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderFulfillmentConfirmSchema.safeParse({
      expected_version: 1.5,
      confirmed_at: "2026-07-30T10:00:00.000+08:00",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderFulfillmentConfirmSchema.safeParse({
      expected_version: 1,
      confirmed_at: "2026-07-30T10:00:00",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderFulfillmentConfirmSchema.safeParse({
      expected_version: 1,
      confirmed_at: "2026-07-30T02:00:00.000Z",
      unknown: true,
    }).success).toBe(false);
  });

  test("allows a null confirmation remark and caps it at 500 characters", () => {
    expect(SupplierPurchaseOrderFulfillmentConfirmSchema.parse({
      expected_version: 1,
      confirmed_at: "2026-07-30T02:00:00.000Z",
      remark: null,
    }).remark).toBeNull();
    expect(SupplierPurchaseOrderFulfillmentConfirmSchema.safeParse({
      expected_version: 1,
      confirmed_at: "2026-07-30T02:00:00.000Z",
      remark: "a".repeat(501),
    }).success).toBe(false);
  });

  test("accepts a strict shipment and trims bounded text fields", () => {
    expect(SupplierPurchaseOrderShipmentCreateSchema.parse({
      id: shipmentId,
      expected_fulfillment_version: 1,
      shipment_no: " SHIP-001 ",
      carrier_name: " 顺丰 ",
      tracking_no: null,
      shipped_at: "2026-07-30T11:00:00+08:00",
      remark: " 首批 ",
      items: [{ purchase_order_item_id: purchaseOrderItemId, quantity: 2.5 }],
    })).toEqual({
      id: shipmentId,
      expected_fulfillment_version: 1,
      shipment_no: "SHIP-001",
      carrier_name: "顺丰",
      tracking_no: null,
      shipped_at: "2026-07-30T11:00:00+08:00",
      remark: "首批",
      items: [{ purchase_order_item_id: purchaseOrderItemId, quantity: 2.5 }],
    });
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      shipment_no: " ",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      id: "invalid",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      expected_fulfillment_version: 0,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      expected_fulfillment_version: 1.5,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      shipment_no: "a".repeat(81),
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      carrier_name: "a".repeat(101),
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      tracking_no: "a".repeat(121),
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      remark: "a".repeat(501),
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      shipped_at: "2026-07-30T03:00:00",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      unknown: true,
    }).success).toBe(false);
  });

  test("requires one to one hundred unique positive shipment lines", () => {
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      items: [],
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      items: Array.from({ length: 101 }, (_, index) => ({
        purchase_order_item_id: fulfillmentLineId(index),
        quantity: 1,
      })),
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      items: [
        { purchase_order_item_id: purchaseOrderItemId, quantity: 1 },
        { purchase_order_item_id: purchaseOrderItemId, quantity: 1 },
      ],
    }).success).toBe(false);
    for (const quantity of [0, -1, 1.00001]) {
      expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
        ...shipmentInput(),
        items: [{ purchase_order_item_id: purchaseOrderItemId, quantity }],
      }).success).toBe(false);
    }
  });

  test("treats UUID casing as identical for shipment and receipt lines", () => {
    expect(SupplierPurchaseOrderShipmentCreateSchema.safeParse({
      ...shipmentInput(),
      items: [
        { purchase_order_item_id: caseVariantItemId, quantity: 1 },
        {
          purchase_order_item_id: caseVariantItemId.toUpperCase(),
          quantity: 1,
        },
      ],
    }).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      items: [
        {
          purchase_order_item_id: caseVariantItemId,
          accepted_quantity: 1,
          rejected_quantity: 0,
          variance_reason: null,
        },
        {
          purchase_order_item_id: caseVariantItemId.toUpperCase(),
          accepted_quantity: 1,
          rejected_quantity: 0,
          variance_reason: null,
        },
      ],
    })).success).toBe(false);
  });

  test("accepts receipt quantities and enforces variance reasons", () => {
    expect(SupplierPurchaseOrderReceiptCreateSchema.parse(receiptInput({
      items: [{
        purchase_order_item_id: purchaseOrderItemId,
        accepted_quantity: 1.25,
        rejected_quantity: 0.75,
        variance_reason: " 外包装破损 ",
      }],
    }))).toMatchObject({
      items: [{
        accepted_quantity: 1.25,
        rejected_quantity: 0.75,
        variance_reason: "外包装破损",
      }],
    });
    expect(SupplierPurchaseOrderReceiptCreateSchema.parse(receiptInput({
      items: [{
        purchase_order_item_id: purchaseOrderItemId,
        accepted_quantity: 2,
        rejected_quantity: 0,
        variance_reason: null,
      }],
    }))).toMatchObject({
      items: [{ variance_reason: null }],
    });
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      items: [{
        purchase_order_item_id: purchaseOrderItemId,
        accepted_quantity: 1,
        rejected_quantity: 1,
        variance_reason: null,
      }],
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      items: [{
        purchase_order_item_id: purchaseOrderItemId,
        accepted_quantity: 1,
        rejected_quantity: 1,
        variance_reason: " ",
      }],
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      items: [{
        purchase_order_item_id: purchaseOrderItemId,
        accepted_quantity: 1,
        rejected_quantity: 0,
        variance_reason: "不应填写",
      }],
    })).success).toBe(false);
  });

  test("requires one to one hundred unique nonzero receipt lines", () => {
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      items: [],
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      items: Array.from({ length: 101 }, (_, index) => ({
        purchase_order_item_id: fulfillmentLineId(index),
        accepted_quantity: 1,
        rejected_quantity: 0,
        variance_reason: null,
      })),
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      items: [
        {
          purchase_order_item_id: secondPurchaseOrderItemId,
          accepted_quantity: 1,
          rejected_quantity: 0,
          variance_reason: null,
        },
        {
          purchase_order_item_id: secondPurchaseOrderItemId,
          accepted_quantity: 1,
          rejected_quantity: 0,
          variance_reason: null,
        },
      ],
    })).success).toBe(false);
    for (const [accepted, rejected] of [
      [-1, 1],
      [1, -1],
      [0, 0],
      [1.00001, 0],
      [0, 1.00001],
    ] as const) {
      expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
        items: [{
          purchase_order_item_id: purchaseOrderItemId,
          accepted_quantity: accepted,
          rejected_quantity: rejected,
          variance_reason: rejected > 0 ? "数量差异" : null,
        }],
      })).success).toBe(false);
    }
  });

  test("bounds strict receipt fields and event pagination", () => {
    expect(SupplierPurchaseOrderFulfillmentEventListQuerySchema.parse({}))
      .toEqual({ page: 1, pageSize: 20 });
    expect(SupplierPurchaseOrderFulfillmentEventListQuerySchema.parse({
      page: "2",
      pageSize: "100",
    })).toEqual({ page: 2, pageSize: 100 });
    expect(SupplierPurchaseOrderFulfillmentEventListQuerySchema.safeParse({
      pageSize: "101",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderFulfillmentEventListQuerySchema.safeParse({
      status: "received",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      receipt_no: " ",
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.parse(receiptInput({
      receipt_no: " RCV-001 ",
    })).receipt_no).toBe("RCV-001");
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      id: "invalid",
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      expected_fulfillment_version: 0,
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      expected_fulfillment_version: 1.5,
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      receipt_no: "a".repeat(81),
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      received_at: "2026-07-30T04:00:00",
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      remark: "a".repeat(501),
    })).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptCreateSchema.safeParse(receiptInput({
      unknown: true,
    })).success).toBe(false);
  });
});

function shipmentInput() {
  return {
    id: shipmentId,
    expected_fulfillment_version: 1,
    shipment_no: "SHIP-001",
    carrier_name: null,
    tracking_no: null,
    shipped_at: "2026-07-30T03:00:00.000Z",
    remark: null,
    items: [{ purchase_order_item_id: purchaseOrderItemId, quantity: 2.5 }],
  };
}

function receiptInput(overrides: Record<string, unknown> = {}) {
  return {
    id: receiptId,
    expected_fulfillment_version: 2,
    receipt_no: "RCV-001",
    received_at: "2026-07-30T04:00:00.000Z",
    remark: null,
    items: [{
      purchase_order_item_id: purchaseOrderItemId,
      accepted_quantity: 2.5,
      rejected_quantity: 0,
      variance_reason: null,
    }],
    ...overrides,
  };
}

function fulfillmentLineId(index: number) {
  return `30000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`;
}
