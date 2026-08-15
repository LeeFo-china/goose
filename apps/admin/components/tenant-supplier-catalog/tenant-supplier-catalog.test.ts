import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { catalogSourceLabel } from "./tenant-supplier-catalog-types";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("租户供应商目录", () => {
  test("在采购供应导航组中按目录权限注册入口", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain('label: "采购供应"');
    expect(source).toContain('href: "/supplier-catalog"');
    expect(source).toContain('label: "供应商目录"');
    expect(source).toContain('permission: "supplier.catalog.manage"');
  });

  test("标记平台共享与租户私有目录来源", () => {
    expect(catalogSourceLabel("platform")).toBe("平台共享");
    expect(catalogSourceLabel("tenant")).toBe("租户私有");
  });

  test("分类与品牌渲染来源徽标和平台映射字段", () => {
    const source = readSource("./tenant-supplier-catalog.tsx");

    expect(source).toContain("catalogSourceLabel");
    expect(source).toContain("ownership_scope");
    expect(source).toContain("mapped_platform_category_id");
    expect(source).toContain("mapped_platform_brand_id");
  });
});
