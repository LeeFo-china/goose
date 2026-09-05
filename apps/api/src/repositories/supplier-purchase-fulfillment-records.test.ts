import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ITEM_SELECT,
  SUPPLIER_PURCHASE_ORDER_FULFILLMENT_SELECT,
  SUPPLIER_PURCHASE_ORDER_RECEIPT_SELECT,
  SUPPLIER_PURCHASE_ORDER_SHIPMENT_SELECT,
  SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema,
  SupplierPurchaseOrderFulfillmentDetailSchema,
  SupplierPurchaseOrderFulfillmentSchema,
  SupplierPurchaseOrderFulfillmentStatusSchema,
  SupplierPurchaseOrderItemFulfillmentSchema,
  SupplierPurchaseOrderReceiptItemSchema,
  SupplierPurchaseOrderReceiptSchema,
  SupplierPurchaseOrderShipmentItemSchema,
  SupplierPurchaseOrderShipmentSchema,
} from "./supplier-purchase-fulfillment-records";

const TENANT_ID = "60000000-0000-4000-8000-000000000001";
const ORDER_ID = "60000000-0000-4000-8000-000000000002";
const FULFILLMENT_ID = "60000000-0000-4000-8000-000000000003";
const ORDER_ITEM_ID = "60000000-0000-4000-8000-000000000004";
const SHIPMENT_ID = "60000000-0000-4000-8000-000000000005";
const RECEIPT_ID = "60000000-0000-4000-8000-000000000006";
const EMPLOYEE_ID = "60000000-0000-4000-8000-000000000007";
const PROJECT_ID = "60000000-0000-4000-8000-000000000008";
const RELATIONSHIP_ID = "60000000-0000-4000-8000-000000000009";
const SUPPLIER_ID = "60000000-0000-4000-8000-000000000010";

const fulfillment = {
  id: FULFILLMENT_ID,
  tenant_id: TENANT_ID,
  supplier_purchase_order_id: ORDER_ID,
  status: "partially_received",
  confirmed_at: "2026-07-30T02:00:00.000Z",
  confirmed_by_employee_id: EMPLOYEE_ID,
  confirmation_remark: "供应商电话确认",
  version: 3,
  created_at: "2026-07-30T02:00:00.000Z",
  updated_at: "2026-07-30T04:00:00.000Z",
} as const;

const itemFulfillment = {
  tenant_id: TENANT_ID,
  supplier_purchase_order_fulfillment_id: FULFILLMENT_ID,
  supplier_purchase_order_item_id: ORDER_ITEM_ID,
  ordered_quantity: "10.0000",
  shipped_quantity: "6.0000",
  received_quantity: "4.0000",
  accepted_quantity: "3.5000",
  rejected_quantity: "0.5000",
  accepted_subtotal_amount: "35.00",
  accepted_tax_amount: "4.55",
  accepted_total_amount: "39.55",
  updated_at: "2026-07-30T04:00:00.000Z",
} as const;

const shipmentItem = {
  tenant_id: TENANT_ID,
  shipment_id: SHIPMENT_ID,
  supplier_purchase_order_item_id: ORDER_ITEM_ID,
  quantity: "6.0000",
} as const;

const shipment = {
  id: SHIPMENT_ID,
  tenant_id: TENANT_ID,
  supplier_purchase_order_id: ORDER_ID,
  shipment_no: "SHIP-001",
  carrier_name: "顺丰",
  tracking_no: "SF001",
  shipped_at: "2026-07-30T03:00:00.000Z",
  remark: "首批",
  created_by_employee_id: EMPLOYEE_ID,
  created_at: "2026-07-30T03:00:00.000Z",
  items: [shipmentItem],
};

const receiptItem = {
  tenant_id: TENANT_ID,
  receipt_id: RECEIPT_ID,
  supplier_purchase_order_item_id: ORDER_ITEM_ID,
  accepted_quantity: "3.5000",
  rejected_quantity: "0.5000",
  variance_reason: "外包装破损",
} as const;

const receipt = {
  id: RECEIPT_ID,
  tenant_id: TENANT_ID,
  supplier_purchase_order_id: ORDER_ID,
  receipt_no: "RCV-001",
  received_at: "2026-07-30T04:00:00.000Z",
  remark: null,
  received_by_employee_id: EMPLOYEE_ID,
  created_at: "2026-07-30T04:00:00.000Z",
  items: [receiptItem],
};

