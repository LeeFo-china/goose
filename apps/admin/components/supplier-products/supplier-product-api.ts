import { requestBackendJson } from "@/lib/backend-client";

import type {
  CatalogOption,
  CatalogSpecDefinition,
  PageData,
  PlatformSupplierOption,
  ProductApiScope,
  SupplierCommandResult,
  SupplierPriceItemPage,
  SupplierPriceListPage,
  SupplierProductPage,
  SupplierSkuPage,
  SupplierSkuUnitConversion,
  TenantSupplierRelationship,
} from "./supplier-product-types";

const PAGE_SIZE = 20;
const BULK_PAGE_SIZE = 100;
const MAX_CATALOG_PAGES = 5;

export function buildRelationshipListPath(keyword = "", page = 1) {
  const query = pagedQuery(page, PAGE_SIZE);
  if (keyword.trim()) query.set("keyword", keyword.trim());
  return `/suppliers?${query}`;
}

export function loadSupplierRelationships(keyword = "", page = 1) {
  return requestBackendJson<PageData<TenantSupplierRelationship>>(
    buildRelationshipListPath(keyword, page),
    { fallbackMessage: "合作供应商加载失败" },
  );
}

export function loadPlatformSuppliers(keyword = "", page = 1) {
  const query = pagedQuery(page, PAGE_SIZE);
  if (keyword.trim()) query.set("keyword", keyword.trim());
  return requestBackendJson<PageData<PlatformSupplierOption>>(
    `/platform/suppliers?${query}`,
    { fallbackMessage: "平台供应商加载失败" },
  );
}

export function buildProductListPath(
  scope: ProductApiScope,
  page: number,
  keyword = "",
) {
  const query = scopeQuery(scope, page);
  if (keyword.trim()) query.set("keyword", keyword.trim());
  return `${productBase(scope)}?${query}`;
}

export function loadSupplierProducts(
  scope: ProductApiScope,
  page: number,
  keyword = "",
) {
  return requestBackendJson<SupplierProductPage>(
    buildProductListPath(scope, page, keyword),
    { fallbackMessage: "供应商商品加载失败" },
  );
}

export function buildProductResourcePath(
  scope: ProductApiScope,
  productId: string,
) {
  return `${productBase(scope)}/${productId}`;
}

export function buildSkuResourcePath(
  scope: ProductApiScope,
  productId: string,
  skuId: string,
) {
  return `${buildProductResourcePath(scope, productId)}/skus/${skuId}`;
}

export function loadSupplierSkus(
  scope: ProductApiScope,
  productId: string,
  page = 1,
) {
  return requestBackendJson<SupplierSkuPage>(
    `${productBase(scope)}/${productId}/skus?${scopeQuery(scope, page)}`,
    { fallbackMessage: "供应商 SKU 加载失败" },
  );
}

export function loadSkuUnitConversions(
  scope: ProductApiScope,
  productId: string,
  skuId: string,
) {
  return requestBackendJson<SupplierSkuUnitConversion[]>(
    `${productBase(scope)}/${productId}/skus/${skuId}/unit-conversions?${scopeOnly(scope)}`,
    { fallbackMessage: "单位换算加载失败" },
  );
}

export function buildPriceListPath(scope: ProductApiScope, page: number) {
  if (scope.kind === "platform") {
    throw new Error("平台商品页不能访问租户采购价");
  }
  return `/supplier-price-lists?${scopeQuery(scope, page)}`;
}

export function loadSupplierPriceLists(scope: ProductApiScope, page: number) {
  return requestBackendJson<SupplierPriceListPage>(
    buildPriceListPath(scope, page),
    { fallbackMessage: "基础供货价加载失败" },
  );
}

export function loadSupplierPriceItems(
  scope: ProductApiScope,
  priceListId: string,
  page = 1,
) {
  if (scope.kind === "platform") throw new Error("平台商品页不能访问租户采购价");
  return requestBackendJson<SupplierPriceItemPage>(
    `/supplier-price-lists/${priceListId}/items?${scopeQuery(scope, page)}`,
    { fallbackMessage: "价格条目加载失败" },
  );
}

export function createSupplierResource(
  path: string,
  scope: ProductApiScope,
  payload: unknown,
  idempotencyKey: string,
) {
  return command(path, scope, payload, idempotencyKey, "POST");
}

