import { describe, expect, test } from "bun:test";

import {
  buildSupplierProductDialogPayload,
  isSupplierProductDialogInvalid,
  shouldShowProductCodeField,
  type SupplierProductDialogForm,
} from "./supplier-product-dialog-state";
import type { ProductApiScope, SupplierProduct } from "./supplier-product-types";

const tenantScope: ProductApiScope = {
  kind: "tenant",
  tenantSupplierId: "relationship-1",
};

const platformScope: ProductApiScope = {
  kind: "platform",
  supplierId: "supplier-1",
};

const tenantProduct = {
  id: "product-1",
  product_code: "TP-001",
  version: 7,
} as SupplierProduct;

function form(
  overrides: Partial<SupplierProductDialogForm> = {},
): SupplierProductDialogForm {
  return {
    scope: tenantScope,
    product: undefined,
    productCode: " SP-001 ",
    name: "  地砖  ",
    categoryId: "category-1",
    brandId: "brand-1",
    description: "  防滑  ",
    ...overrides,
  };
}

describe("供应商商品弹窗状态", () => {
  test("仅租户新增隐藏商品编码字段", () => {
    expect(shouldShowProductCodeField(tenantScope)).toBe(false);
    expect(shouldShowProductCodeField(platformScope)).toBe(true);
    expect(shouldShowProductCodeField(tenantScope, tenantProduct)).toBe(true);
  });

  test("租户新增不要求商品编码，平台新增和编辑要求商品编码", () => {
    expect(isSupplierProductDialogInvalid(form({ productCode: "" }))).toBe(false);
    expect(isSupplierProductDialogInvalid(form({
      scope: platformScope,
      productCode: "",
    }))).toBe(true);
    expect(isSupplierProductDialogInvalid(form({
      product: tenantProduct,
      productCode: "",
    }))).toBe(true);
    expect(isSupplierProductDialogInvalid(form({ name: " " }))).toBe(true);
    expect(isSupplierProductDialogInvalid(form({ categoryId: "" }))).toBe(true);
    expect(isSupplierProductDialogInvalid(form({ brandId: "" }))).toBe(true);
  });

  test("租户新增载荷不发送商品编码并将空说明转为 null", () => {
    expect(buildSupplierProductDialogPayload(form({
      productCode: " SHOULD-NOT-SEND ",
      description: " ",
    }))).toEqual({
      name: "地砖",
      category_id: "category-1",
      brand_id: "brand-1",
      description: null,
    });
  });

  test("平台新增载荷发送修剪后的商品编码", () => {
    expect(buildSupplierProductDialogPayload(form({
      scope: platformScope,
    }))).toEqual({
      product_code: "SP-001",
      name: "地砖",
      category_id: "category-1",
      brand_id: "brand-1",
      description: "防滑",
    });
  });

  test("租户编辑载荷发送商品编码和预期版本", () => {
    expect(buildSupplierProductDialogPayload(form({
      product: tenantProduct,
      productCode: " TP-009 ",
    }))).toEqual({
      product_code: "TP-009",
      name: "地砖",
      category_id: "category-1",
      brand_id: "brand-1",
      description: "防滑",
      expected_version: 7,
    });
  });
});
