import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { supplierProductSourceLabel } from "./supplier-product-types";
import { canMutateProduct } from "./supplier-product-rules";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("供应商品与供货价工作区", () => {
  test("按商品查看权限注册导航和页面入口", () => {
    const menu = readSource("../layout/menu-config.ts");
    const page = readSource(
      "../../app/(console)/supplier-products/page.tsx",
    );

    expect(menu).toContain('href: "/supplier-products"');
    expect(menu).toContain('label: "商品与价格"');
    expect(menu).toContain('permission: "supplier.product.view"');
    expect(page).toContain('permissions.has("supplier.product.view")');
    expect(page).toContain('permissions.has("supplier.product.manage")');
    expect(page).toContain('permissions.has("supplier.cost-price.view")');
    expect(page).toContain('permissions.has("supplier.cost-price.manage")');
  });

  test("商品 DTO 与成本价 DTO 保持隔离", () => {
    const types = readSource("./supplier-product-types.ts");
    const workspace = readSource("./supplier-product-workspace.tsx");
    const pricePanel = readSource("./supplier-price-list-panel.tsx");

    expect(types).toContain("export type SupplierProduct");
    expect(types).toContain("export type SupplierPriceListItem");
    expect(workspace).toContain("canViewCostPrice");
    expect(workspace).not.toContain("unit_price");
    expect(pricePanel).toContain("unit_price");
    expect(pricePanel).toContain("发布后不可修改");
  });

  test("商品和 SKU 代录要求原因并使用独立权限", () => {
    const productDialog = readSource("./supplier-product-dialog.tsx");
    const skuDialog = readSource("./supplier-sku-dialog.tsx");
    const productList = readSource("./supplier-product-list.tsx");

    expect(productDialog).toContain("proxy_reason");
    expect(productDialog).toContain("代录原因");
    expect(skuDialog).toContain("proxy_reason");
    expect(skuDialog).toContain("代录原因");
    expect(productList).toContain("supplier_product_id");
    expect(productList).not.toContain("/ignored/");
  });

  test("只有成本价查看权限且已选供应商时才加载价格", async () => {
    const rules = await import("./supplier-product-rules");

    expect(rules.shouldLoadPriceLists(false, "relationship-1")).toBe(false);
    expect(rules.shouldLoadPriceLists(true, null)).toBe(false);
    expect(rules.shouldLoadPriceLists(true, "relationship-1")).toBe(true);
  });

  test("商品列表标记平台共享与租户私有来源", () => {
    const list = readSource("./supplier-product-list.tsx");

    expect(list).toContain("ownership_scope");
    expect(list).toContain("supplierProductSourceLabel");
    expect(supplierProductSourceLabel("platform")).toBe("平台共享");
    expect(supplierProductSourceLabel("tenant")).toBe("租户私有");
  });

  test("平台共享商品为只读，租户商品可写", () => {
    expect(canMutateProduct({ ownership_scope: "platform" }, true)).toBe(false);
    expect(canMutateProduct({ ownership_scope: "tenant" }, true)).toBe(true);
    expect(canMutateProduct({ ownership_scope: "tenant" }, false)).toBe(false);
  });

  test("非合作中关系显示历史只读说明并禁用写入", () => {
    const workspace = readSource("./supplier-product-workspace.tsx");

    expect(workspace).toContain("relationship_status");
    expect(workspace).toContain("isActive");
    expect(workspace).toContain("仅供历史查看");
    expect(workspace).toContain("canWrite");
  });
});