export function mutateSupplierResource(
  path: string,
  scope: ProductApiScope,
  payload: unknown,
  idempotencyKey: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
) {
  return command(path, scope, payload, idempotencyKey, method);
}

export function loadCatalogOptions(
  kind: "categories" | "brands" | "units",
  scope: ProductApiScope,
  page = 1,
  keyword = "",
  pageSize = PAGE_SIZE,
) {
  return requestBackendJson<PageData<CatalogOption>>(
    buildCatalogOptionListPath(kind, scope, page, keyword, pageSize),
    { fallbackMessage: "供应标准目录加载失败" },
  );
}

export function buildCatalogOptionListPath(
  kind: "categories" | "brands" | "units",
  scope: ProductApiScope,
  page = 1,
  keyword = "",
  pageSize = PAGE_SIZE,
) {
  const query = pagedQuery(page, pageSize);
  query.set("status", "active");
  if (keyword.trim()) query.set("keyword", keyword.trim());
  if (kind === "categories") query.set("is_leaf", "true");
  const prefix = scope.kind === "platform" ? "/platform" : "";
  return `${prefix}/catalog/${kind}?${query}`;
}

export function loadAllCatalogOptions(
  kind: "categories" | "brands" | "units",
  scope: ProductApiScope,
) {
  return loadAllPages(
    (page) => loadCatalogOptions(kind, scope, page, "", BULK_PAGE_SIZE),
    "供应标准目录",
  );
}

export function loadSpecDefinitions(
  categoryId: string,
  scope: ProductApiScope,
  page = 1,
) {
  return requestBackendJson<PageData<CatalogSpecDefinition>>(
    buildSpecDefinitionListPath(categoryId, scope, page),
    { fallbackMessage: "分类规格模板加载失败" },
  );
}

export function buildSpecDefinitionListPath(
  categoryId: string,
  scope: ProductApiScope,
  page = 1,
) {
  const query = pagedQuery(page, BULK_PAGE_SIZE);
  query.set("status", "active");
  const prefix = scope.kind === "platform" ? "/platform" : "";
  return `${prefix}/catalog/categories/${categoryId}/spec-definitions?${query}`;
}

export function loadAllSpecDefinitions(
  categoryId: string,
  scope: ProductApiScope,
) {
  return loadAllPages(
    (page) => loadSpecDefinitions(categoryId, scope, page),
    "分类规格模板",
  );
}

async function loadAllPages<T>(
  loader: (page: number) => Promise<PageData<T>>,
  label: string,
) {
  const first = await loader(1);
  const totalPages = Math.max(1, first.pagination.totalPages || 1);
  if (totalPages > MAX_CATALOG_PAGES) {
    throw new Error(`${label}超过 ${MAX_CATALOG_PAGES * BULK_PAGE_SIZE} 条，请收窄目录范围`);
  }
  const remainingPages = await Promise.all(
    Array.from(
      { length: Math.max(0, totalPages - 1) },
      (_, index) => loader(index + 2),
    ),
  );
  return [first, ...remainingPages].flatMap(({ list }) => list);
}

function command(
  path: string,
  scope: ProductApiScope,
  payload: unknown,
  idempotencyKey: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
) {
  return requestBackendJson<SupplierCommandResult>(
    `${path}?${scopeOnly(scope)}`,
    {
      method,
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    },
  );
}

function productBase(scope: ProductApiScope) {
  return scope.kind === "platform"
    ? "/platform/supplier-products"
    : "/supplier-products";
}

function scopeQuery(scope: ProductApiScope, page: number) {
  return new URLSearchParams({
    [scope.kind === "platform" ? "supplierId" : "tenantSupplierId"]:
      scope.kind === "platform" ? scope.supplierId : scope.tenantSupplierId,
    page: String(Math.max(1, page)),
    pageSize: String(PAGE_SIZE),
  });
}

function scopeOnly(scope: ProductApiScope) {
  return new URLSearchParams({
    [scope.kind === "platform" ? "supplierId" : "tenantSupplierId"]:
      scope.kind === "platform" ? scope.supplierId : scope.tenantSupplierId,
  }).toString();
}

function pagedQuery(page: number, pageSize: number) {
  return new URLSearchParams({
    page: String(Math.max(1, page)),
    pageSize: String(Math.min(100, Math.max(1, pageSize))),
  });
}
