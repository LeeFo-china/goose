import { z } from "zod";

import { SupplierPurchaseOrderRecordSchema } from "./supplier-purchase-order-records";

export const SUPPLIER_PURCHASE_ORDER_FULFILLMENT_SELECT = [
  "id",
  "tenant_id",
  "supplier_purchase_order_id",
  "status",
  "confirmed_at",
  "confirmed_by_employee_id",
  "confirmation_remark",
  "version",
  "created_at",
  "updated_at",
].join(",");

export const SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ITEM_SELECT = [
  "tenant_id",
  "supplier_purchase_order_fulfillment_id",
  "supplier_purchase_order_item_id",
  "ordered_quantity::text",
  "shipped_quantity::text",
  "received_quantity::text",
  "accepted_quantity::text",
  "rejected_quantity::text",
  "accepted_subtotal_amount::text",
  "accepted_tax_amount::text",
  "accepted_total_amount::text",
  "updated_at",
].join(",");

export const SUPPLIER_PURCHASE_ORDER_SHIPMENT_ITEM_SELECT = [
  "tenant_id",
  "shipment_id",
  "supplier_purchase_order_item_id",
  "quantity::text",
].join(",");

export const SUPPLIER_PURCHASE_ORDER_SHIPMENT_SELECT = [
  "id",
  "tenant_id",
  "supplier_purchase_order_id",
  "shipment_no",
  "carrier_name",
  "tracking_no",
  "shipped_at",
  "remark",
  "created_by_employee_id",
  "created_at",
  `items:supplier_purchase_order_shipment_items(${
    SUPPLIER_PURCHASE_ORDER_SHIPMENT_ITEM_SELECT
  })`,
].join(",");

export const SUPPLIER_PURCHASE_ORDER_RECEIPT_ITEM_SELECT = [
  "tenant_id",
  "receipt_id",
  "supplier_purchase_order_item_id",
  "accepted_quantity::text",
  "rejected_quantity::text",
  "variance_reason",
].join(",");

export const SUPPLIER_PURCHASE_ORDER_RECEIPT_SELECT = [
  "id",
  "tenant_id",
  "supplier_purchase_order_id",
  "receipt_no",
  "received_at",
  "remark",
  "received_by_employee_id",
  "created_at",
  `items:supplier_purchase_order_receipt_items(${
    SUPPLIER_PURCHASE_ORDER_RECEIPT_ITEM_SELECT
  })`,
].join(",");

const uuid = z.uuid();
const dateTime = z.string().min(1);
const decimal = z.string().regex(/^\d+(?:\.\d+)?$/);

export const SupplierPurchaseOrderFulfillmentStatusSchema = z.enum([
  "confirmed",
  "partially_shipped",
  "shipped",
  "partially_received",
  "received",
  "received_with_variance",
  "cancelled",
]);

export const SupplierPurchaseOrderFulfillmentSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  supplier_purchase_order_id: uuid,
  status: SupplierPurchaseOrderFulfillmentStatusSchema,
  confirmed_at: dateTime,
  confirmed_by_employee_id: uuid,
  confirmation_remark: z.string().nullable(),
  version: z.number().int().positive(),
  created_at: dateTime,
  updated_at: dateTime,
}).strict();

export const SupplierPurchaseOrderItemFulfillmentSchema = z.object({
  tenant_id: uuid,
  supplier_purchase_order_fulfillment_id: uuid,
  supplier_purchase_order_item_id: uuid,
  ordered_quantity: decimal,
  shipped_quantity: decimal,
  received_quantity: decimal,
  accepted_quantity: decimal,
  rejected_quantity: decimal,
  accepted_subtotal_amount: decimal,
  accepted_tax_amount: decimal,
  accepted_total_amount: decimal,
  updated_at: dateTime,
}).strict();

export const SupplierPurchaseOrderShipmentItemSchema = z.object({
  tenant_id: uuid,
  shipment_id: uuid,
  supplier_purchase_order_item_id: uuid,
  quantity: decimal,
}).strict();

export const SupplierPurchaseOrderShipmentHeaderSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  supplier_purchase_order_id: uuid,
  shipment_no: z.string().min(1),
  carrier_name: z.string().nullable(),
  tracking_no: z.string().nullable(),
  shipped_at: dateTime,
  remark: z.string().nullable(),
  created_by_employee_id: uuid,
  created_at: dateTime,
}).strict();

