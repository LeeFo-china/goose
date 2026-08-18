import { expect, test } from "@playwright/test";

import {
  loginAsTenantAdmin,
  readMutations,
  resetMock,
} from "./supplier-catalog-test-helpers";

test.describe("租户私有供应商目录", () => {
  test.beforeEach(async ({ request }) => {
    await resetMock(request);
  });

  test("共享树只读且租户可建立二级与第八层私有分类", async ({ page, request }) => {
    await loginAsTenantAdmin(page);
    await page.goto("/supplier-catalog", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "供应商目录", level: 1 }),
    ).toBeVisible();
    const sharedRow = page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "PLATFORM-MATERIAL", exact: true }),
    });
    await expect(sharedRow.getByText("平台共享", { exact: true })).toBeVisible();
    await expect(sharedRow.getByRole("button", { name: "编辑", exact: true }))
      .toHaveCount(0);
    await sharedRow.getByRole("link", {
      name: "查看平台标准建材的下级分类",
    }).click();
    await expect(page.getByRole("button", { name: "新建私有类目" }))
      .toHaveCount(0);
    await page.getByRole("link", { name: "返回上级" }).click();

    await page.getByRole("button", { name: "新建私有类目" }).click();
    const dialog = page.getByRole("dialog", { name: "新建私有类目" });
    await dialog.getByLabel("编码").fill("TENANT-TILE");
    await dialog.getByLabel("名称").fill("租户瓷砖");
    await dialog.getByRole("button", {
      name: /平台标准建材.*PLATFORM-MATERIAL/,
    }).click();
    await expect(dialog.getByText(/当前映射：平台标准建材/)).toBeVisible();
    await dialog.getByRole("button", { name: "保存类目" }).click();

    await expect(page.getByText("私有类目已创建")).toBeVisible();
    const privateRow = page.getByRole("row").filter({ hasText: "租户瓷砖" });
    await expect(privateRow.getByText("租户私有", { exact: true })).toBeVisible();
    await expect(privateRow.getByRole("button", { name: "编辑" })).toBeVisible();
    await privateRow.getByRole("link", {
      name: "查看租户瓷砖的下级分类",
    }).click();
    await expect.poll(() => new URL(page.url()).searchParams.has("categoryPath"))
      .toBe(true);
    await page.getByRole("button", { name: "新建私有类目" }).click();
    const childDialog = page.getByRole("dialog", { name: "新建私有类目" });
    await childDialog.getByLabel("编码").fill("TENANT-TILE-GLUE");
    await childDialog.getByLabel("名称").fill("瓷砖胶");
    await childDialog.getByRole("button", { name: "保存类目" }).click();
    await expect(page.getByRole("row").filter({ hasText: "租户瓷砖 / 瓷砖胶" }))
      .toBeVisible();

    const mutations = await readMutations(request);
    expect(mutations.slice(-2).map(({ path, payload }) => ({ path, payload })))
      .toEqual([
        {
          path: "/catalog/categories",
          payload: expect.objectContaining({
            parent_id: null,
            code: "TENANT-TILE",
            mapped_platform_category_id: "11000000-0000-4000-8000-000000000010",
          }),
        },
        {
          path: "/catalog/categories",
          payload: expect.objectContaining({
            parent_id: "21000000-0000-4000-8000-000000000009",
            code: "TENANT-TILE-GLUE",
          }),
        },
      ]);

    await page.goto("/supplier-catalog", { waitUntil: "networkidle" });
    let deepRow = page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "TENANT-SUPPLIES", exact: true }),
    });
    await deepRow.getByRole("link", {
      name: "查看租户标准辅料的下级分类",
    }).click();
    for (let level = 2; level <= 7; level += 1) {
      deepRow = page.getByRole("row").filter({
        has: page.getByRole("cell", { name: `TENANT-DEEP-${level}`, exact: true }),
      });
      await expect(deepRow).toBeVisible();
      await deepRow.getByRole("link", {
        name: `查看深层第${level}层的下级分类`,
      }).click();
    }
    await expect(page.getByRole("button", { name: "新建私有类目" })).toBeVisible();
    await page.getByRole("button", { name: "新建私有类目" }).click();
    const levelEightDialog = page.getByRole("dialog", { name: "新建私有类目" });
    await levelEightDialog.getByLabel("编码").fill("TENANT-DEEP-8");
    await levelEightDialog.getByLabel("名称").fill("深层第8层");
    await levelEightDialog.getByRole("button", { name: "保存类目" }).click();
    const levelEightRow = page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "TENANT-DEEP-8", exact: true }),
    });
    await expect(levelEightRow).toBeVisible();
    await expect(levelEightRow.getByRole("link", {
      name: "查看深层第8层的下级分类",
    })).toHaveCount(0);

    const levelEightUrl = new URL(page.url());
    const trail = JSON.parse(levelEightUrl.searchParams.get("categoryPath") || "[]");
    trail.push({
      id: "21000000-0000-4000-8000-000000000011",
      name: "深层第8层",
      ownershipScope: "tenant",
      level: 8,
    });
    levelEightUrl.searchParams.set("categoryPath", JSON.stringify(trail));
    await page.goto(`${levelEightUrl.pathname}${levelEightUrl.search}`);
    await expect(page.getByRole("button", { name: "新建私有类目" }))
      .toHaveCount(0);
  });

  test("可查看计量维度、提交单位建议并维护私有分类规格", async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.goto("/supplier-catalog?view=units", { waitUntil: "networkidle" });
    await expect(page.getByText("数量", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "编辑" })).toHaveCount(0);

    await page.getByRole("tab", { name: "单位建议" }).click();
    await page.getByRole("button", { name: "提交单位建议" }).click();
    const suggestion = page.getByRole("dialog", { name: "提交单位建议" });
    await suggestion.getByLabel("建议编码").fill("ROLL");
    await suggestion.getByLabel("建议名称").fill("卷");
    await suggestion.getByLabel("建议符号").fill("卷");
    await suggestion.getByLabel("计量维度").fill("quantity");
    await suggestion.getByLabel("建议原因").fill("装修辅料常用包装单位");
    await suggestion.getByRole("button", { name: "提交建议" }).click();
    await expect(page.getByText("单位建议已提交")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "ROLL" }))
      .toContainText("待审核");

    await page.getByRole("tab", { name: "分类" }).click();
    const privateRow = page.getByRole("row").filter({ hasText: "租户标准辅料" });
    await privateRow.getByRole("button", { name: "规格模板" }).click();
    const specs = page.getByRole("dialog", { name: "租户标准辅料规格模板" });
    await specs.getByRole("button", { name: "复制平台模板" }).click();
    await expect(page.getByText("平台规格模板已复制")).toBeVisible();
    await expect(specs.getByRole("row").filter({ hasText: "材质" }))
      .toContainText("租户私有");
  });
});
