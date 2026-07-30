import type { PageData, PurchaseOrder } from "./purchase-order-types";

export type PurchaseOrderFulfillmentStatus =
  | "confirmed"
  | "partially_shipped"
  | "shipped"
  | "partially_received"
  | "received"
  | "received_with_variance"
  | "cancelled";

export type PurchaseOrderFulfillment = {
  id: string;
  tenant_id: string;
  supplier_purchase_order_id: string;
  status: PurchaseOrderFulfillmentStatus;
  confirmed_at: string;
  confirmed_by_employee_id: string;
  confirmation_remark: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderItemFulfillment = {
  tenant_id: string;
  supplier_purchase_order_fulfillment_id: string;
  supplier_purchase_order_item_id: string;
  ordered_quantity: string;
  shipped_quantity: string;
  received_quantity: string;
  accepted_quantity: string;
  rejected_quantity: string;
  accepted_subtotal_amount: string;
  accepted_tax_amount: string;
  accepted_total_amount: string;
  updated_at: string;
};

export type PurchaseOrderFulfillmentDetail = {
  fulfillment: PurchaseOrderFulfillment | null;
  item_fulfillments: PurchaseOrderItemFulfillment[];
};

export type PurchaseOrderShipmentItem = {
  tenant_id: string;
  shipment_id: string;
  supplier_purchase_order_item_id: string;
  quantity: string;
};

export type PurchaseOrderShipment = {
  id: string;
  tenant_id: string;
  supplier_purchase_order_id: string;
  shipment_no: string;
  carrier_name: string | null;
  tracking_no: string | null;
  shipped_at: string;
  remark: string | null;
  created_by_employee_id: string;
  created_at: string;
  items: PurchaseOrderShipmentItem[];
};

export type PurchaseOrderReceiptItem = {
  tenant_id: string;
  receipt_id: string;
  supplier_purchase_order_item_id: string;
  accepted_quantity: string;
  rejected_quantity: string;
  variance_reason: string | null;
};

export type PurchaseOrderReceipt = {
  id: string;
  tenant_id: string;
  supplier_purchase_order_id: string;
  receipt_no: string;
  received_at: string;
  remark: string | null;
  received_by_employee_id: string;
  created_at: string;
  items: PurchaseOrderReceiptItem[];
};

export type PurchaseOrderShipmentPage = PageData<PurchaseOrderShipment>;
export type PurchaseOrderReceiptPage = PageData<PurchaseOrderReceipt>;

export type PurchaseOrderFulfillmentCommandResult = {
  status: "confirmed" | "shipment_created" | "receipt_created";
  idempotent: boolean;
  purchase_order: PurchaseOrder;
  fulfillment: PurchaseOrderFulfillment;
  version: number;
};

export type PurchaseOrderFulfillmentConfirmPayload = {
  expected_version: number;
  confirmed_at: string;
  remark?: string | null;
};

export type PurchaseOrderShipmentLinePayload = {
  purchase_order_item_id: string;
  quantity: number;
};

export type PurchaseOrderShipmentPayload = {
  id: string;
  expected_fulfillment_version: number;
  shipment_no: string;
  carrier_name?: string | null;
  tracking_no?: string | null;
  shipped_at: string;
  remark?: string | null;
  items: PurchaseOrderShipmentLinePayload[];
};

export type PurchaseOrderReceiptLinePayload = {
  purchase_order_item_id: string;
  accepted_quantity: number;
  rejected_quantity: number;
  variance_reason?: string | null;
};

export type PurchaseOrderReceiptPayload = {
  id: string;
  expected_fulfillment_version: number;
  receipt_no: string;
  received_at: string;
  remark?: string | null;
  items: PurchaseOrderReceiptLinePayload[];
};

export type ShipmentLineDraft = {
  purchaseOrderItemId: string;
  quantity: string;
};

export type ReceiptLineDraft = {
  purchaseOrderItemId: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  varianceReason?: string | null;
};

export type ShipmentDraft = {
  id: string;
  expectedFulfillmentVersion: number;
  shipmentNo: string;
  carrierName?: string | null;
  trackingNo?: string | null;
  shippedAt: string;
  remark?: string | null;
  lines: ShipmentLineDraft[];
};

export type ReceiptDraft = {
  id: string;
  expectedFulfillmentVersion: number;
  receiptNo: string;
  receivedAt: string;
  remark?: string | null;
  lines: ReceiptLineDraft[];
};

export type FulfillmentValidationError = {
  path: string;
  message: string;
};
