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
  SupplierProduct,
  SupplierProductPage,
  SupplierSku,
  SupplierSkuPriceContext,
  SupplierSkuPage,
  SupplierSkuUnitConversion,
  TenantSupplierRelationship,
} from "./supplier-product-types";

const PAGE_SIZE = 20;
const BULK_PAGE_SIZE = 100;
const MAX_CATALOG_PAGES = 5;

type CatalogKind = "categories" | "brands" | "units";
type WritableCatalogKind = "categories" | "brands";

export function isSupplierResourceNotFound(error: unknown) {
  return error instanceof Error
    && (error as Error & { status?: number }).status === 404;
}

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

export function loadSupplierRelationship(tenantSupplierId: string) {
  return requestBackendJson<TenantSupplierRelationship>(
    `/suppliers/${tenantSupplierId}`,
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

export function loadPlatformSupplier(supplierId: string) {
  return requestBackendJson<PlatformSupplierOption>(
    `/platform/suppliers/${supplierId}`,
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

export function loadSupplierProduct(
  scope: ProductApiScope,
  productId: string,
) {
  return requestBackendJson<SupplierProduct>(
    `${buildProductResourcePath(scope, productId)}?${scopeOnly(scope)}`,
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

export function buildPurchasableSkuPath(productId: string, skuId: string) {
  return `${purchasableSkuBasePath(productId)}/${encodeURIComponent(skuId)}`;
}

export function loadSupplierSkuPriceDefaults(
  scope: Extract<ProductApiScope, { kind: "tenant" }>,
  productId: string,
) {
  return requestBackendJson<SupplierSkuPriceContext>(
    `${purchasableSkuBasePath(productId)}/price-defaults?${scopeOnly(scope)}`,
    { fallbackMessage: "基础供货价默认值加载失败" },
  );
}

export function loadSupplierSkuCurrentPrice(
  scope: Extract<ProductApiScope, { kind: "tenant" }>,
  productId: string,
  skuId: string,
) {
  return requestBackendJson<SupplierSkuPriceContext>(
    `${buildPurchasableSkuPath(productId, skuId)}/price?${scopeOnly(scope)}`,
    { fallbackMessage: "SKU 当前供货价加载失败" },
  );
}

function purchasableSkuBasePath(productId: string) {
  return `/supplier-products/${encodeURIComponent(productId)}/purchasable-skus`;
}

export function loadSupplierSkus(
  scope: ProductApiScope,
  productId: string,
  page = 1,
  keyword = "",
) {
  return requestBackendJson<SupplierSkuPage>(
    buildSupplierSkuListPath(scope, productId, page, keyword),
    { fallbackMessage: "供应商 SKU 加载失败" },
  );
}

export function buildSupplierSkuListPath(
  scope: ProductApiScope,
  productId: string,
  page = 1,
  keyword = "",
) {
  const query = scopeQuery(scope, page);
  if (keyword.trim()) query.set("keyword", keyword.trim());
  return `${productBase(scope)}/${productId}/skus?${query}`;
}

export async function loadSupplierSkuCurrent(
  scope: ProductApiScope,
  productId: string,
  identity: Pick<SupplierSku, "id" | "sku_code">,
) {
  const page = await loadSupplierSkus(
    scope,
    productId,
    1,
    identity.sku_code,
  );
  const current = page.list.find((candidate) => candidate.id === identity.id);
  if (!current) throw new Error("SKU 最新状态加载失败");
  return current;
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
  kind: CatalogKind,
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
  kind: CatalogKind,
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

export function canCreateCatalogOptionInline({
  kind,
  scope,
  keyword,
  loading,
  resultCount,
}: {
  kind: CatalogKind;
  scope: ProductApiScope;
  keyword: string;
  loading: boolean;
  resultCount: number;
}): boolean {
  return (
    scope.kind === "tenant"
    && (kind === "categories" || kind === "brands")
    && keyword.trim().length > 0
    && !loading
    && resultCount === 0
  );
}

export function buildCatalogOptionCreateCommand(
  kind: WritableCatalogKind,
  name: string,
  idempotencyKey: string,
  options: { categoryId?: string } = {},
): {
  path: string;
  init: {
    method: "POST";
    headers: { "Idempotency-Key": string };
    body: string;
  };
} {
  return {
    path: `/catalog/${kind}`,
    init: {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        name: name.trim(),
        ...(kind === "brands" && options.categoryId
          ? { category_id: options.categoryId }
          : {}),
      }),
    },
  };
}

export function createCatalogOption(
  kind: WritableCatalogKind,
  name: string,
  idempotencyKey: string,
  options: { categoryId?: string } = {},
) {
  const { path, init } = buildCatalogOptionCreateCommand(
    kind,
    name,
    idempotencyKey,
    options,
  );
  return requestBackendJson<unknown>(path, {
    ...init,
    fallbackMessage: `新建${kind === "categories" ? "分类" : "品牌"}失败`,
  }).then((result) => normalizeCreatedCatalogOption(kind, result));
}

export function normalizeCreatedCatalogOption(
  kind: WritableCatalogKind,
  result: unknown,
): CatalogOption {
  const option = isCatalogOption(result)
    ? result
    : isRecord(result)
      ? findCreatedCatalogOption(kind, result)
      : null;

  if (!option) {
    throw new Error(`新建${kind === "categories" ? "分类" : "品牌"}返回数据无效`);
  }

  return option;
}

function findCreatedCatalogOption(
  kind: WritableCatalogKind,
  result: Record<string, unknown>,
) {
  const key = kind === "categories" ? "catalog_category" : "catalog_brand";
  const candidates = [result.resource, result[key]];
  return candidates.find(isCatalogOption) ?? null;
}

function isCatalogOption(value: unknown): value is CatalogOption {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.code === "string" &&
    typeof value.name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadAllCatalogOptions(
  kind: CatalogKind,
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
