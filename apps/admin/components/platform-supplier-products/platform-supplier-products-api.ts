import { requestBackendJson } from "@/lib/backend-client";

import type {
  PageData,
  SupplierProduct,
} from "@/components/supplier-products/supplier-product-types";

export function loadPlatformSupplierProducts(
  supplierId: string,
  page: number,
  pageSize: number,
) {
  const query = new URLSearchParams({
    supplier_id: supplierId,
    page: String(page),
    pageSize: String(pageSize),
  });
  return requestBackendJson<PageData<SupplierProduct>>(
    `/platform/supplier-products?${query}`,
    { fallbackMessage: "加载平台供应商商品失败" },
  );
}

export type PlatformSupplierOption = {
  id: string;
  code: string;
  name: string;
};

export function loadPlatformSuppliers(page = 1, pageSize = 100) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return requestBackendJson<{
    list: PlatformSupplierOption[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/platform/suppliers?${query}`, { fallbackMessage: "加载平台供应商失败" });
}

export function createPlatformSupplierProduct(
  supplierId: string,
  productId: string,
  input: {
    product_code: string;
    name: string;
    category_id: string;
    brand_id: string;
    description?: string | null;
  },
  idempotencyKey: string,
) {
  const query = new URLSearchParams({ supplierId });
  return requestBackendJson<unknown>(
    `/platform/supplier-products/${productId}?${query}`,
    {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": idempotencyKey },
      fallbackMessage: "新增平台共享商品失败",
    },
  );
}

export function loadPlatformCatalogOptions(kind: "categories" | "brands") {
  const query = new URLSearchParams({
    page: "1",
    pageSize: "100",
    status: "active",
  });
  return requestBackendJson<{
    list: { id: string; code: string; name: string }[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/platform/catalog/${kind}?${query}`, {
    fallbackMessage: `加载平台${kind === "categories" ? "分类" : "品牌"}失败`,
  });
}

export function createPlatformSupplierSku(
  supplierId: string,
  productId: string,
  skuId: string,
  input: {
    sku_code: string;
    name: string;
    specification?: string | null;
    model?: string | null;
    purchase_unit_id: string;
    batch_managed?: boolean;
    color_managed?: boolean;
    serial_managed?: boolean;
  },
  idempotencyKey: string,
) {
  const query = new URLSearchParams({ supplierId });
  return requestBackendJson<unknown>(
    `/platform/supplier-products/${productId}/skus/${skuId}?${query}`,
    {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": idempotencyKey },
      fallbackMessage: "新增平台 SKU 失败",
    },
  );
}

export function loadPlatformCatalogUnits() {
  const query = new URLSearchParams({
    page: "1",
    pageSize: "100",
    status: "active",
  });
  return requestBackendJson<{
    list: { id: string; code: string; name: string; symbol?: string }[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/platform/catalog/units?${query}`, {
    fallbackMessage: "加载平台单位失败",
  });
}
