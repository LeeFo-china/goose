import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const CHILD_ID = "22222222-2222-4222-8222-222222222222";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

async function loadRules() {
  return import("./supplier-catalog-rules").catch(() => null);
}

describe("平台供应标准目录工作台", () => {
  test("在平台配置导航中按目录管理权限注册入口", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain('href: "/platform/catalog"');
    expect(source).toContain('label: "供应标准目录"');
    expect(source).toContain('permission: "platform.catalog.manage"');
  });

  test("三个平级视图只构造当前页的服务端查询", async () => {
    const rules = await loadRules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    expect(rules.buildCatalogListPath({
      view: "categories",
      page: 2,
      pageSize: 20,
      keyword: "防水",
      status: "active",
      parentId: CATEGORY_ID,
    })).toBe(
      `/platform/catalog/categories?page=2&pageSize=20&keyword=${encodeURIComponent("防水")}&status=active&parent_id=${CATEGORY_ID}`,
    );
    expect(rules.buildCatalogListPath({
      view: "brands",
      page: 3,
      pageSize: 10,
      keyword: "",
      status: "",
      parentId: null,
    })).toBe("/platform/catalog/brands?page=3&pageSize=10");
    expect(rules.buildCatalogListPath({
      view: "units",
      page: 1,
      pageSize: 25,
      keyword: "",
      status: "inactive",
      parentId: null,
    })).toBe("/platform/catalog/units?page=1&pageSize=25&status=inactive");
  });

  test("类目路径只定位一个父级并可逐级返回", async () => {
    const rules = await loadRules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    const trail = [
      { id: CATEGORY_ID, name: "主材" },
      { id: CHILD_ID, name: "瓷砖" },
    ];
    const encoded = rules.encodeCategoryTrail(trail);

    expect(rules.decodeCategoryTrail(encoded)).toEqual(trail);
    expect(rules.currentCategoryParent(rules.decodeCategoryTrail(encoded)))
      .toBe(CHILD_ID);
    expect(rules.parentCategoryHref(trail)).toBe(
      `/platform/catalog?view=categories&categoryPath=${encodeURIComponent(rules.encodeCategoryTrail([trail[0]]))}`,
    );
  });

  test("启停请求始终携带乐观版本且不产生删除方法", async () => {
    const rules = await loadRules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    const request = rules.buildCatalogStatusRequest({
      kind: "unit",
      id: CHILD_ID,
      status: "inactive",
      expectedVersion: 7,
    });

    expect(request).toEqual({
      path: `/platform/catalog/units/${CHILD_ID}`,
      init: {
        method: "PATCH",
        body: JSON.stringify({
          expected_version: 7,
          status: "inactive",
        }),
      },
    });
    expect(request.init.method).not.toBe("DELETE");
  });

  test("只把乐观版本冲突送入刷新重试，并保持原启停意图", async () => {
    const rules = await loadRules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    expect(rules.isCatalogVersionConflict({
      status: 409,
      code: "SUPPLIER_VERSION_CONFLICT",
    })).toBe(true);
    expect(rules.isCatalogVersionConflict({
      status: 409,
      code: "SUPPLIER_CATALOG_CONFLICT",
    })).toBe(false);
    expect(rules.resolveCatalogStatusRetry({
      requestedStatus: "inactive",
      latestStatus: "inactive",
    })).toBe("already-applied");
    expect(rules.resolveCatalogStatusRetry({
      requestedStatus: "inactive",
      latestStatus: "active",
    })).toBe("retry");
  });

  test("单位表单保持十进制字符串并区分基准与派生单位", async () => {
    const rules = await loadRules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    const preciseFactor = "123456789012.123456";
    expect(rules.buildUnitRelationshipPayload({
      mode: "base",
      baseUnitId: CATEGORY_ID,
      conversionFactor: preciseFactor,
    })).toEqual({
      base_unit_id: null,
      conversion_factor: "1",
    });
    expect(rules.buildUnitRelationshipPayload({
      mode: "derived",
      baseUnitId: CATEGORY_ID,
      conversionFactor: preciseFactor,
    })).toEqual({
      base_unit_id: CATEGORY_ID,
      conversion_factor: preciseFactor,
    });
  });

  test("页面提供同级标签、单层类目导航和计划列", () => {
    const page = readSource(
      "../../app/(console)/platform/catalog/page.tsx",
    );
    const table = readSource("./supplier-catalog-table.tsx");

    for (const tab of ["标准类目", "品牌", "单位"]) {
      expect(page).toContain(tab);
    }
    expect(page).toContain("PlatformListPageShell");
    expect(page).toContain("categoryPath");
    expect(page).not.toContain("pageSize=100");
    for (const column of [
      "编码",
      "名称",
      "层级",
      "上级类目",
      "法定名称",
      "名称 / 符号",
      "基准单位",
      "换算系数",
      "状态",
      "排序",
      "更新时间",
    ]) {
      expect(table).toContain(column);
    }
  });

  test("新建编辑对话框使用Field并提供冲突恢复", () => {
    const dialogs = [
      readSource("./supplier-catalog-dialogs.tsx"),
      readSource("./catalog-category-dialog.tsx"),
      readSource("./catalog-brand-dialog.tsx"),
      readSource("./catalog-unit-dialog.tsx"),
      readSource("./base-unit-picker.tsx"),
    ].join("\n");
    const actions = readSource("./supplier-catalog-actions.tsx");
    const rules = readSource("./supplier-catalog-rules.ts");

    expect(dialogs).toContain("FieldGroup");
    expect(dialogs).toContain("FieldLabel");
    expect(dialogs).toContain("基准单位");
    expect(dialogs).toContain("派生单位");
    expect(dialogs).toContain("conversionFactor");
    expect(dialogs).not.toContain("Number(form.conversionFactor)");
    expect(`${actions}\n${rules}`).toContain("expected_version");
    expect(actions).toContain("刷新最新数据");
    expect(actions).toContain("重试本次操作");
    expect(actions).not.toContain('method: "DELETE"');

    const baseUnitPicker = readSource("./base-unit-picker.tsx");
    expect(baseUnitPicker).not.toContain("<form");
    expect(baseUnitPicker).toContain('type="button"');
    expect(baseUnitPicker).toContain("handleBaseUnitSearchKeyDown");
    expect(baseUnitPicker).toContain("onClick={handleSearch}");
  });
});
