import type { ProductApiScope, SupplierProduct } from "./supplier-product-types";

export type SupplierProductDialogForm = {
  scope: ProductApiScope;
  product?: SupplierProduct;
  productCode: string;
  name: string;
  categoryId: string;
  brandId: string;
  description: string;
};

type SupplierProductDialogPayload = {
  product_code?: string;
  name: string;
  category_id: string;
  brand_id: string;
  description: string | null;
  expected_version?: number;
};

export function shouldShowProductCodeField(
  scope: ProductApiScope,
  product?: SupplierProduct,
): boolean {
  return scope.kind !== "tenant" || Boolean(product);
}

export function isSupplierProductDialogInvalid(
  input: SupplierProductDialogForm,
): boolean {
  if (shouldShowProductCodeField(input.scope, input.product) && !input.productCode.trim()) {
    return true;
  }

  return !input.name.trim() || !input.categoryId || !input.brandId;
}

export function buildSupplierProductDialogPayload(
  input: SupplierProductDialogForm,
): SupplierProductDialogPayload {
  const payload: SupplierProductDialogPayload = {
    name: input.name.trim(),
    category_id: input.categoryId,
    brand_id: input.brandId,
    description: input.description.trim() || null,
  };

  if (shouldShowProductCodeField(input.scope, input.product)) {
    payload.product_code = input.productCode.trim();
  }

  if (input.product) {
    payload.expected_version = input.product.version;
  }

  return payload;
}
