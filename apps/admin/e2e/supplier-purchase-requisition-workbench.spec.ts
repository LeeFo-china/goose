import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

const backend = "http://127.0.0.1:3994";

async function openRequisitionEditor(
  page: Page,
  request: APIRequestContext,
  purpose: "项目备料" | "现场补料" | string = "项目备料",
) {
  expect((await request.post(`${backend}/__test/reset`)).ok()).toBe(true);
  expect((await page.request.post("/api/auth/login", {
    data: { phone: "18637605353", code: "" },
  })).ok()).toBe(true);
  await page.goto("/supplier-purchase-requisitions", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "发起采购申请" }).click();
  const editor = page.getByRole("dialog", { name: "发起采购申请" });
  await editor.getByLabel("项目").click();
  await page.getByRole("option", { name: "E2E 海棠湾项目" }).click();
  await editor.getByLabel("合作供应商").click();
  await page.getByRole("option", { name: /E2E 建材供应商/ }).click();
  await choosePurpose(editor, purpose);
  return editor;
}

async function choosePurpose(
  editor: Locator,
  purpose: "项目备料" | "现场补料" | string,
) {
  if (purpose === "项目备料" || purpose === "现场补料") {
    await editor.getByRole("button", { name: purpose, exact: true }).click();
    return;
  }
  await editor.getByRole("button", { name: "其他", exact: true }).click();
  await editor.getByRole("textbox", { name: "采购用途" }).fill(purpose);
}

async function addCatalogItem(editor: Locator) {
  await editor.getByRole("row").filter({ hasText: "E2E 临采瓷砖" })
    .getByRole("button", { name: "加入E2E 临采瓷砖" }).click();
}

test("桌面申请工作台左右并排，加入商品即显示数量和成本类目", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1200, height: 768 });
  const editor = await openRequisitionEditor(page, request);
  const catalog = editor.getByRole("region", { name: "可采购商品" });
  const selection = editor.getByRole("region", { name: "已选商品" });
  const catalogBox = await catalog.boundingBox();
  const selectionBox = await selection.boundingBox();
  expect(catalogBox).not.toBeNull();
  expect(selectionBox).not.toBeNull();
  expect(catalogBox!.x + catalogBox!.width).toBeLessThanOrEqual(
    selectionBox!.x + 1,
  );
  expect(Math.abs(catalogBox!.y - selectionBox!.y)).toBeLessThanOrEqual(1);

  await addCatalogItem(editor);
  const selectedHeading = editor.getByRole("heading", {
    name: "E2E 临采瓷砖 · E2E 临采瓷砖 800x800",
    exact: true,
  });
  await expect(selectedHeading).toBeVisible();
  await expect(editor.getByLabel(/E2E 临采瓷砖.*采购数量/)).toHaveValue("1");
  await expect(selection.getByText("尚未选择成本类目", { exact: true }))
    .toBeVisible();
  await expect(editor.getByLabel(/E2E 临采瓷砖.*的成本类目/))
    .toContainText("选择成本类目");
});

test("保存 payload 使用 reason 和最小商品字段，不发送价格或 purpose", async ({
  page,
  request,
}) => {
  const editor = await openRequisitionEditor(page, request, "项目备料");
  await addCatalogItem(editor);
  await editor.getByLabel(/E2E 临采瓷砖.*的成本类目/).click();
  await page.getByRole("option", { name: /主材/ }).click();
  await editor.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "编辑采购申请草稿" }))
    .toBeVisible();
  const response = await request.get(`${backend}/__test/mutations`);
  expect(response.ok()).toBe(true);
  const body = await response.json() as {
    mutations: Array<{ payload: Record<string, unknown> }>;
  };
  expect(body.mutations).toHaveLength(1);
  const payload = body.mutations[0].payload;
  expect(payload.reason).toBe("项目备料");
  expect(payload).not.toHaveProperty("purpose");
  const items = payload.items as Array<Record<string, unknown>>;
  expect(items).toHaveLength(1);
  expect(Object.keys(items[0]).sort()).toEqual([
    "cost_category_id",
    "quantity",
    "supplier_sku_id",
  ]);
  expect(items[0]).not.toHaveProperty("price");
  expect(items[0]).not.toHaveProperty("unit_price");
});

test("375×812 可真实加入商品，自定义用途与保存入口可用且页面不横溢", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const editor = await openRequisitionEditor(
    page,
    request,
    "展厅样板补充",
  );
  await addCatalogItem(editor);
  await expect(editor.getByRole("heading", {
    name: "E2E 临采瓷砖 · E2E 临采瓷砖 800x800",
    exact: true,
  })).toBeVisible();
  const save = editor.getByRole("button", { name: "保存草稿", exact: true });
  await expect(save).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  expect(
    await editor.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});