export const SupplierPurchaseOrderShipmentSchema =
  SupplierPurchaseOrderShipmentHeaderSchema.extend({
    items: z.array(SupplierPurchaseOrderShipmentItemSchema).min(1).max(100),
  }).strict();

export const SupplierPurchaseOrderReceiptItemSchema = z.object({
  tenant_id: uuid,
  receipt_id: uuid,
  supplier_purchase_order_item_id: uuid,
  accepted_quantity: decimal,
  rejected_quantity: decimal,
  variance_reason: z.string().nullable(),
}).strict();

export const SupplierPurchaseOrderReceiptHeaderSchema = z.object({
  id: uuid,
  tenant_id: uuid,
  supplier_purchase_order_id: uuid,
  receipt_no: z.string().min(1),
  received_at: dateTime,
  remark: z.string().nullable(),
  received_by_employee_id: uuid,
  created_at: dateTime,
}).strict();

export const SupplierPurchaseOrderReceiptSchema =
  SupplierPurchaseOrderReceiptHeaderSchema.extend({
    items: z.array(SupplierPurchaseOrderReceiptItemSchema).min(1).max(100),
  }).strict();

export const SupplierPurchaseOrderFulfillmentDetailSchema = z.object({
  fulfillment: SupplierPurchaseOrderFulfillmentSchema.nullable(),
  item_fulfillments: z.array(SupplierPurchaseOrderItemFulfillmentSchema)
    .max(100),
}).strict();

const SupplierPurchaseOrderFulfillmentCommandSuccessSchema = z.object({
  status: z.enum(["confirmed", "shipment_created", "receipt_created"]),
  idempotent: z.boolean(),
  purchase_order: SupplierPurchaseOrderRecordSchema,
  fulfillment: SupplierPurchaseOrderFulfillmentSchema,
  version: z.number().int().positive(),
}).strict();

const SupplierPurchaseOrderFulfillmentCommandErrorSchema = z.object({
  status: z.enum([
    "validation_error",
    "not_found",
    "version_conflict",
    "state_conflict",
    "idempotency_conflict",
    "over_shipped",
    "over_received",
    "variance_reason_required",
  ]),
  error_code: z.string().optional(),
  reason: z.string().optional(),
}).strict();

export const SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema = z.union([
  SupplierPurchaseOrderFulfillmentCommandSuccessSchema,
  SupplierPurchaseOrderFulfillmentCommandErrorSchema,
]);

export type SupplierPurchaseOrderFulfillmentStatus =
  z.infer<typeof SupplierPurchaseOrderFulfillmentStatusSchema>;
export type SupplierPurchaseOrderFulfillment =
  z.infer<typeof SupplierPurchaseOrderFulfillmentSchema>;
export type SupplierPurchaseOrderItemFulfillment =
  z.infer<typeof SupplierPurchaseOrderItemFulfillmentSchema>;
export type SupplierPurchaseOrderShipmentItem =
  z.infer<typeof SupplierPurchaseOrderShipmentItemSchema>;
export type SupplierPurchaseOrderShipmentHeader =
  z.infer<typeof SupplierPurchaseOrderShipmentHeaderSchema>;
export type SupplierPurchaseOrderShipment =
  z.infer<typeof SupplierPurchaseOrderShipmentSchema>;
export type SupplierPurchaseOrderReceiptItem =
  z.infer<typeof SupplierPurchaseOrderReceiptItemSchema>;
export type SupplierPurchaseOrderReceiptHeader =
  z.infer<typeof SupplierPurchaseOrderReceiptHeaderSchema>;
export type SupplierPurchaseOrderReceipt =
  z.infer<typeof SupplierPurchaseOrderReceiptSchema>;
export type SupplierPurchaseOrderFulfillmentDetail =
  z.infer<typeof SupplierPurchaseOrderFulfillmentDetailSchema>;
export type SupplierPurchaseOrderFulfillmentCommandEnvelope =
  z.infer<typeof SupplierPurchaseOrderFulfillmentCommandEnvelopeSchema>;
