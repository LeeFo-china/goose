import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("平台虚拟商品管理页", () => {
  test("在平台配置导航中注册独立虚拟商品入口", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain('href: "/platform/virtual-products"');
    expect(source).toContain('label: "虚拟商品"');
    expect(source).toContain('permission: "platform.virtual_product.read"');
  });

  test("页面使用通用虚拟商品列表接口并保留分页和权限边界", () => {
    const source = readSource(
      "../../app/(console)/platform/virtual-products/page.tsx",
    );
    const rules = readSource("./platform-virtual-product-rules.ts");

    expect(source).toContain("platform.virtual_product.read");
    expect(source).toContain("platform.virtual_product.manage");
    expect(source).toContain("platform.virtual_product.publish");
    expect(source).toContain('buildBackendUrl(`/platform/virtual-products?${query}`)');
    expect(source).toContain("normalizePlatformListPageSize");
    expect(rules).toContain('query.set("page", String(input.page))');
    expect(rules).toContain('query.set("pageSize", String(input.pageSize))');
    expect(source).not.toContain("pageSize=100");
  });

  test("列表展示虚拟商品事实、状态和微信渠道操作入口", () => {
    const source = readSource("./platform-virtual-product-table.tsx");

    for (const column of [
      "虚拟商品",
      "类型",
      "售价",
      "状态",
      "更新时间",
      "操作",
      "查看配置",
    ]) {
      expect(source).toContain(column);
    }
    expect(source).toContain("PlatformVirtualProductDetail");
  });

  test("新增和编辑表单只编辑商品事实并使用本地图片上传回填 file_id", () => {
    const source = [
      readSource("./platform-virtual-product-form.tsx"),
      readSource("./platform-virtual-product-form-data.ts"),
      readSource("./platform-virtual-product-image-field.tsx"),
    ].join("\n");

    expect(source).toContain("/platform/virtual-products");
    expect(source).toContain('scene: "branding_virtual_goods"');
    expect(source).toContain("fileId");
    expect(source).toContain("image_file_id");
    expect(source).toContain("grant_rule");
    expect(source).toContain("benefit_type");
    expect(source).toContain("refund_template");
    expect(source).toContain("渠道商品 ID 由系统自动生成");
    expect(source).not.toContain("provider_product_id:");
  });

  test("详情面板按沙箱和生产展示系统生成渠道 ID 并提供微信操作", () => {
    const source = readSource("./platform-virtual-product-detail.tsx");
    const rules = readSource("./platform-virtual-product-rules.ts");

    expect(source).toContain("/platform/virtual-products/${product.id}");
    expect(source).toContain("provider_product_id");
    expect(rules).toContain("沙箱环境");
    expect(rules).toContain("生产环境");
    expect(source).toContain("上传商品到微信");
    expect(source).toContain("发布微信商品");
    expect(source).toContain("校验映射");
    expect(source).toContain("/channel-mappings/${environment}/goods/upload");
    expect(source).toContain("/channel-mappings/${environment}/goods/publish");
    expect(source).toContain("/channel-mappings/${environment}/validate");
  });

  test("详情面板操作后的数据刷新不插入顶部加载行造成布局跳动", () => {
    const source = readSource("./platform-virtual-product-detail.tsx");

    expect(source).toContain("showLoading?: boolean");
    expect(source).toContain("if (showLoading) setPendingAction(\"load\")");
    expect(source).toContain("await loadDetail({ showLoading: false })");
  });

  test("详情面板刷新和微信操作提供局部反馈且失败提示不会被刷新清空", () => {
    const source = readSource("./platform-virtual-product-detail.tsx");

    expect(source).toContain('| "refresh"');
    expect(source).toContain("操作中");
    expect(source).toContain("详情已刷新。");
    expect(source).toContain("clearError?: boolean");
    expect(source).toContain("await loadDetail({ showLoading: false, clearError: false })");
    expect(source).toContain("setError(actionError)");
    expect(source).toContain('pendingAction === "refresh"');
  });

  test("编辑保存等待详情刷新完成再关闭，避免后续微信操作使用旧版本", () => {
    const source = readSource("./platform-virtual-product-form.tsx");

    expect(source).toContain("useEffect");
    expect(source).toContain("onSaved?: () => void | Promise<void>");
    expect(source).toContain("await onSaved?.()");
    expect(source).toContain("createInitialVirtualProductFormValues(product)");
  });

  test("loading 骨架屏同步虚拟商品列表布局", () => {
    const source = readSource(
      "../../app/(console)/platform/virtual-products/loading.tsx",
    );

    expect(source).toContain("h-[calc(100vh-6.5625rem)]");
    expect(source).toContain("flex flex-wrap gap-2");
    expect(source).toContain("h-14 w-full");
  });
});
