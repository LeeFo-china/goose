import { requestBackendJson } from "@/lib/backend-client";

import type {
  PurchaseOrderFulfillmentCommandResult,
  PurchaseOrderFulfillmentConfirmPayload,
  PurchaseOrderFulfillmentDetail,
  PurchaseOrderReceiptPage,
  PurchaseOrderReceiptPayload,
  PurchaseOrderShipmentPage,
  PurchaseOrderShipmentPayload,
} from "./purchase-order-fulfillment-types";

export function loadPurchaseOrderFulfillment(orderId: string) {
  const encodedOrderId = encodeURIComponent(orderId);
  return requestBackendJson<PurchaseOrderFulfillmentDetail>(
    `/supplier-purchase-orders/${encodedOrderId}/fulfillment`,
    { fallbackMessage: "采购履约详情加载失败" },
  );
}

export function loadPurchaseOrderShipments(
  orderId: string,
  page = 1,
  pageSize = 20,
) {
  const encodedOrderId = encodeURIComponent(orderId);
  const query = eventPageQuery(page, pageSize);
  return requestBackendJson<PurchaseOrderShipmentPage>(
    `/supplier-purchase-orders/${encodedOrderId}/shipments?${query}`,
    { fallbackMessage: "采购发货记录加载失败" },
  );
}

export function loadPurchaseOrderReceipts(
  orderId: string,
  page = 1,
  pageSize = 20,
) {
  const encodedOrderId = encodeURIComponent(orderId);
  const query = eventPageQuery(page, pageSize);
  return requestBackendJson<PurchaseOrderReceiptPage>(
    `/supplier-purchase-orders/${encodedOrderId}/receipts?${query}`,
    { fallbackMessage: "采购收货记录加载失败" },
  );
}

export function confirmPurchaseOrderFulfillment(
  orderId: string,
  payload: PurchaseOrderFulfillmentConfirmPayload,
  idempotencyKey: string,
) {
  const encodedOrderId = encodeURIComponent(orderId);
  return fulfillmentCommand(
    `/supplier-purchase-orders/${encodedOrderId}/confirm-fulfillment`,
    payload,
    idempotencyKey,
    "确认采购履约失败",
  );
}

export function createPurchaseOrderShipment(
  orderId: string,
  payload: PurchaseOrderShipmentPayload,
  idempotencyKey: string,
) {
  const encodedOrderId = encodeURIComponent(orderId);
  return fulfillmentCommand(
    `/supplier-purchase-orders/${encodedOrderId}/shipments`,
    payload,
    idempotencyKey,
    "创建采购发货记录失败",
  );
}

export function createPurchaseOrderReceipt(
  orderId: string,
  payload: PurchaseOrderReceiptPayload,
  idempotencyKey: string,
) {
  const encodedOrderId = encodeURIComponent(orderId);
  return fulfillmentCommand(
    `/supplier-purchase-orders/${encodedOrderId}/receipts`,
    payload,
    idempotencyKey,
    "创建采购收货记录失败",
  );
}

function fulfillmentCommand(
  path: string,
  payload:
    | PurchaseOrderFulfillmentConfirmPayload
    | PurchaseOrderShipmentPayload
    | PurchaseOrderReceiptPayload,
  idempotencyKey: string,
  fallbackMessage: string,
) {
  return requestBackendJson<PurchaseOrderFulfillmentCommandResult>(path, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
    fallbackMessage,
  });
}

function eventPageQuery(page: number, pageSize: number) {
  const normalizedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const normalizedPageSize = Number.isInteger(pageSize) && pageSize > 0
    ? Math.min(pageSize, 100)
    : 20;
  return new URLSearchParams({
    page: String(normalizedPage),
    pageSize: String(normalizedPageSize),
  });
}
