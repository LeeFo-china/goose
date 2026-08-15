import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("平台共享商品维护页", () => {
  test("按平台商品权限挂载并查询平台共享商品", () => {
    const page = readSource(
      "../../app/(console)/platform/supplier-products/page.tsx",
    );
    const component = readSource("./platform-supplier-products.tsx");
    const api = readSource("./platform-supplier-products-api.ts");

    expect(page).toContain('permissions.has("platform.supplier-product.manage")');
    expect(component).toContain("loadPlatformSupplierProducts");
    expect(api).toContain("/platform/supplier-products");
    expect(component).toContain("不维护租户成交价");
    expect(component).toContain("loadPlatformSuppliers");
    expect(component).toContain("FormSelect");
    expect(component).toContain("PlatformSupplierProductDialog");
    expect(readSource("./platform-supplier-product-dialog.tsx")).toContain(
      "createPlatformSupplierProduct",
    );
  });
});