const purchaseOrder = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  destination_type: "project",
  warehouse_id: null,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  order_no: "PO-20260730-00000001",
  status: "submitted",
  currency: "CNY",
  expected_delivery_date: null,
  remark: null,
  priced_at: "2026-07-30T01:00:00.000Z",
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
  purchase_requisition_id: null,
  purchase_batch_id: null,
  version: 2,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: EMPLOYEE_ID,
  submitted_at: "2026-07-30T01:30:00.000Z",
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: "2026-07-30T01:00:00.000Z",
  updated_at: "2026-07-30T01:30:00.000Z",
} as const;

describe("supplier purchase fulfillment records", () => {
  test("accepts only supported fulfillment statuses", () => {
    for (const status of [
      "confirmed",
      "partially_shipped",
      "shipped",
      "partially_received",
      "received",
      "received_with_variance",
      "cancelled",
    ] as const) {
      expect(SupplierPurchaseOrderFulfillmentStatusSchema.parse(status))
        .toBe(status);
    }
    expect(SupplierPurchaseOrderFulfillmentStatusSchema.safeParse("unknown")
      .success).toBe(false);
  });

  test("strictly parses a fulfillment header", () => {
    expect(SupplierPurchaseOrderFulfillmentSchema.parse(fulfillment))
      .toEqual(fulfillment);
    expect(SupplierPurchaseOrderFulfillmentSchema.safeParse({
      ...fulfillment,
      status: "unknown",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderFulfillmentSchema.safeParse({
      ...fulfillment,
      version: 0,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderFulfillmentSchema.safeParse({
      ...fulfillment,
      extra: true,
    }).success).toBe(false);
  });

  test("requires string quantities and amounts on cumulative lines", () => {
    expect(SupplierPurchaseOrderItemFulfillmentSchema.parse(itemFulfillment))
      .toEqual(itemFulfillment);
    for (const field of [
      "ordered_quantity",
      "shipped_quantity",
      "received_quantity",
      "accepted_quantity",
      "rejected_quantity",
      "accepted_subtotal_amount",
      "accepted_tax_amount",
      "accepted_total_amount",
    ] as const) {
      expect(SupplierPurchaseOrderItemFulfillmentSchema.safeParse({
        ...itemFulfillment,
        [field]: 1,
      }).success).toBe(false);
    }
    expect(SupplierPurchaseOrderItemFulfillmentSchema.safeParse({
      ...itemFulfillment,
      accepted_total_amount: "-1.00",
    }).success).toBe(false);
    expect(SupplierPurchaseOrderItemFulfillmentSchema.safeParse({
      ...itemFulfillment,
      extra: true,
    }).success).toBe(false);
  });

  test("strictly parses shipment headers and nested lines", () => {
    expect(SupplierPurchaseOrderShipmentItemSchema.parse(shipmentItem))
      .toEqual(shipmentItem);
    expect(SupplierPurchaseOrderShipmentSchema.parse(shipment))
      .toEqual(shipment);
    expect(SupplierPurchaseOrderShipmentItemSchema.safeParse({
      ...shipmentItem,
      quantity: 6,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentItemSchema.safeParse({
      ...shipmentItem,
      extra: true,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentSchema.safeParse({
      ...shipment,
      items: Array.from({ length: 101 }, () => shipmentItem),
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentSchema.safeParse({
      ...shipment,
      shipped_at: 1,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderShipmentSchema.safeParse({
      ...shipment,
      extra: true,
    }).success).toBe(false);
  });

  test("strictly parses receipt headers and nested lines", () => {
    expect(SupplierPurchaseOrderReceiptItemSchema.parse(receiptItem))
      .toEqual(receiptItem);
    expect(SupplierPurchaseOrderReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(SupplierPurchaseOrderReceiptItemSchema.safeParse({
      ...receiptItem,
      accepted_quantity: 3.5,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptItemSchema.safeParse({
      ...receiptItem,
      extra: true,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptSchema.safeParse({
      ...receipt,
      items: Array.from({ length: 101 }, () => receiptItem),
    }).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptSchema.safeParse({
      ...receipt,
      received_at: 1,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderReceiptSchema.safeParse({
      ...receipt,
      extra: true,
    }).success).toBe(false);
  });

  test("allows event records with no embedded lines", () => {
    expect(SupplierPurchaseOrderShipmentSchema.parse({
      ...shipment,
      items: [],
    })).toEqual({
      ...shipment,
      items: [],
    });
    expect(SupplierPurchaseOrderReceiptSchema.parse({
      ...receipt,
      items: [],
    })).toEqual({
      ...receipt,
      items: [],
    });
  });

  test("strictly parses fulfillment details including an unconfirmed order", () => {
    const detail = {
      fulfillment,
      item_fulfillments: [itemFulfillment],
    };
    expect(SupplierPurchaseOrderFulfillmentDetailSchema.parse(detail))
      .toEqual(detail);
    expect(SupplierPurchaseOrderFulfillmentDetailSchema.parse({
      fulfillment: null,
      item_fulfillments: [],
    })).toEqual({
      fulfillment: null,
      item_fulfillments: [],
    });
    expect(SupplierPurchaseOrderFulfillmentDetailSchema.safeParse({
      ...detail,
      item_fulfillments: Array.from(
        { length: 101 },
        () => itemFulfillment,
      ),
    }).success).toBe(false);
    expect(SupplierPurchaseOrderFulfillmentDetailSchema.safeParse({
      ...detail,
      extra: true,
    }).success).toBe(false);
  });

  test("parses strict success and error command envelopes", () => {
    for (const status of [
      "confirmed",
      "shipment_created",
      "receipt_created",
    ] as const) {
      const result = {
        status,
        idempotent: false,
        purchase_order: purchaseOrder,
        fulfillment,
        version: 3,
      };
      expect(SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema.parse(
        result,
      )).toEqual(result);
    }
    for (const status of [
      "validation_error",
      "not_found",
      "version_conflict",
      "state_conflict",
      "idempotency_conflict",
      "over_shipped",
      "over_received",
      "variance_reason_required",
    ] as const) {
      expect(SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema.parse({
        status,
        error_code: "SUPPLIER_PURCHASE_ORDER_COMMAND_FAILED",
        reason: "命令执行失败",
      })).toEqual({
        status,
        error_code: "SUPPLIER_PURCHASE_ORDER_COMMAND_FAILED",
        reason: "命令执行失败",
      });
    }
    expect(SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema.safeParse({
      status: "confirmed",
      idempotent: false,
      purchase_order: purchaseOrder,
      fulfillment,
      version: 3,
      extra: true,
    }).success).toBe(false);
    expect(SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema.safeParse({
      status: "not_found",
      error_code: "NOT_FOUND",
      extra: true,
    }).success).toBe(false);
  });

  test("select constants cast numeric facts and include bounded event lines", () => {
    expect(SUPPLIER_PURCHASE_ORDER_FULFILLMENT_SELECT).toContain(
      "confirmed_by_employee_id",
    );
    expect(SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ITEM_SELECT).toContain(
      "ordered_quantity::text",
    );
    expect(SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ITEM_SELECT).toContain(
      "accepted_total_amount::text",
    );
    expect(SUPPLIER_PURCHASE_ORDER_SHIPMENT_SELECT).toContain(
      "items:supplier_purchase_order_shipment_items",
    );
    expect(SUPPLIER_PURCHASE_ORDER_SHIPMENT_SELECT).toContain("quantity::text");
    expect(SUPPLIER_PURCHASE_ORDER_RECEIPT_SELECT).toContain(
      "items:supplier_purchase_order_receipt_items",
    );
    expect(SUPPLIER_PURCHASE_ORDER_RECEIPT_SELECT).toContain(
      "accepted_quantity::text",
    );
    for (const columns of [
      SUPPLIER_PURCHASE_ORDER_FULFILLMENT_SELECT,
      SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ITEM_SELECT,
      SUPPLIER_PURCHASE_ORDER_SHIPMENT_SELECT,
      SUPPLIER_PURCHASE_ORDER_RECEIPT_SELECT,
    ]) {
      expect(columns).not.toContain("*");
    }
  });
});
