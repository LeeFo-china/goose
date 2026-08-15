import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { catalogSourceLabel } from "./tenant-supplier-catalog-types";
import {
  specValueTypeLabel,
  validateUnitSuggestion,
} from "./tenant-supplier-catalog-rules";

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

  test("规格值类型与单位建议校验", () => {
    expect(specValueTypeLabel("single_enum")).toBe("单选枚举");
    expect(specValueTypeLabel("multi_enum")).toBe("多选枚举");
    expect(validateUnitSuggestion({
      name: "平方英尺",
      symbol: "ft²",
      dimension: "面积",
    })).toBeNull();
    expect(validateUnitSuggestion({
      name: "",
      symbol: "ft²",
      dimension: "面积",
    })).toBe("单位名称不能为空");
  });

  test("租户目录分类品牌可新增编辑，平台行只读", () => {
    const dialogs = readSource("./tenant-catalog-dialogs.tsx");
    const api = readSource("./tenant-supplier-catalog-api.ts");
    const workspace = readSource("./tenant-supplier-catalog.tsx");

    expect(dialogs).toContain("createTenantCategory");
    expect(dialogs).toContain("updateTenantCategory");
    expect(dialogs).toContain("createTenantBrand");
    expect(dialogs).toContain("updateTenantBrand");
    expect(api).toContain('"/catalog/categories"');
    expect(api).toContain('"/catalog/brands"');
    expect(workspace).toContain("ownership_scope === \"tenant\"");
    expect(workspace).toContain("只读");
    expect(workspace).toContain("TenantCategoryDialog");
    expect(workspace).toContain("TenantBrandDialog");
  });

  test("租户目录分类支持树层级浏览与分页", () => {
    const workspace = readSource("./tenant-supplier-catalog.tsx");

    expect(workspace).toContain("parent_id");
    expect(workspace).toContain("breadcrumb");
    expect(workspace).toContain("navigateInto");
    expect(workspace).toContain("上一页");
    expect(workspace).toContain("下一页");
  });
});
