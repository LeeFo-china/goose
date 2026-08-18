import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3997";
const platformAdminPhone = "18637605353";
const tenantAdminPhone = "18637605354";

type MutationJournalEntry = {
  method: "POST" | "PATCH";
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
};

async function resetMock(request: APIRequestContext) {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`);
  expect(response.ok()).toBe(true);
}

async function loginAsPlatformAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: platformAdminPhone, code: "" },
  });
  expect(response.ok()).toBe(true);
}

async function loginAsTenantAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: tenantAdminPhone, code: "" },
  });
  expect(response.ok()).toBe(true);
}

async function readMutations(
  request: APIRequestContext,
): Promise<MutationJournalEntry[]> {
  const response = await request.get(
    `${mockBackendBaseUrl}/__test/mutations`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json() as { mutations: MutationJournalEntry[] })
    .mutations;
}

async function submitStatus(row: Locator, page: Page, action: "停用" | "启用") {
  await row.getByRole("button", { name: action, exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: new RegExp(`^${action}`),
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", {
    name: `${action}目录数据`,
    exact: true,
  }).click();
}

test.describe("供应标准目录确定性工作流", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetMock(request);
    await loginAsPlatformAdmin(page);
  });

  test("类目可完成新建、编辑、停用和启用", async ({ page, request }) => {
    await page.goto("/platform/catalog", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "供应标准目录", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("基础建材", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "新建类目" }).click();
    const createDialog = page.getByRole("dialog", {
      name: "新建标准类目",
    });
    await createDialog.getByLabel("编码").fill("E2E-CATEGORY");
    await createDialog.getByLabel("名称").fill("E2E 新类目");
    await createDialog.getByRole("button", { name: "保存类目" }).click();

    await expect(page.getByText("标准类目已创建")).toBeVisible();
    let row = page.getByRole("row").filter({ hasText: "E2E 新类目" });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "编辑" }).click();
    const editDialog = page.getByRole("dialog", {
      name: "编辑标准类目",
    });
    await editDialog.getByLabel("名称").fill("E2E 编辑类目");
    await editDialog.getByRole("button", { name: "保存类目" }).click();

    await expect(page.getByText("标准类目已保存")).toBeVisible();
    row = page.getByRole("row").filter({ hasText: "E2E 编辑类目" });
    await expect(row).toBeVisible();

    await submitStatus(row, page, "停用");
    await expect(page.getByText("E2E 编辑类目已停用")).toBeVisible();
    row = page.getByRole("row").filter({ hasText: "E2E 编辑类目" });
    await expect(row.getByText("停用", { exact: true })).toBeVisible();

    await submitStatus(row, page, "启用");
    await expect(page.getByText("E2E 编辑类目已启用")).toBeVisible();
    row = page.getByRole("row").filter({ hasText: "E2E 编辑类目" });
    await expect(row.getByText("启用", { exact: true })).toBeVisible();

    const mutations = await readMutations(request);
    expect(mutations).toHaveLength(4);
    expect(mutations.map((entry) => ({
      method: entry.method,
      path: entry.path,
      idempotencyKey: entry.idempotencyKey,
      payload: entry.payload,
    }))).toEqual([
      {
        method: "POST",
        path: "/platform/catalog/categories",
        idempotencyKey: expect.stringMatching(/^catalog-category:/),
        payload: {
          parent_id: null,
          level: 1,
          status: "active",
          code: "E2E-CATEGORY",
          name: "E2E 新类目",
          sort_order: 100,
        },
      },
      {
        method: "PATCH",
        path: "/platform/catalog/categories/11000000-0000-4000-8000-000000000002",
        idempotencyKey: null,
        payload: {
          expected_version: 1,
          code: "E2E-CATEGORY",
          name: "E2E 编辑类目",
          sort_order: 100,
        },
      },
      {
        method: "PATCH",
        path: "/platform/catalog/categories/11000000-0000-4000-8000-000000000002",
        idempotencyKey: null,
        payload: {
          expected_version: 2,
          status: "inactive",
        },
      },
      {
        method: "PATCH",
        path: "/platform/catalog/categories/11000000-0000-4000-8000-000000000002",
        idempotencyKey: null,
        payload: {
          expected_version: 3,
          status: "active",
        },
      },
    ]);
  });

  test("品牌可完成新建、编辑和冲突后启停", async ({ page, request }) => {
    await page.goto("/platform/catalog?view=brands", {
      waitUntil: "networkidle",
    });
    await expect(page.getByText("基准品牌", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "新建品牌" }).click();
    const createDialog = page.getByRole("dialog", { name: "新建品牌" });
    await createDialog.getByLabel("编码").fill("E2E-BRAND");
    await createDialog.getByLabel("品牌").fill("E2E 新品牌");
    await createDialog.getByLabel("法定名称").fill("E2E 品牌有限公司");
    await createDialog.getByRole("button", { name: "保存品牌" }).click();

    await expect(page.getByText("品牌已创建")).toBeVisible();
    let row = page.getByRole("row").filter({ hasText: "E2E 新品牌" });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "编辑" }).click();
    const editDialog = page.getByRole("dialog", { name: "编辑品牌" });
    await editDialog.getByLabel("品牌").fill("E2E 编辑品牌");
    await editDialog.getByLabel("法定名称").fill("E2E 编辑品牌有限公司");
    await editDialog.getByRole("button", { name: "保存品牌" }).click();

    await expect(page.getByText("品牌已保存")).toBeVisible();
    row = page.getByRole("row").filter({ hasText: "E2E 编辑品牌" });
    await expect(row).toBeVisible();

    const conflictResponse = await request.post(
      `${mockBackendBaseUrl}/__test/conflict-next`,
      {
        data: {
          kind: "brand",
          id: "12000000-0000-4000-8000-000000000002",
        },
      },
    );
    expect(conflictResponse.ok()).toBe(true);

    await submitStatus(row, page, "停用");
    const statusDialog = page.getByRole("dialog", {
      name: /^停用/,
    });
    await expect(statusDialog.getByText("数据版本已变化")).toBeVisible();

    const secondConflictResponse = await request.post(
      `${mockBackendBaseUrl}/__test/conflict-next`,
      {
        data: {
          kind: "brand",
          id: "12000000-0000-4000-8000-000000000002",
        },
      },
    );
    expect(secondConflictResponse.ok()).toBe(true);

    await statusDialog.getByRole("button", {
      name: "重试本次操作",
    }).click();
    await expect.poll(async () => (await readMutations(request)).length)
      .toBe(4);
    await expect(statusDialog.getByText("数据版本已变化")).toBeVisible();
    await statusDialog.getByRole("button", {
      name: "重试本次操作",
    }).click();
    await expect.poll(async () => (await readMutations(request)).length)
      .toBe(5);
    await expect(page.getByText("E2E 编辑品牌已停用")).toBeVisible();

    row = page.getByRole("row").filter({ hasText: "E2E 编辑品牌" });
    await expect(row.getByText("停用", { exact: true })).toBeVisible();
    await submitStatus(row, page, "启用");
    await expect(page.getByText("E2E 编辑品牌已启用")).toBeVisible();

    const mutations = await readMutations(request);
    expect(mutations).toHaveLength(6);
    expect(mutations[0]).toMatchObject({
      method: "POST",
      path: "/platform/catalog/brands",
      idempotencyKey: expect.stringMatching(/^catalog-brand:/),
      payload: {
        status: "active",
        code: "E2E-BRAND",
        name: "E2E 新品牌",
        legal_name: "E2E 品牌有限公司",
        sort_order: 100,
      },
    });
    expect(mutations.slice(1).map(({ path, payload }) => ({
      path,
      payload,
    }))).toEqual([
      {
        path: "/platform/catalog/brands/12000000-0000-4000-8000-000000000002",
        payload: {
          expected_version: 1,
          code: "E2E-BRAND",
          name: "E2E 编辑品牌",
          legal_name: "E2E 编辑品牌有限公司",
          sort_order: 100,
        },
      },
      {
        path: "/platform/catalog/brands/12000000-0000-4000-8000-000000000002",
        payload: { expected_version: 2, status: "inactive" },
      },
      {
        path: "/platform/catalog/brands/12000000-0000-4000-8000-000000000002",
        payload: { expected_version: 3, status: "inactive" },
      },
      {
        path: "/platform/catalog/brands/12000000-0000-4000-8000-000000000002",
        payload: { expected_version: 4, status: "inactive" },
      },
      {
        path: "/platform/catalog/brands/12000000-0000-4000-8000-000000000002",
        payload: { expected_version: 5, status: "active" },
      },
    ]);
  });

  test("单位可完成新建、编辑、停用和启用", async ({ page, request }) => {
    await page.goto("/platform/catalog?view=units", {
      waitUntil: "networkidle",
    });
    await expect(page.getByText("个", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "新建单位" }).click();
    const createDialog = page.getByRole("dialog", { name: "新建单位" });
    await createDialog.getByLabel("编码").fill("E2E-UNIT");
    await createDialog.getByLabel("名称").fill("E2E 新单位");
    await createDialog.getByLabel("符号").fill("E2EU");
    await createDialog.getByRole("button", { name: "保存单位" }).click();

    await expect(page.getByText("单位已创建")).toBeVisible();
    let row = page.getByRole("row").filter({ hasText: "E2E 新单位" });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "编辑" }).click();
    const editDialog = page.getByRole("dialog", { name: "编辑单位" });
    await editDialog.getByLabel("名称").fill("E2E 编辑单位");
    await editDialog.getByLabel("符号").fill("E2UE");
    await editDialog.getByRole("button", { name: "保存单位" }).click();

    await expect(page.getByText("单位已保存")).toBeVisible();
    row = page.getByRole("row").filter({ hasText: "E2E 编辑单位" });
    await expect(row).toBeVisible();

    await submitStatus(row, page, "停用");
    await expect(page.getByText("E2E 编辑单位已停用")).toBeVisible();
    row = page.getByRole("row").filter({ hasText: "E2E 编辑单位" });
    await expect(row.getByText("停用", { exact: true })).toBeVisible();

    await submitStatus(row, page, "启用");
    await expect(page.getByText("E2E 编辑单位已启用")).toBeVisible();
    row = page.getByRole("row").filter({ hasText: "E2E 编辑单位" });
    await expect(row.getByText("启用", { exact: true })).toBeVisible();

    const mutations = await readMutations(request);
    expect(mutations).toHaveLength(4);
    expect(mutations[0]).toMatchObject({
      method: "POST",
      path: "/platform/catalog/units",
      idempotencyKey: expect.stringMatching(/^catalog-unit:/),
      payload: {
        status: "active",
        code: "E2E-UNIT",
        name: "E2E 新单位",
        symbol: "E2EU",
        unit_dimension: "quantity",
        base_unit_id: null,
        conversion_factor: "1",
        sort_order: 100,
      },
    });
    expect(mutations.slice(1).map(({ path, payload }) => ({
      path,
      payload,
    }))).toEqual([
      {
        path: "/platform/catalog/units/13000000-0000-4000-8000-000000000102",
        payload: {
          expected_version: 1,
          code: "E2E-UNIT",
          name: "E2E 编辑单位",
          symbol: "E2UE",
          unit_dimension: "quantity",
          base_unit_id: null,
          conversion_factor: "1",
          sort_order: 100,
        },
      },
      {
        path: "/platform/catalog/units/13000000-0000-4000-8000-000000000102",
        payload: { expected_version: 2, status: "inactive" },
      },
      {
        path: "/platform/catalog/units/13000000-0000-4000-8000-000000000102",
        payload: { expected_version: 3, status: "active" },
      },
    ]);
  });

  test("平台可维护规格模板并从第二页选择第 101 单位审核建议", async ({ page, request }) => {
    await page.goto("/platform/catalog", { waitUntil: "networkidle" });
    await expect.poll(() => new URL(page.url()).searchParams.has("pageSize"))
      .toBe(true);
    const categoryRow = page.getByRole("row").filter({ hasText: "基础建材" });
    await categoryRow.getByRole("button", { name: "规格模板" }).click();
    const specs = page.getByRole("dialog", { name: "基础建材规格模板" });
    await specs.getByRole("button", { name: "新建规格" }).click();
    const editor = page.getByRole("dialog", { name: "新建规格" });
    await editor.getByLabel("规格编码").fill("MATERIAL");
    await editor.getByLabel("规格名称").fill("材质");
    await editor.getByRole("button", { name: "保存规格" }).click();
    await expect(editor).toBeHidden();
    await expect(specs.getByRole("row").filter({ hasText: "材质" }))
      .toBeVisible();
    await specs.getByRole("button", { name: "Close" }).click();
    await expect(specs).toBeHidden();

    await page.getByRole("tab", { name: "单位建议" }).click();
    const suggestionRow = page.getByRole("row").filter({ hasText: "BAG" });
    await suggestionRow.getByRole("button", { name: "审核" }).click();
    const review = page.getByRole("dialog", { name: "审核单位建议" });
    await expect(review.getByText("第 1 / 2 页", { exact: true })).toBeVisible();
    await review.getByRole("button", { name: "下一页" }).click();
    await expect(review.getByText("第 2 / 2 页", { exact: true })).toBeVisible();
    await review.getByRole("combobox", { name: "选择标准单位" }).click();
    await page.getByRole("option", {
      name: "第 101 单位（U101） · UNIT-101",
    }).click();
    await review.getByRole("button", { name: "提交审核" }).click();
    await expect(suggestionRow).toContainText("已通过");
    expect((await readMutations(request)).at(-1)).toMatchObject({
      path: "/platform/catalog/unit-suggestions/32000000-0000-4000-8000-000000000001",
      payload: {
        action: "approved",
        approved_catalog_unit_id: "13000000-0000-4000-8000-000000000101",
      },
    });
  });
});

test.describe("租户私有供应商目录", () => {
  test.beforeEach(async ({ request }) => {
    await resetMock(request);
  });

  test("共享树保持只读且租户可建立二级私有分类", async ({ page, request }) => {
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
    await dialog.getByRole("button", { name: /平台标准建材.*PLATFORM-MATERIAL/ }).click();
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
            parent_id: "21000000-0000-4000-8000-000000000003",
            code: "TENANT-TILE-GLUE",
          }),
        },
      ]);
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
