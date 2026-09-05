import { describe, expect, test } from "bun:test";

const root = new URL("../../", import.meta.url);

async function source(path: string) {
  return Bun.file(new URL(path, root)).text();
}

describe("warehouse admin page contract", () => {
  test("keeps warehouse setup page simple and hides internal codes", async () => {
    const workspace = await source("components/warehouses/warehouse-workspace.tsx");
    const table = await source("components/warehouses/warehouse-table.tsx");
    const dialog = await source("components/warehouses/warehouse-dialog.tsx");
    const page = await source("app/(console)/warehouses/page.tsx");
    const menu = await source("components/layout/menu-config.ts");

    expect(workspace).toContain("仓库设置");
    expect(workspace).toContain("搜索仓库名称或地址");
    expect(workspace).toContain("暂未设置仓库");
    expect(workspace).not.toContain("warehouse_code");
    expect(table).toContain("设为默认");
    expect(table).toContain("!warehouse.is_default");
    expect(dialog).toContain("仓库名称");
    expect(dialog).toContain("设为默认");
    expect(dialog).toContain("disabled={warehouse?.is_default || submitting}");
    expect(page).toContain("inventory.warehouse.view");
    expect(page).toContain("inventory.warehouse.manage");
    expect(menu).toContain('href: "/warehouses"');
    expect(menu).toContain('permission: "inventory.warehouse.view"');
  });
});
