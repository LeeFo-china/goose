import type {
  SupplierPriceList,
  SupplierProduct,
  SupplierSku,
} from "./supplier-product-types";

export function shouldLoadPriceLists(
  canViewCostPrice: boolean,
  tenantSupplierId: string | null,
) {
  return canViewCostPrice && Boolean(tenantSupplierId);
}

export function nextProductAction(product: SupplierProduct) {
  return product.status === "active" ? "deactivate" : "activate";
}

export function nextSkuAction(sku: SupplierSku) {
  return sku.status === "active" ? "deactivate" : "activate";
}

export function canEditPriceList(priceList: SupplierPriceList) {
  return priceList.lifecycle_status === "draft";
}

export function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
