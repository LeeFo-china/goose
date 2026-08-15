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
