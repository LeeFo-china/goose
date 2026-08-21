import { describe, expect, test } from "bun:test";

import {
  canManagePlatformSupplierProducts,
  platformSupplierProductScope,
} from "./platform-supplier-product-rules";
import {
  buildProductListPath,
  buildPriceListPath,
} from "../supplier-products/supplier-product-api";

describe("平台共享商品管理边界", () => {
  test("仅平台角色和专用权限可以进入维护态", () => {
    expect(canManagePlatformSupplierProducts(
      ["platform_admin"],
      ["platform.supplier-product.manage"],
    )).toBe(true);
    expect(canManagePlatformSupplierProducts(
      ["platform_staff"],
      ["platform.supplier-product.manage"],
    )).toBe(true);
    expect(canManagePlatformSupplierProducts(
      ["platform_admin"],
      ["platform.catalog.manage"],
    )).toBe(true);
    expect(canManagePlatformSupplierProducts(
      ["platform_staff"],
      ["platform.catalog.manage"],
    )).toBe(false);
    expect(canManagePlatformSupplierProducts(
      ["tenant_admin"],
      ["platform.supplier-product.manage"],
    )).toBe(false);
  });

  test("平台作用域只构建平台商品路径且拒绝价格路径", () => {
    const scope = platformSupplierProductScope("supplier-platform-1");
    expect(buildProductListPath(scope, 2, "瓷砖")).toBe(
      "/platform/supplier-products?supplierId=supplier-platform-1&page=2&pageSize=20&keyword=%E7%93%B7%E7%A0%96",
    );
    expect(() => buildPriceListPath(scope, 1)).toThrow(
      "平台商品页不能访问租户采购价",
    );
  });
});
