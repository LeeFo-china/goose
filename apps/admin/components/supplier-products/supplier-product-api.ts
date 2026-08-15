import { requestBackendJson } from "@/lib/backend-client";

import type {
  CatalogOption,
  PageData,
  SupplierCommandResult,
  SupplierPriceItemPage,
  SupplierPriceListPage,
  SupplierProductPage,
  SupplierSkuPage,
  TenantSupplierRelationship,
} from "./supplier-product-types";
import type { SupplierSkuSpecDefinition } from "./supplier-sku-spec-rules";

export function loadSupplierRelationships(keyword = "") {
  const query = new URLSearchParams({ page: "1", pageSize: "20" });
  if (keyword) query.set("keyword", keyword);
  return requestBackendJson<PageData<TenantSupplierRelationship>>(
    `/suppliers?${query}`,
    { fallbackMessage: "合作供应商加载失败" },
  );
}

export function loadSupplierProducts(
  tenantSupplierId: string,
  page: number,
  keyword = "",
) {
  const query = scopeQuery(tenantSupplierId, page);
  if (keyword) query.set("keyword", keyword);
  return requestBackendJson<SupplierProductPage>(
    `/supplier-products?${query}`,
    { fallbackMessage: "供应商商品加载失败" },
  );
}

export function loadSupplierSkus(
  tenantSupplierId: string,
  productId: string,
) {
  return requestBackendJson<SupplierSkuPage>(
    `/supplier-products/${productId}/skus?${scopeQuery(tenantSupplierId, 1)}`,
    { fallbackMessage: "供应商 SKU 加载失败" },
  );
}

export function loadSupplierPriceLists(
  tenantSupplierId: string,
  page: number,
) {
  return requestBackendJson<SupplierPriceListPage>(
    `/supplier-price-lists?${scopeQuery(tenantSupplierId, page)}`,
    { fallbackMessage: "基础供货价加载失败" },
  );
}

export function loadSupplierPriceItems(
  tenantSupplierId: string,
  priceListId: string,
) {
  return requestBackendJson<SupplierPriceItemPage>(
    `/supplier-price-lists/${priceListId}/items?${scopeQuery(tenantSupplierId, 1)}`,
    { fallbackMessage: "价格条目加载失败" },
  );
}

export function createSupplierResource(
  path: string,
  tenantSupplierId: string,
  payload: unknown,
  idempotencyKey: string,
) {
  return requestBackendJson<SupplierCommandResult>(
    `${path}?${scopeOnly(tenantSupplierId)}`,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    },
  );
}

export function mutateSupplierResource(
  path: string,
  tenantSupplierId: string,
  payload: unknown,
  idempotencyKey: string,
  method: "POST" | "PUT" | "DELETE" = "POST",
) {
  return requestBackendJson<SupplierCommandResult>(
    `${path}?${scopeOnly(tenantSupplierId)}`,
    {
      method,
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    },
  );
}

export function loadCatalogOptions(
  kind: "categories" | "brands" | "units",
) {
  const query = new URLSearchParams({
    page: "1",
    pageSize: "100",
    status: "active",
  });
  return requestBackendJson<PageData<CatalogOption>>(
    `/catalog/${kind}?${query}`,
    { fallbackMessage: "供应标准目录加载失败" },
  );
}

export function loadCategorySpecDefinitions(categoryId: string) {
  return requestBackendJson<PageData<SupplierSkuSpecDefinition>>(
    `/catalog/categories/${categoryId}/spec-definitions`,
    { fallbackMessage: "加载规格模板失败" },
  );
}

function scopeQuery(tenantSupplierId: string, page: number) {
  return new URLSearchParams({
    tenantSupplierId,
    page: String(page),
    pageSize: "20",
  });
}

function scopeOnly(tenantSupplierId: string) {
  return new URLSearchParams({ tenantSupplierId }).toString();
}
