import { requestBackendJson } from "@/lib/backend-client";
import type { DeepReadonly } from "@/components/supplier-purchase-orders/purchase-order-fulfillment-ui-state";
import type { PurchaseOrderSupplierOption } from
  "@/components/supplier-purchase-orders/purchase-order-types";
import type {
  BatchCatalogItem,
  BatchCommandKind,
  BatchCommandPayload,
  BatchDestination,
  BatchDetail,
  BatchItem,
  BatchOrder,
  BatchRequisition,
  BatchSettings,
  BatchStatus,
  NamedOption,
  PageData,
  WarehouseOption,
} from "./batch-types";

const ROOT = "/supplier-purchase-batches";
export type BatchFilters = {
  keyword?: string;
  status?: BatchStatus;
  destinationType?: "project" | "warehouse";
  projectId?: string;
  warehouseId?: string;
};
export type BatchCatalogFilters = {
  keyword: string;
  categoryId?: string;
  tenantSupplierId?: string;
};
export function pageQuery(page = 1, keyword = "", pageSize = 20) {
  const query = new URLSearchParams({
    page: String(Math.max(1, Math.floor(page) || 1)),
    pageSize: String(Math.min(100, Math.max(1, Math.floor(pageSize) || 20))),
  });
  if (keyword.trim()) query.set("keyword", keyword.trim());
  return query;
}
export function loadBatches(
  page: number,
  filters: BatchFilters,
  signal?: AbortSignal,
) {
  const query = pageQuery(page);
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  return requestBackendJson<PageData<BatchDetail>>(`${ROOT}?${query}`, {
    signal,
    fallbackMessage: "采购批次加载失败",
  });
}
export function loadBatch(id: string, signal?: AbortSignal) {
  return requestBackendJson<BatchDetail>(`${ROOT}/${encodeURIComponent(id)}`, {
    signal,
    fallbackMessage: "采购批次详情加载失败",
  });
}
export function loadBatchItems(
  id: string,
  page = 1,
  pageSize = 20,
  signal?: AbortSignal,
) {
  return requestBackendJson<PageData<BatchItem>>(
    `${ROOT}/${encodeURIComponent(id)}/items?${pageQuery(page, "", pageSize)}`,
    { signal, fallbackMessage: "批次明细加载失败" },
  );
}
export function loadBatchRequisitions(
  id: string,
  page: number,
  signal?: AbortSignal,
) {
  return requestBackendJson<PageData<BatchRequisition>>(
    `${ROOT}/${encodeURIComponent(id)}/requisitions?${pageQuery(page)}`,
    { signal, fallbackMessage: "子申请加载失败" },
  );
}
export function loadBatchOrders(
  id: string,
  page: number,
  signal?: AbortSignal,
) {
  return requestBackendJson<PageData<BatchOrder>>(
    `${ROOT}/${encodeURIComponent(id)}/orders?${pageQuery(page)}`,
    { signal, fallbackMessage: "子采购单加载失败" },
  );
}
export function loadBatchProjects(
  page: number,
  keyword: string,
  signal?: AbortSignal,
) {
  return requestBackendJson<PageData<NamedOption>>(
    `/supplier-purchase-batch-project-options?${pageQuery(page, keyword)}`,
    { signal, fallbackMessage: "项目选项加载失败" },
  );
}
export function loadBatchCategories(
  page: number,
  keyword: string,
  signal?: AbortSignal,
) {
  return requestBackendJson<PageData<NamedOption>>(
    `/supplier-purchase-batch-cost-categories?${pageQuery(page, keyword)}`,
    { signal, fallbackMessage: "成本类目加载失败" },
  );
}
export function loadBatchWarehouses(
  page: number,
  keyword = "",
  activeOnly = false,
  signal?: AbortSignal,
) {
  const query = pageQuery(page, keyword);
  if (activeOnly) query.set("status", "active");
  return requestBackendJson<PageData<WarehouseOption>>(`/warehouses?${query}`, {
    signal,
    fallbackMessage: "仓库选项加载失败",
  });
}
export function loadBatchSettings(signal?: AbortSignal) {
  return requestBackendJson<BatchSettings>("/supplier-settings", {
    signal,
    fallbackMessage: "仓库补货设置加载失败",
  });
}
export function loadBatchCatalog(
  destination: BatchDestination,
  page: number,
  filters: BatchCatalogFilters,
  signal?: AbortSignal,
) {
  const query = pageQuery(page, filters.keyword);
  query.set("destinationType", destination.destination_type);
  if (
    destination.destination_type === "warehouse" && destination.warehouse_id
  ) query.set("warehouseId", destination.warehouse_id);
  if (destination.destination_type === "project" && destination.project_id) {
    query.set("projectId", destination.project_id);
  }
  if (filters.categoryId) query.set("categoryId", filters.categoryId);
  if (filters.tenantSupplierId) {
    query.set("tenantSupplierId", filters.tenantSupplierId);
  }
  return requestBackendJson<PageData<BatchCatalogItem>>(
    `/supplier-purchase-batch-catalog?${query}`,
    { signal, fallbackMessage: "采购目录加载失败" },
  );
}

type BatchCatalogCategoryOption = NamedOption & {
  code: string;
  full_name: string;
};

export async function loadBatchCatalogCategories(
  page: number,
  keyword: string,
  signal?: AbortSignal,
): Promise<PageData<NamedOption>> {
  const result = await requestBackendJson<PageData<BatchCatalogCategoryOption>>(
    `/supplier-purchase-batch-category-options?${pageQuery(page, keyword)}`,
    { signal, fallbackMessage: "商品分类加载失败" },
  );
  return {
    ...result,
    list: result.list.map((category) => ({
      id: category.id,
      name: category.full_name || category.name,
      status: category.status,
    })),
  };
}

export async function loadBatchCatalogSuppliers(
  page: number,
  keyword: string,
  signal?: AbortSignal,
): Promise<PageData<NamedOption>> {
  const result = await requestBackendJson<PageData<PurchaseOrderSupplierOption>>(
    `/supplier-purchase-requisition-supplier-options?${
      pageQuery(page, keyword, 100)
    }`,
    { signal, fallbackMessage: "供应商选项加载失败" },
  );
  return {
    ...result,
    list: result.list.map((relationship) => ({
      id: relationship.tenant_supplier_id,
      name: relationship.supplier.name,
      status: relationship.relationship_status,
    })),
  };
}
export function sendBatchCommand(
  id: string,
  kind: BatchCommandKind,
  payload: DeepReadonly<BatchCommandPayload>,
  key: string,
) {
  return requestBackendJson<unknown>(
    `${ROOT}/${encodeURIComponent(id)}/${kind}`,
    {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(payload),
      fallbackMessage: "采购批次操作失败",
    },
  );
}
