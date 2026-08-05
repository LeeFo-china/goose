import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const sourceUrl = new URL(path, import.meta.url);
  expect(existsSync(sourceUrl), path).toBe(true);
  return existsSync(sourceUrl) ? readFileSync(sourceUrl, "utf8") : "";
}

describe("平台技术服务套餐配置页", () => {
  test("在平台配置导航中注册套餐配置入口", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain('href: "/platform/service-products"');
    expect(source).toContain('label: "技术服务套餐"');
    expect(source).toContain('permission: "platform.service_product.manage"');
  });

  test("页面调用平台套餐接口并保留分页", () => {
    const page = readSource(
      "../../app/(console)/platform/service-products/page.tsx",
    );
    const rules = readSource("./platform-service-product-rules.ts");

    expect(page).toContain("platform.service_product.manage");
    expect(page).toContain("/platform/billing/service-products?");
    expect(page).toContain("normalizePlatformListPageSize");
    expect(rules).toContain('query.set("page", String(input.page))');
    expect(rules).toContain('query.set("pageSize", String(input.pageSize))');
    expect(page).not.toContain("pageSize=100");
  });

  test("页面展示三档套餐配置能力和同步骨架屏", () => {
    const page = readSource(
      "../../app/(console)/platform/service-products/page.tsx",
    );
    const loading = readSource(
      "../../app/(console)/platform/service-products/loading.tsx",
    );

    expect(page).toContain("PlatformListPageShell");
    expect(page).toContain("技术服务套餐");
    expect(page).toContain("1年 / 2年 / 3年");
    expect(page).toContain("PlatformServiceProductFormButton");
    expect(page).toContain('tableViewportTestId="platform-service-products-table-viewport"');
    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("h-14 w-full");
  });

  test("表格和详情操作覆盖价格、条款、发布和归档", () => {
    const source = [
      readSource("./platform-service-product-table.tsx"),
      readSource("./platform-service-product-detail.tsx"),
      readSource("./platform-service-product-form.tsx"),
      readSource("./platform-service-product-form-data.ts"),
    ].join("\n");

    for (const label of [
      "套餐",
      "服务年限",
      "标价",
      "实付价",
      "折扣",
      "发布状态",
      "编辑套餐",
      "发布套餐",
      "归档套餐",
      "服务范围",
      "服务条款",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("/platform/billing/service-products/");
    expect(source).toContain("/publish");
    expect(source).toContain("/archive");
    expect(source).toContain("expected_version");
    expect(source).toContain("idempotency_key");
    expect(source).toContain("crypto.randomUUID()");
  });
});
