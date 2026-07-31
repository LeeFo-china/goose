import type { PageData } from "@/components/suppliers/supplier-types";
import { requestBackendJson } from "@/lib/backend-client";

import type {
  ProjectOption,
  PurchaseOrderCatalogPage,
  PurchaseOrderCommandResult,
  PurchaseOrderItemPage,
  PurchaseOrderPage,
  PurchaseOrderSupplierOption,
  PurchaseOrderWithReferences,
  SupplierPurchaseOrderFinancialSummary,
} from "./purchase-order-types";

export type PurchaseOrderFilters = {
  keyword?: string;
  status?: string;
  projectId?: string;
  tenantSupplierId?: string;
};

export function loadPurchaseOrders(
  page: number,
  filters: PurchaseOrderFilters = {},
) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "20",
  });
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  return requestBackendJson<PurchaseOrderPage>(
    `/supplier-purchase-orders?${query}`,
    { fallbackMessage: "采购单加载失败" },
  );
}

export function loadPurchaseOrder(orderId: string) {
  return requestBackendJson<PurchaseOrderWithReferences>(
    `/supplier-purchase-orders/${orderId}`,
    { fallbackMessage: "采购单详情加载失败" },
  );
}

export function loadPurchaseOrderFinancialSummary(orderId: string) {
  return requestBackendJson<SupplierPurchaseOrderFinancialSummary>(
    `/supplier-purchase-orders/${encodeURIComponent(orderId)}/financial-summary`,
    { fallbackMessage: "采购单财务摘要加载失败" },
  );
}

export function loadPurchaseOrderItems(orderId: string, page = 1) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "100",
  });
  return requestBackendJson<PurchaseOrderItemPage>(
    `/supplier-purchase-orders/${orderId}/items?${query}`,
    { fallbackMessage: "采购单明细加载失败" },
  );
}

export function loadPurchaseOrderCatalog(
  tenantSupplierId: string,
  page: number,
  keyword = "",
) {
  const query = new URLSearchParams({
    tenantSupplierId,
    page: String(page),
    pageSize: "20",
  });
  if (keyword) query.set("keyword", keyword);
  return requestBackendJson<PurchaseOrderCatalogPage>(
    `/supplier-purchase-order-catalog?${query}`,
    { fallbackMessage: "可采购目录加载失败" },
  );
}

export function loadPurchaseOrderRelationships(page: number, keyword = "") {
  const query = optionQuery(page, keyword);
  return requestBackendJson<PageData<PurchaseOrderSupplierOption>>(
    `/supplier-purchase-order-supplier-options?${query}`,
    { fallbackMessage: "合作供应商加载失败" },
  );
}

export async function loadPurchaseOrderProjects(page: number, keyword = "") {
  const query = optionQuery(page, keyword);
  return requestBackendJson<PageData<ProjectOption>>(
    `/supplier-purchase-order-project-options?${query}`,
    { fallbackMessage: "项目选项加载失败" },
  );
}

export function savePurchaseOrderDraft(
  orderId: string,
  payload: unknown,
  idempotencyKey: string,
) {
  return purchaseOrderCommand(
    `/supplier-purchase-orders/${orderId}/save-draft`,
    payload,
    idempotencyKey,
    "采购单草稿保存失败",
  );
}

export function submitPurchaseOrder(
  orderId: string,
  expectedVersion: number,
  idempotencyKey: string,
) {
  return purchaseOrderCommand(
    `/supplier-purchase-orders/${orderId}/submit`,
    { expected_version: expectedVersion },
    idempotencyKey,
    "采购单提交失败",
  );
}

export function cancelPurchaseOrder(
  orderId: string,
  expectedVersion: number,
  reason: string,
  idempotencyKey: string,
) {
  return purchaseOrderCommand(
    `/supplier-purchase-orders/${orderId}/cancel`,
    { expected_version: expectedVersion, reason },
    idempotencyKey,
    "采购单取消失败",
  );
}

function purchaseOrderCommand(
  path: string,
  payload: unknown,
  idempotencyKey: string,
  fallbackMessage: string,
) {
  return requestBackendJson<PurchaseOrderCommandResult>(path, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload),
    fallbackMessage,
  });
}

function optionQuery(page: number, keyword: string) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: "100",
  });
  if (keyword.trim()) query.set("keyword", keyword.trim());
  return query;
}
