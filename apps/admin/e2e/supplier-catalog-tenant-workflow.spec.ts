import { expect, test } from "@playwright/test";

import {
  loginAsTenantAdmin,
  loginAsTenantViewer,
  mockBackendBaseUrl,
  readCatalogRequests,
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
    await expect.poll(async () => (await readCatalogRequests(request)).length)
      .toBeGreaterThan(0);
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
            parent_id: "21000000-0000-4000-8000-000000000010",
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
      await expect.poll(() => {
        const value = new URL(page.url()).searchParams.get("categoryPath");
        const currentTrail = JSON.parse(value || "[]") as Array<{ level?: number }>;
        return currentTrail.at(-1)?.level;
      }).toBe(level);
    }
    const levelSevenUrl = page.url();
    await expect(page.getByRole("button", { name: "新建私有类目" })).toBeVisible();
    await page.getByRole("button", { name: "新建私有类目" }).click();
    const levelEightDialog = page.getByRole("dialog", { name: "新建私有类目" });
    await levelEightDialog.getByLabel("编码").fill("TENANT-DEEP-8");
    await levelEightDialog.getByLabel("名称").fill("深层第8层");
    await levelEightDialog.getByRole("button", { name: "保存类目" }).click();
    await expect.poll(async () =>
      (await readMutations(request)).find(
        ({ payload }) => payload.code === "TENANT-DEEP-8",
      )
    ).not.toBeUndefined();
    const deepMutation = (await readMutations(request)).find(
      ({ payload }) => payload.code === "TENANT-DEEP-8",
    );
    expect(deepMutation?.payload.parent_id).toBe(
      "22000000-0000-4000-8000-000000000007",
    );
    const deepPageResponse = await request.get(
      `${mockBackendBaseUrl}/catalog/categories?page=1&pageSize=20&parent_id=22000000-0000-4000-8000-000000000007`,
    );
    expect(deepPageResponse.ok()).toBe(true);
    const deepPage = await deepPageResponse.json() as {
      data: { list: Array<{ code: string }> };
    };
    expect(deepPage.data.list.map(({ code }) => code)).toContain("TENANT-DEEP-8");
    await page.goto(levelSevenUrl, { waitUntil: "networkidle" });
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
      id: "21000000-0000-4000-8000-000000000012",
      name: "深层第8层",
      ownershipScope: "tenant",
      level: 8,
    });
    levelEightUrl.searchParams.set("categoryPath", JSON.stringify(trail));
    await page.goto(`${levelEightUrl.pathname}${levelEightUrl.search}`);
    await expect(page.getByRole("button", { name: "新建私有类目" }))
      .toHaveCount(0);

    const readsBeforeViewer = await readCatalogRequests(request);
    await loginAsTenantViewer(page);
    await page.goto("/supplier-catalog", { waitUntil: "networkidle" });
    await expect(page.getByText("当前账号缺少供应商目录管理权限"))
      .toBeVisible();
    expect(await readCatalogRequests(request)).toHaveLength(
      readsBeforeViewer.length,
    );
  });

  test("可维护映射、单位建议并连续复制私有分类规格", async ({ page, request }) => {
    await loginAsTenantAdmin(page);
    await page.goto("/supplier-catalog", { waitUntil: "networkidle" });
    let categoryRow = page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "TENANT-SUPPLIES", exact: true }),
    });
    await expect(categoryRow).toContainText("平台标准建材");
    await categoryRow.getByRole("button", { name: "编辑" }).click();
    let categoryDialog = page.getByRole("dialog", { name: "编辑私有类目" });
    await expect(categoryDialog).toBeVisible();
    await categoryDialog.getByRole("button", {
      name: /平台饰面材料.*PLATFORM-FINISH/,
    }).click();
    await expect(categoryDialog.getByText(/当前映射：平台饰面材料/))
      .toBeVisible();
    await categoryDialog.getByRole("button", { name: "保存类目" }).click();
    await expect(page.getByText("私有类目已保存")).toBeVisible();
    categoryRow = page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "TENANT-SUPPLIES", exact: true }),
    });
    await expect(categoryRow).toContainText("平台饰面材料");

    await page.getByRole("tab", { name: "品牌" }).click();
    let brandRow = page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "TENANT-BRAND", exact: true }),
    });
    await expect(brandRow).toContainText("基准品牌");
    await brandRow.getByRole("button", { name: "编辑" }).click();
    const brandDialog = page.getByRole("dialog", { name: "编辑私有品牌" });
    await brandDialog.getByLabel("选择平台品牌映射").click();
    await page.getByRole("option", { name: /备选标准品牌.*BRAND-SECOND/ })
      .click();
    await expect(brandDialog.getByLabel("选择平台品牌映射"))
      .toContainText("备选标准品牌");
    await brandDialog.getByRole("button", { name: "保存品牌" }).click();
    await expect(page.getByText("私有品牌已保存")).toBeVisible();
    brandRow = page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "TENANT-BRAND", exact: true }),
    });
    await expect(brandRow).toContainText("备选标准品牌");
    await brandRow.getByRole("button", { name: "编辑" }).click();
    const clearBrandDialog = page.getByRole("dialog", { name: "编辑私有品牌" });
    await clearBrandDialog.getByRole("button", {
      name: "清除平台品牌映射",
    }).click();
    await clearBrandDialog.getByRole("button", { name: "保存品牌" }).click();
    await expect(page.getByText("私有品牌已保存")).toBeVisible();
    await expect(page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "TENANT-BRAND", exact: true }),
    })).toContainText("未映射");

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
    await expect.poll(async () => (await readMutations(request)).filter(
      ({ path }) => path.endsWith("spec-definitions:copy-platform"),
    ).length).toBe(1);
    await expect(specs).not.toBeVisible();

    const refreshedPrivateRow = page.getByRole("row").filter({
      has: page.getByRole("cell", { name: "TENANT-SUPPLIES", exact: true }),
    });
    await refreshedPrivateRow.getByRole("button", { name: "规格模板" }).click();
    const refreshedSpecs = page.getByRole("dialog", {
      name: "租户标准辅料规格模板",
    });
    await expect(refreshedSpecs.getByRole("row").filter({ hasText: "材质" }))
      .toContainText("租户私有");
    await refreshedSpecs.getByRole("button", { name: "复制平台模板" }).click();
    await expect.poll(async () => (await readMutations(request)).filter(
      ({ path }) => path.endsWith("spec-definitions:copy-platform"),
    ).length).toBe(2);
    const mutations = await readMutations(request);
    const categoryUpdates = mutations.filter(({ path }) =>
      path === "/catalog/categories/21000000-0000-4000-8000-000000000001"
    );
    expect(categoryUpdates.map(({ payload }) =>
      payload.mapped_platform_category_id
    )).toEqual(["11000000-0000-4000-8000-000000000011"]);
    const brandUpdates = mutations.filter(({ path }) =>
      path === "/catalog/brands/23000000-0000-4000-8000-000000000001"
    );
    expect(brandUpdates.map(({ payload }) => payload.mapped_platform_brand_id))
      .toEqual(["12000000-0000-4000-8000-000000000099", null]);
    const copies = mutations.filter(({ path }) =>
      path.endsWith("spec-definitions:copy-platform")
    );
    expect(copies.map(({ payload }) => payload.expected_version)).toEqual([2, 3]);
    expect(copies[0]?.idempotencyKey).not.toBe(copies[1]?.idempotencyKey);
    await expect(refreshedSpecs).not.toBeVisible();
  });
});
