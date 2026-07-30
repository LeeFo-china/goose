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

test("采购单可完成计价、价格变化恢复、提交与完整履约", async ({
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

  await dialog.getByRole("button", { name: "记录供应商确认" }).click();
  const confirmAlert = page.getByRole("alertdialog", {
    name: "记录供应商确认？",
  });
  await confirmAlert.getByLabel("供应商确认备注").fill("供应商已确认排产");
  await confirmAlert.getByRole("button", { name: "记录供应商确认" }).click();
  await expect(dialog.getByText("已确认", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "登记发货" }).click();
  let shipmentDialog = page.getByRole("dialog", { name: "登记采购发货" });
  await shipmentDialog.getByRole("button", { name: "登记发货" }).click();
  await expect(shipmentDialog.getByLabel("发货编号")).toBeFocused();
  await shipmentDialog.getByLabel("发货编号").fill("SHP-E2E-0001");
  await shipmentDialog.getByLabel("发货时间").fill("2030-01-01T09:00");
  await shipmentDialog.getByLabel("承运方").fill("E2E 物流");
  await shipmentDialog.getByLabel("运单号").fill("TRACK-E2E-0001");
  await shipmentDialog.getByLabel("本次发货数量 1").fill("1");
  await shipmentDialog.getByLabel("本次发货数量 2").fill("1");
  await shipmentDialog.getByRole("button", { name: "登记发货" }).click();
  await expect(shipmentDialog).toBeHidden();
  await expect(dialog.getByText("部分发货", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "登记收货" }).click();
  let receiptDialog = page.getByRole("dialog", { name: "登记采购收货" });
  await receiptDialog.getByLabel("收货编号").fill("REC-E2E-0001");
  await receiptDialog.getByLabel("收货时间").fill("2030-01-01T10:00");
  await receiptDialog.getByLabel("接受数量 1").fill("1");
  await receiptDialog.getByLabel("拒收数量 1").fill("0");
  await receiptDialog.getByLabel("接受数量 2").fill("1");
  await receiptDialog.getByLabel("拒收数量 2").fill("0");
  await receiptDialog.getByRole("button", { name: "登记收货" }).click();
  await expect(receiptDialog).toBeHidden();
  await expect(dialog.getByText("部分收货", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "登记发货" }).click();
  shipmentDialog = page.getByRole("dialog", { name: "登记采购发货" });
  await shipmentDialog.getByLabel("发货编号").fill("SHP-E2E-0002");
  await shipmentDialog.getByLabel("发货时间").fill("2030-01-01T11:00");
  await shipmentDialog.getByLabel("本次发货数量 1").fill("1");
  await shipmentDialog.getByLabel("本次发货数量 2").fill("2");
  await shipmentDialog.getByRole("button", { name: "登记发货" }).click();
  await expect(shipmentDialog).toBeHidden();

  await dialog.getByRole("button", { name: "登记收货" }).click();
  receiptDialog = page.getByRole("dialog", { name: "登记采购收货" });
  await receiptDialog.getByLabel("收货编号").fill("REC-E2E-0002");
  await receiptDialog.getByLabel("收货时间").fill("2030-01-01T12:00");
  await receiptDialog.getByLabel("接受数量 1").fill("1");
  await receiptDialog.getByLabel("拒收数量 1").fill("0");
  await receiptDialog.getByLabel("接受数量 2").fill("1");
  await receiptDialog.getByLabel("拒收数量 2").fill("1");
  await receiptDialog.getByRole("button", { name: "登记收货" }).click();
  await expect(receiptDialog.getByText("存在拒收数量时必须填写差异原因"))
    .toBeVisible();
  await receiptDialog.getByLabel("差异原因 2").fill("包装破损拒收");
  await receiptDialog.getByRole("button", { name: "登记收货" }).click();
  await expect(receiptDialog).toBeHidden();

  const fulfillment = dialog.getByRole("region", { name: "采购履约" });
  await expect(fulfillment.getByText("有差异已收货", { exact: true }))
    .toBeVisible();
  const summaryTable = fulfillment.getByRole("table").first();
  const tileSummaryRow = summaryTable.getByRole("row").filter({
    hasText: "E2E 抛釉砖",
  });
  const groutSummaryRow = summaryTable.getByRole("row").filter({
    hasText: "E2E 美缝剂",
  });
  await expect(tileSummaryRow.getByRole("cell").nth(6)).toHaveText("¥24.00");
  await expect(groutSummaryRow.getByRole("cell").nth(5)).toHaveText("1");
  await expect(groutSummaryRow.getByRole("cell").nth(6)).toHaveText("¥40.00");

  const timelineRows = fulfillment.getByRole("table").filter({
    hasText: "业务时间",
  }).getByRole("row");
  await expect(timelineRows.nth(1)).toContainText("REC-E2E-0002");
  await expect(timelineRows.nth(2)).toContainText("SHP-E2E-0002");
  await expect(timelineRows.nth(3)).toContainText("REC-E2E-0001");
  await expect(timelineRows.nth(4)).toContainText("SHP-E2E-0001");
  await expect(timelineRows.nth(5)).toContainText("供应商已确认");

  const journal = await readJournal(request);
  expect(journal.map(({ outcome }) => outcome)).toEqual([
    "saved",
    "price_changed",
    "saved",
    "submitted",
    "confirmed",
    "shipment_created",
    "receipt_created",
    "shipment_created",
    "receipt_created",
  ]);
  expect(journal.every(({ idempotencyKey }) =>
    typeof idempotencyKey === "string" &&
    idempotencyKey.trim().length > 0 &&
    idempotencyKey.length <= 120
  )).toBe(true);

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

  const fulfillmentEntries = journal.filter(({ path }) =>
    /\/(confirm-fulfillment|shipments|receipts)$/.test(path)
  );
  expect(fulfillmentEntries).toHaveLength(5);
  for (const { payload } of fulfillmentEntries) {
    expect(JSON.stringify(payload)).not.toMatch(
      /unit_price|tax_rate|accepted_amount|subtotal_amount|tax_amount|total_amount/i,
    );
  }
  const shipmentEntries = fulfillmentEntries.filter(({ path }) =>
    path.endsWith("/shipments")
  );
  const receiptEntries = fulfillmentEntries.filter(({ path }) =>
    path.endsWith("/receipts")
  );
  expect(shipmentEntries).toHaveLength(2);
  expect(receiptEntries).toHaveLength(2);
  for (const { payload } of shipmentEntries) {
    expect(Object.keys(payload).sort()).toEqual([
      "carrier_name",
      "expected_fulfillment_version",
      "id",
      "items",
      "remark",
      "shipment_no",
      "shipped_at",
      "tracking_no",
    ]);
    expect((payload.items as Record<string, unknown>[]).every((item) =>
      Object.keys(item).sort().join(",") ===
        "purchase_order_item_id,quantity"
    )).toBe(true);
  }
  for (const { payload } of receiptEntries) {
    expect(Object.keys(payload).sort()).toEqual([
      "expected_fulfillment_version",
      "id",
      "items",
      "receipt_no",
      "received_at",
      "remark",
    ]);
    expect((payload.items as Record<string, unknown>[]).every((item) =>
      Object.keys(item).sort().join(",") ===
        "accepted_quantity,purchase_order_item_id,rejected_quantity,variance_reason"
    )).toBe(true);
  }

  const finalReceipt = receiptEntries.at(-1);
  if (!finalReceipt?.idempotencyKey) {
    throw new TypeError("最终收货 journal 缺少幂等键");
  }
  const replay = await request.post(
    `${mockBackendBaseUrl}${finalReceipt.path}`,
    {
      headers: { "Idempotency-Key": finalReceipt.idempotencyKey },
      data: finalReceipt.payload,
    },
  );
  expect(replay.ok()).toBe(true);
  expect((await replay.json() as { data: { idempotent: boolean } }).data
    .idempotent).toBe(true);
  const conflict = await request.post(
    `${mockBackendBaseUrl}${finalReceipt.path}`,
    {
      headers: { "Idempotency-Key": finalReceipt.idempotencyKey },
      data: { ...finalReceipt.payload, receipt_no: "REC-E2E-CONFLICT" },
    },
  );
  expect(conflict.status()).toBe(409);
  expect((await conflict.json() as { code: string }).code)
    .toBe("IDEMPOTENCY_KEY_REUSED");
  const invalidPage = await request.get(
    `${mockBackendBaseUrl}${finalReceipt.path}?page=1&pageSize=101`,
  );
  expect(invalidPage.status()).toBe(400);

  const cancelAfterShipment = await request.post(
    `${mockBackendBaseUrl}${finalReceipt.path.replace(/\/receipts$/, "/cancel")}`,
    {
      headers: { "Idempotency-Key": "e2e-cancel-after-shipment" },
      data: {
        expected_version: 3,
        reason: "已有发货后禁止取消",
      },
    },
  );
  expect(cancelAfterShipment.status()).toBe(409);
  expect((await cancelAfterShipment.json() as { code: string }).code)
    .toBe("SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED");

  await dialog.getByRole("button", { name: "关闭" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await orderRow.getByRole("button", { name: "查看" }).click();
  dialog = page.getByRole("dialog", { name: "采购单详情" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("有差异已收货", { exact: true })).toBeVisible();
  const closeButton = dialog.getByRole("button", { name: "关闭" });
  const detailFooter = closeButton.locator("..");
  await detailFooter.scrollIntoViewIfNeeded();
  await expect(closeButton).toBeInViewport();
  await expect(detailFooter).toBeInViewport();
  const closeButtonBox = await closeButton.boundingBox();
  const viewport = page.viewportSize();
  expect(closeButtonBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!closeButtonBox || !viewport) {
    throw new TypeError("无法读取窄屏详情关闭操作或 viewport 边界");
  }
  expect(closeButtonBox.x).toBeGreaterThanOrEqual(0);
  expect(closeButtonBox.y).toBeGreaterThanOrEqual(0);
  expect(closeButtonBox.x + closeButtonBox.width)
    .toBeLessThanOrEqual(viewport.width);
  expect(closeButtonBox.y + closeButtonBox.height)
    .toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth
  )).toBe(true);
});
