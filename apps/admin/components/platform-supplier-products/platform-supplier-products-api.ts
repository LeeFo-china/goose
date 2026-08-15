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
