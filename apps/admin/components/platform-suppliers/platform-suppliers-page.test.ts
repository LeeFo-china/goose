import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("平台供应商工作台", () => {
  test("在平台导航中按查看权限注册供应商管理入口", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain('href: "/platform/suppliers"');
    expect(source).toContain('label: "供应商管理"');
    expect(source).toContain('permission: "platform.supplier.view"');
  });

  test("只请求当前页并规范化四类列表筛选条件", () => {
    const source = readSource(
      "../../app/(console)/platform/suppliers/page.tsx",
    );

    expect(source).toContain("normalizePlatformListPageSize");
    expect(source).toContain('query.set("page", String(input.page))');
    expect(source).toContain('query.set("pageSize", String(input.pageSize))');
    expect(source).toContain("qualification_health");
    expect(source).toContain("onboarding_status");
    expect(source).toContain("operational_status");
    expect(source).toContain("keyword");
    expect(source).not.toContain("pageSize=100");
  });

  test("提供同级供应商和资质类型视图并限制管理权限", () => {
    const source = readSource(
      "../../app/(console)/platform/suppliers/page.tsx",
    );

    expect(source).toContain("供应商列表");
    expect(source).toContain("资质类型");
    expect(source).toContain("platform.supplier.manage");
    expect(source).toContain("TabsList");
    expect(source).toContain("TabsTrigger");
    expect(source).toContain("PlatformListPageShell");
  });

  test("移除列表 tabs 下方的冗余标题并同步骨架屏", () => {
    const page = readSource("../../app/(console)/platform/suppliers/page.tsx");
    const loading = readSource("../../app/(console)/platform/suppliers/loading.tsx");

    expect(page).not.toContain("listHeader=");
    expect(page).not.toContain("CardTitle");
    expect(loading).toContain("flex flex-wrap gap-2");
    expect(loading).not.toContain('Skeleton className="h-5 w-24"');
  });

  test("供应商表格保留运营扫描所需列", () => {
    const source = readSource("./platform-supplier-table.tsx");

    for (const column of [
      "供应商",
      "类型",
      "准入状态",
      "运营状态",
      "资质健康",
      "更新时间",
      "操作",
    ]) {
      expect(source).toContain(column);
    }
  });

  test("详情按需加载五个同级页签且每页十条", () => {
    const source = readSource("./platform-supplier-detail.tsx");
    const dataSource = readSource("./use-platform-supplier-detail-data.ts");

    for (const tab of [
      "基本资料",
      "资质",
      "服务区域",
      "联系人与地址",
      "操作记录",
    ]) {
      expect(source).toContain(tab);
    }
    expect(source).toContain("activeTab");
    expect(dataSource).toContain("pageSize=10");
    expect(dataSource).not.toContain("Promise.all");
  });

  test("生命周期动作使用明确按钮、幂等键和冲突恢复", () => {
    const source = readSource("./platform-supplier-actions.tsx");

    for (const action of [
      "提交审核",
      "审核通过",
      "驳回申请",
      "暂停合作",
      "恢复合作",
      "加入黑名单",
    ]) {
      expect(source).toContain(action);
    }
    expect(source).toContain('"Idempotency-Key"');
    expect(source).toContain("expected_version");
    expect(source).toContain("刷新最新数据");
    expect(source).toContain("重试本次操作");
    expect(source).not.toMatch(/<select[\s>]/i);
  });

  test("新增供应商使用营业执照 OCR 回填和主要联系人准入表单", () => {
    const page = readSource(
      "../../app/(console)/platform/suppliers/page.tsx",
    );
    const form = readSource("./platform-supplier-onboarding-form.tsx");
    const api = readSource("./platform-supplier-onboarding-api.ts");

    expect(page).toContain("PlatformSupplierOnboardingFormButton");
    expect(form).toContain('scene: "supplier_business_license"');
    expect(form).toContain("/platform/suppliers/onboarding");
    expect(form).toContain("主要联系人");
    expect(form).toContain("联系人姓名");
    expect(form).toContain("联系方式");
    expect(form).toContain("mapBusinessLicenseOcrFields");
    expect(form).toContain('"Idempotency-Key"');
    expect(api).toContain("/platform/ocr/recognitions");
    expect(api).toContain('scene: "supplier_onboarding"');
    expect(api).toContain("/platform/suppliers/identity-check");
  });

  test("资质类型使用分页表格和乐观版本编辑", () => {
    const source = readSource("./supplier-qualification-type-table.tsx");

    for (const column of [
      "编码",
      "名称",
      "适用类型",
      "预警天数",
      "必填",
      "阻止下单",
      "状态",
      "排序",
    ]) {
      expect(source).toContain(column);
    }
    expect(source).toContain("expected_version");
    expect(source).toContain("pagination");
    expect(source).toContain("停用后保留历史资质记录");
  });
});
