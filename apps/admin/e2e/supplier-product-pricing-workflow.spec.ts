import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3996";

type Mutation = {
  method: string;
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
};

async function resetMock(request: APIRequestContext) {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`);
  expect(response.ok()).toBe(true);
}

async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: "18637605353", code: "" },
  });
  expect(response.ok()).toBe(true);
}

async function readMutations(request: APIRequestContext) {
  const response = await request.get(`${mockBackendBaseUrl}/__test/mutations`);
  expect(response.ok()).toBe(true);
  return (await response.json() as { mutations: Mutation[] }).mutations;
}

test("SPU、SKU 和默认基础供货价可完整发布", async ({ page, request }) => {
  await resetMock(request);
  await login(page);
  await page.goto("/supplier-products", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("heading", { name: "商品与价格", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "新增商品" }).click();
  let dialog = page.getByRole("dialog", { name: "新增供应商商品" });
  await dialog.getByLabel("商品编码").fill("E2E-PRODUCT");
  await dialog.getByLabel("商品名称").fill("E2E 瓷砖");
  await dialog.getByLabel("标准分类").click();
  await page.getByRole("option", { name: /瓷砖分类/ }).click();
  await dialog.getByLabel("品牌").click();
  await page.getByRole("option", { name: /E2E 品牌/ }).click();
  await dialog.getByLabel("代录原因").fill("供应商书面资料代录");
  await dialog.getByRole("button", { name: "保存商品" }).click();
  await expect(page.getByText("E2E 瓷砖", { exact: true })).toBeVisible();

  const productRow = page.getByRole("row").filter({ hasText: "E2E 瓷砖" });
  await productRow.getByRole("button", { name: "查看 SKU" }).click();
  await page.getByRole("button", { name: "新增 SKU" }).click();
  dialog = page.getByRole("dialog", { name: "新增供应商 SKU" });
  await dialog.getByLabel("SKU 编码").fill("E2E-SKU");
  await dialog.getByLabel("SKU 名称").fill("E2E 瓷砖 800x800");
  await dialog.getByLabel("采购单位").click();
  await page.getByRole("option", { name: /平方米/ }).click();
  await dialog.getByLabel("代录原因").fill("供应商 SKU 清单代录");
  await dialog.getByRole("button", { name: "保存 SKU" }).click();
  await expect(page.getByText("E2E 瓷砖 800x800", { exact: true })).toBeVisible();

  const skuRow = page.getByRole("row").filter({ hasText: "E2E-SKU" });
  await skuRow.getByRole("button", { name: "启用 SKU" }).click();
  dialog = page.getByRole("dialog", { name: /启用 E2E 瓷砖 800x800/ });
  await dialog.getByLabel("代录原因").fill("供应商确认 SKU 启用");
  await dialog.getByRole("button", { name: "确认启用" }).click();

  await productRow.getByRole("button", { name: "启用商品" }).click();
  dialog = page.getByRole("dialog", { name: /启用 E2E 瓷砖/ });
  await dialog.getByLabel("代录原因").fill("供应商确认商品启用");
  await dialog.getByRole("button", { name: "确认启用" }).click();

  await page.getByRole("tab", { name: "基础供货价" }).click();
  await page.getByRole("button", { name: "新建价格草稿" }).click();
  dialog = page.getByRole("dialog", { name: "新建默认基础供货价" });
  await dialog.getByLabel("价格簿编码").fill("E2E-BASE");
  await dialog.getByLabel("价格簿名称").fill("E2E 默认基础价");
  await dialog.getByLabel("生效时间").fill("2026-08-01T00:00");
  await dialog.getByLabel("代录原因").fill("供应商书面报价代录");
  await dialog.getByRole("button", { name: "保存价格草稿" }).click();
  await expect(page.getByText("E2E 默认基础价", { exact: true })).toBeVisible();

  const priceRow = page.getByRole("row").filter({ hasText: "E2E 默认基础价" });
  await priceRow.getByRole("button", { name: "查看条目" }).click();
  await page.getByRole("button", { name: "添加价格条目" }).click();
  dialog = page.getByRole("dialog", { name: "添加基础供货价条目" });
  await dialog.getByLabel("SKU").click();
  await page.getByRole("option", { name: /E2E 瓷砖 800x800/ }).click();
  await dialog.getByLabel("基础单价").fill("88.00");
  await dialog.getByLabel("税率（0–1）").fill("0.13");
  await dialog.getByLabel("代录原因").fill("供应商书面报价代录");
  await dialog.getByRole("button", { name: "保存价格条目" }).click();
  await expect(page.getByText("CNY 88.00", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "发布价格" }).click();
  dialog = page.getByRole("dialog", { name: "发布基础供货价" });
  await expect(dialog.getByText(/发布后不可修改/)).toBeVisible();
  await dialog.getByLabel("代录原因").fill("供应商书面报价代录");
  await dialog.getByRole("button", { name: "确认发布" }).click();
  await expect(priceRow.getByText("已发布", { exact: true })).toBeVisible();

  const mutations = await readMutations(request);
  expect(mutations).toHaveLength(7);
  expect(mutations.map(({ method, path }) => ({ method, path }))).toEqual([
    { method: "POST", path: expect.stringMatching(/^\/supplier-products\/[^/]+$/) },
    { method: "POST", path: expect.stringMatching(/^\/supplier-products\/[^/]+\/skus\/[^/]+$/) },
    { method: "POST", path: expect.stringMatching(/^\/supplier-products\/ignored\/skus\/[^/]+\/activate$/) },
    { method: "POST", path: expect.stringMatching(/^\/supplier-products\/[^/]+\/activate$/) },
    { method: "POST", path: expect.stringMatching(/^\/supplier-price-lists\/[^/]+$/) },
    { method: "PUT", path: expect.stringMatching(/^\/supplier-price-lists\/[^/]+\/items\/[^/]+$/) },
    { method: "POST", path: expect.stringMatching(/^\/supplier-price-lists\/[^/]+\/publish$/) },
  ]);
  expect(mutations[6]).toMatchObject({
    idempotencyKey: expect.stringMatching(/^supplier-price-publish:/),
    payload: {
      expected_version: 2,
      proxy_reason: "供应商书面报价代录",
    },
  });
});
