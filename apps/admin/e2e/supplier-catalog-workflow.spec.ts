import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3997";
const platformAdminPhone = "18637605353";

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
      idempotencyKey: entry.idempotencyKey,
      payload: entry.payload,
    }))).toEqual([
      {
        method: "POST",
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
        idempotencyKey: null,
        payload: {
          expected_version: 2,
          status: "inactive",
        },
      },
      {
        method: "PATCH",
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
    await statusDialog.getByRole("button", {
      name: "重试本次操作",
    }).click();
    await expect.poll(async () => (await readMutations(request)).length)
      .toBe(4);
    await expect(page.getByText("E2E 编辑品牌已停用")).toBeVisible();

    row = page.getByRole("row").filter({ hasText: "E2E 编辑品牌" });
    await expect(row.getByText("停用", { exact: true })).toBeVisible();
    await submitStatus(row, page, "启用");
    await expect(page.getByText("E2E 编辑品牌已启用")).toBeVisible();

    const mutations = await readMutations(request);
    expect(mutations).toHaveLength(5);
    expect(mutations[0]).toMatchObject({
      method: "POST",
      idempotencyKey: expect.stringMatching(/^catalog-brand:/),
      payload: {
        status: "active",
        code: "E2E-BRAND",
        name: "E2E 新品牌",
        legal_name: "E2E 品牌有限公司",
        sort_order: 100,
      },
    });
    expect(mutations.slice(1).map(({ payload }) => payload)).toEqual([
      {
        expected_version: 1,
        code: "E2E-BRAND",
        name: "E2E 编辑品牌",
        legal_name: "E2E 编辑品牌有限公司",
        sort_order: 100,
      },
      { expected_version: 2, status: "inactive" },
      { expected_version: 3, status: "inactive" },
      { expected_version: 4, status: "active" },
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
      idempotencyKey: expect.stringMatching(/^catalog-unit:/),
      payload: {
        status: "active",
        code: "E2E-UNIT",
        name: "E2E 新单位",
        symbol: "E2EU",
        base_unit_id: null,
        conversion_factor: "1",
        sort_order: 100,
      },
    });
    expect(mutations.slice(1).map(({ payload }) => payload)).toEqual([
      {
        expected_version: 1,
        code: "E2E-UNIT",
        name: "E2E 编辑单位",
        symbol: "E2UE",
        base_unit_id: null,
        conversion_factor: "1",
        sort_order: 100,
      },
      { expected_version: 2, status: "inactive" },
      { expected_version: 3, status: "active" },
    ]);
  });
});
