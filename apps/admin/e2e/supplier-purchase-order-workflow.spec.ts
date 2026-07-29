import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3997";

type JournalEntry = {
  method: string;
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
  outcome: string;
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

async function readJournal(request: APIRequestContext) {
  const response = await request.get(`${mockBackendBaseUrl}/__test/journal`);
  expect(response.ok()).toBe(true);
  return (await response.json() as { journal: JournalEntry[] }).journal;
}

test("采购单可完成计价、价格变化恢复、提交与取消", async ({
  page,
  request,
}) => {
  await resetMock(request);
  await login(page);
  await page.goto("/supplier-purchase-orders", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "采购单", level: 1 }))
    .toBeVisible();
  await page.getByRole("button", { name: "新建采购单" }).click();

  let dialog = page.getByRole("dialog", { name: "新建采购单" });
  await dialog.getByLabel("项目").click();
  await page.getByRole("option", { name: "E2E 海棠湾项目" }).click();
  await dialog.getByLabel("合作供应商").click();
  await page.getByRole("option", { name: /E2E 建材供应商/ }).click();

  await dialog.getByLabel("搜索可采购目录").fill("抛釉");
  await dialog.getByRole("button", { name: "搜索目录" }).click();
  const tileRow = dialog.getByRole("row").filter({ hasText: "E2E 抛釉砖" });
  await tileRow.getByRole("button", { name: "添加" }).click();

  await dialog.getByLabel("搜索可采购目录").fill("美缝");
  await dialog.getByRole("button", { name: "搜索目录" }).click();
  const groutRow = dialog.getByRole("row").filter({ hasText: "E2E 美缝剂" });
  await groutRow.getByRole("button", { name: "添加" }).click();

  await dialog.getByLabel("采购数量 E2E 抛釉砖 800x800").fill("2");
  await dialog.getByLabel("采购数量 E2E 美缝剂 2kg").fill("3");
  await dialog.getByLabel("备注").fill("E2E 首次计价");
  await dialog.getByRole("button", { name: "加载更多项目" }).click();
  await expect(dialog.getByLabel("备注")).toHaveValue("E2E 首次计价");
  await expect(dialog.getByLabel("采购数量 E2E 抛釉砖 800x800"))
    .toHaveValue("2");
  await expect(dialog.getByLabel("采购数量 E2E 美缝剂 2kg"))
    .toHaveValue("3");
  await dialog.getByRole("button", { name: "保存草稿" }).click();
  await expect(dialog.getByText("¥80.00", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "关闭" }).click();

  const orderRow = page.getByRole("row").filter({ hasText: "PO-E2E-0001" });
  await expect(orderRow.getByText("草稿", { exact: true })).toBeVisible();
  await orderRow.getByRole("button", { name: "查看" }).click();

  dialog = page.getByRole("dialog", { name: "采购单详情" });
  await dialog.getByRole("button", { name: "提交采购单" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "确认提交" })
    .click();
  await expect(dialog.getByText("采购价格已变化，请重新保存草稿刷新价格"))
    .toBeVisible();
  await dialog.getByRole("button", { name: "关闭" }).click();

  await orderRow.getByRole("button", { name: "编辑" }).click();
  dialog = page.getByRole("dialog", { name: "编辑采购单草稿" });
  await expect(dialog.getByText("¥12.00", { exact: true }).first())
    .toBeVisible();
  await dialog.getByLabel("备注").fill("E2E 价格复核后重计价");
  await dialog.getByRole("button", { name: "保存草稿" }).click();
  await expect(dialog.getByText("¥84.00", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "关闭" }).click();

  await orderRow.getByRole("button", { name: "查看" }).click();
  dialog = page.getByRole("dialog", { name: "采购单详情" });
  await dialog.getByRole("button", { name: "提交采购单" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "确认提交" })
    .click();
  await expect(dialog.getByText("已提交", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "取消采购单" }).click();
  const alert = page.getByRole("alertdialog", { name: "确认取消采购单？" });
  await alert.getByLabel("取消原因").fill("项目方案调整，取消采购");
  await alert.getByRole("button", { name: "确认取消" }).click();
  await expect(dialog.getByText("已取消", { exact: true })).toBeVisible();
  await expect(dialog.getByText("PO-E2E-0001", { exact: true })).toBeVisible();

  const journal = await readJournal(request);
  expect(journal.map(({ outcome }) => outcome)).toEqual([
    "saved",
    "price_changed",
    "saved",
    "submitted",
    "cancelled",
  ]);
  expect(journal.every(({ idempotencyKey }) => Boolean(idempotencyKey)))
    .toBe(true);

  const saveEntries = journal.filter(({ path }) => path.endsWith("/save-draft"));
  expect(saveEntries).toHaveLength(2);
  for (const { payload } of saveEntries) {
    const items = payload.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items.every((item) =>
      Object.keys(item).sort().join(",") === "quantity,supplier_sku_id"
    )).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(
      /unit_price|tax_rate|subtotal_amount|total_amount|price_list/i,
    );
  }
});
