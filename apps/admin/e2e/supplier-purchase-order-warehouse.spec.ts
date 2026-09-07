import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { ids } from "./supplier-purchase-order-mock-fixture.mjs";

// Browser UI contract: real console/session/components, isolated HTTP fixture only.
const backend = "http://127.0.0.1:3997";

async function openOrder(
  page: Page,
  request: APIRequestContext,
  role = "warehouse-manager",
  scenario = "warehouse",
) {
  expect(
    (await request.post(`${backend}/__test/reset?scenario=${scenario}`)).ok(),
  ).toBe(true);
  expect(
    (await page.request.post("/api/auth/login", {
      data: { phone: role, code: "" },
    })).ok(),
  ).toBe(true);
  await page.clock.setFixedTime("2029-12-31T00:00:00.000Z");
  await page.goto(
    `/supplier-purchase-orders?purchase_order_id=${ids.legacyOrder}`,
  );
  return page.getByRole("dialog", { name: "采购单详情" });
}

async function confirmAndShip(page: Page) {
  const detail = page.getByRole("dialog", { name: "采购单详情" });
  await detail.getByRole("button", { name: "记录供应商确认" }).click();
  await page.getByRole("alertdialog").getByRole("button", {
    name: "记录供应商确认",
  }).click();
  await expect(detail.getByText("已确认", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "登记发货" }).click();
  const shipment = page.getByRole("dialog", { name: "登记采购发货" });
  await shipment.getByLabel("发货编号").fill("SHP-WH-01");
  await shipment.getByLabel("发货时间").fill("2030-01-01T09:00");
  await shipment.getByLabel("本次发货数量 1").fill("1");
  await shipment.getByLabel("本次发货数量 2").fill("0.3");
  await shipment.getByRole("button", { name: "登记发货" }).click();
  await expect(detail.getByText("部分发货", { exact: true })).toBeVisible();
}

async function fillReceipt(page: Page) {
  await page.getByRole("dialog", { name: "采购单详情" }).getByRole("button", {
    name: "登记收货",
  }).click();
  const receipt = page.getByRole("dialog", { name: "登记采购收货" });
  await receipt.getByLabel("收货编号").fill("REC-WH-01");
  await receipt.getByLabel("收货时间").fill("2030-01-01T10:00");
  await receipt.getByLabel("接受数量 1").fill("1");
  await receipt.getByLabel("拒收数量 1").fill("0");
  await receipt.getByLabel("接受数量 2").fill("0.3");
  await receipt.getByLabel("拒收数量 2").fill("0");
  await receipt.getByRole("button", { name: "登记收货" }).click();
  return receipt;
}

test("仓库来源深链保留真实归属并完成确认、发货和收货", async ({ page, request }) => {
  const detail = await openOrder(page, request);
  await expect(detail.getByText("仓库 · 备货仓01")).toBeVisible();
  await expect(
    detail.getByText(
      "仓库补货由审批后的采购申请生成，不计入项目预算或项目成本。",
    ),
  ).toBeVisible();
  await expect(detail.getByRole("button", { name: "编辑草稿" })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "提交采购单" })).toHaveCount(
    0,
  );
  await confirmAndShip(page);
  await fillReceipt(page);
  await expect(detail.getByText("部分收货", { exact: true })).toBeVisible();
  const { journal } = await (await request.get(`${backend}/__test/journal`))
    .json();
  expect(journal.map((row: { path: string }) => row.path.split("/").at(-1)))
    .toEqual(["confirm-fulfillment", "shipments", "receipts"]);
  for (const command of journal) {
    expect(command.idempotencyKey).toBeTruthy();
    const versionField = command.path.endsWith("/confirm-fulfillment")
      ? "expected_version"
      : "expected_fulfillment_version";
    expect(command.payload[versionField]).toEqual(expect.any(Number));
    expect(command.payload).not.toHaveProperty("project_id");
    expect(command.payload).not.toHaveProperty("unit_price");
  }
});

for (
  const role of [
    "warehouse-reader",
    "warehouse-order-manager",
    "warehouse-only-manager",
  ]
) {
  test(`${role}可读取仓库详情但不能越权管理`, async ({ page, request }) => {
    const detail = await openOrder(page, request, role);
    await expect(detail.getByText("仓库 · 备货仓01")).toBeVisible();
    await expect(detail.getByRole("region", { name: "采购履约" }))
      .toBeVisible();
    await expect(
      detail.getByRole("button", {
        name: /记录供应商确认|登记发货|登记收货|取消采购单/,
      }),
    ).toHaveCount(0);
    const reads: string[] =
      await (await request.get(`${backend}/__test/read-requests`)).json();
    expect(reads.some((path) => path.endsWith("/financial-summary"))).toBe(
      true,
    );
    expect(reads.some((path) => path.startsWith("/warehouses"))).toBe(false);
  });
}

test("没有仓库读取权限不显示仓库订单或仓库筛选选项", async ({ page, request }) => {
  await openOrder(page, request, "warehouse-no-read");
  await expect(page.getByText("无仓库采购单操作权限")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "采购单详情" })).toHaveCount(0);
  await page.getByLabel("采购去向", { exact: true }).click();
  await expect(page.getByRole("option", { name: "仓库补货" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const reads: string[] =
    await (await request.get(`${backend}/__test/read-requests`)).json();
  expect(reads.some((path) => path.startsWith("/warehouses"))).toBe(false);
});

test("目的地切换清理冲突筛选，仓库选项可翻页搜索停用仓库", async ({ page, request }) => {
  const detail = await openOrder(page, request, "warehouse-reader");
  await expect(detail.getByText("仓库 · 备货仓01")).toBeVisible();
  await detail.getByRole("button", { name: "关闭" }).click();
  await page.getByLabel("项目", { exact: true }).click();
  await page.getByRole("option", { name: "E2E 海棠湾项目", exact: true })
    .click();
  await page.getByLabel("采购去向", { exact: true }).click();
  await page.getByRole("option", { name: "仓库补货", exact: true }).click();
  await expect(page.getByText("第 1 / 2 页仓库选项")).toBeVisible();
  await page.getByRole("button", { name: "下一页仓库选项" }).click();
  await expect(page.getByText("第 2 / 2 页仓库选项")).toBeVisible();
  await page.getByLabel("仓库", { exact: true }).click();
  await page.getByRole("option", { name: "备货仓25（已停用）", exact: true })
    .click();
  await page.getByLabel("搜索仓库选项").fill("备货仓25");
  await expect(page.getByText("第 1 / 1 页仓库选项")).toBeVisible();
  await page.getByLabel("采购去向", { exact: true }).click();
  await page.getByRole("option", { name: "项目采购", exact: true }).click();
  await expect(page.getByLabel("项目", { exact: true })).toHaveText("全部项目");
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.getByRole("row").filter({ hasText: "PO-WAREHOUSE-0001" }))
    .toBeVisible();
  const reads: string[] =
    await (await request.get(`${backend}/__test/read-requests`)).json();
  const orderQueries = reads.filter((path) =>
    path.startsWith("/supplier-purchase-orders?")
  ).map((path) => new URL(path, backend).searchParams);
  expect(
    orderQueries.some((query) => query.get("destinationType") === "warehouse"),
  ).toBe(true);
  expect(
    orderQueries.filter((query) => query.get("destinationType") === "warehouse")
      .every((query) => !query.has("projectId")),
  ).toBe(true);
  expect(
    orderQueries.filter((query) => query.get("destinationType") === "project")
      .every((query) => !query.has("warehouseId")),
  ).toBe(true);
  expect(
    reads.some((path) =>
      path.startsWith("/warehouses?") && path.includes("page=2")
    ),
  ).toBe(true);
  expect(
    reads.filter((path) => path.startsWith("/warehouses?")).every((path) =>
      !new URL(path, backend).searchParams.has("status")
    ),
  ).toBe(true);
});

test("详情明细超过100条时可继续加载而不截断", async ({ page, request }) => {
  const detail = await openOrder(
    page,
    request,
    "warehouse-reader",
    "warehouse-paged",
  );
  await expect(detail.getByText("已显示 100 条，共 101 条")).toBeVisible();
  await expect(detail.getByText("分页商品101", { exact: true })).toHaveCount(0);
  await detail.getByRole("button", { name: "加载更多明细" }).click();
  await expect(detail.getByText("分页商品101", { exact: true })).toBeVisible();
  await expect(detail.getByText("已显示 101 条，共 101 条")).toBeVisible();
  await expect(detail.getByRole("button", { name: "加载更多明细" }))
    .toHaveCount(0);
});

test("停用仓库和关闭补货仍可查旧单，新收货错误原样可见", async ({ page, request }) => {
  const detail = await openOrder(
    page,
    request,
    "warehouse-manager",
    "warehouse-gate-off",
  );
  await expect(detail.getByText("仓库 · 备货仓25")).toBeVisible();
  await confirmAndShip(page);
  const receipt = await fillReceipt(page);
  await expect(receipt.getByText("仓库采购尚未开放")).toBeVisible();
  await expect(receipt.getByLabel("收货编号")).toHaveValue("REC-WH-01");
});

test("旧项目来源深链继续打开项目详情", async ({ page, request }) => {
  const detail = await openOrder(page, request, "18637605353", "legacy-draft");
  await expect(detail.getByText("项目 · E2E 海棠湾项目")).toBeVisible();
  await expect(detail.getByRole("button", { name: "提交采购单" }))
    .toBeVisible();
});

test("未加载的分页商品不能按记录ID发货收货，加载名称后恢复", async ({ page, request }) => {
  const detail = await openOrder(
    page,
    request,
    "warehouse-manager",
    "warehouse-paged",
  );
  await detail.getByRole("button", { name: "记录供应商确认" }).click();
  await page.getByRole("alertdialog").getByRole("button", {
    name: "记录供应商确认",
  }).click();
  await expect(detail.getByText("已确认", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "登记发货" }).click();
  let shipment = page.getByRole("dialog", { name: "登记采购发货" });
  await expect(shipment.getByLabel("本次发货数量 101", { exact: true }))
    .toBeDisabled();
  await expect(shipment.getByText("请先加载采购明细查看商品名称"))
    .toBeVisible();
  await shipment.getByRole("button", { name: "取消", exact: true }).click();
  await detail.getByRole("button", { name: "加载更多明细" }).click();
  await expect(detail.getByText("已显示 101 条，共 101 条")).toBeVisible();
  await detail.getByRole("button", { name: "登记发货" }).click();
  shipment = page.getByRole("dialog", { name: "登记采购发货" });
  await expect(shipment.getByLabel("本次发货数量 101", { exact: true }))
    .toBeEnabled();
  await shipment.getByLabel("发货编号").fill("SHP-WH-101");
  await shipment.getByLabel("发货时间").fill("2030-01-01T09:00");
  await shipment.getByLabel("本次发货数量 101", { exact: true }).fill("0.1");
  await shipment.getByRole("button", { name: "登记发货", exact: true }).click();
  await expect(detail.getByText("部分发货", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "登记收货" }).click();
  let receipt = page.getByRole("dialog", { name: "登记采购收货" });
  for (const label of ["接受数量 1", "拒收数量 1", "差异原因 1"]) {
    await expect(receipt.getByLabel(label, { exact: true })).toBeDisabled();
  }
  await expect(receipt.getByText("请先加载采购明细查看商品名称")).toBeVisible();
  await receipt.getByRole("button", { name: "取消", exact: true }).click();
  await detail.getByRole("button", { name: "加载更多明细" }).click();
  await expect(detail.getByText("已显示 101 条，共 101 条")).toBeVisible();
  await detail.getByRole("button", { name: "登记收货" }).click();
  receipt = page.getByRole("dialog", { name: "登记采购收货" });
  await expect(receipt.getByText("分页商品101")).toBeVisible();
  for (const label of ["接受数量 1", "拒收数量 1", "差异原因 1"]) {
    await expect(receipt.getByLabel(label, { exact: true })).toBeEnabled();
  }
});

test("快速切换采购去向时旧项目响应不能覆盖仓库列表", async ({ page, request }) => {
  const detail = await openOrder(
    page,
    request,
    "warehouse-reader",
    "warehouse-race",
  );
  await expect(detail.getByText("仓库 · 备货仓01")).toBeVisible();
  await detail.getByRole("button", { name: "关闭" }).click();
  const oldRequest = page.waitForRequest((request) =>
    request.url().includes("destinationType=project")
  );
  const oldResponse = page.waitForResponse((response) =>
    response.url().includes("destinationType=project")
  );
  await page.getByLabel("采购去向", { exact: true }).click();
  await page.getByRole("option", { name: "项目采购", exact: true }).click();
  await oldRequest;
  await page.getByLabel("采购去向", { exact: true }).click();
  await page.getByRole("option", { name: "仓库补货", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "PO-WAREHOUSE-0001" });
  await expect(row).toBeVisible();
  await (await oldResponse).finished();
  await expect(row).toBeVisible();
});

test("整单刷新和明细追加不能交错跳过第二页", async ({ page, request }) => {
  const detail = await openOrder(
    page,
    request,
    "warehouse-manager",
    "warehouse-refresh-race",
  );
  await expect(detail.getByText("已显示 100 条，共 201 条")).toBeVisible();
  await detail.getByRole("button", { name: "加载更多明细" }).click();
  await expect(detail.getByText("已显示 200 条，共 201 条")).toBeVisible();
  await detail.getByRole("button", { name: "记录供应商确认" }).click();
  const isFirstPage = (url: string) =>
    url.includes("/items?") && new URL(url).searchParams.get("page") === "1";
  const refreshStarted = page.waitForRequest((request) =>
    isFirstPage(request.url())
  );
  const refreshFinished = page.waitForResponse((response) =>
    isFirstPage(response.url())
  );
  await page.getByRole("alertdialog").getByRole("button", {
    name: "记录供应商确认",
  }).click();
  await refreshStarted;
  // A disabled button suppresses the click. Previously this started stale page 3.
  await detail.getByRole("button", { name: /加载更多明细|正在加载明细/ })
    .dispatchEvent("click");
  await (await refreshFinished).finished();
  await expect.poll(
    async () => (await (await request.get(
      `${backend}/__test/pending-item-reads`,
    )).json()),
  ).toBe(0);
  await expect(detail.getByText("已显示 100 条，共 201 条")).toBeVisible();
  const reads: string[] =
    await (await request.get(`${backend}/__test/read-requests`)).json();
  expect(
    reads.some((url) =>
      url.includes("/items?") &&
      new URL(url, backend).searchParams.get("page") === "3"
    ),
  ).toBe(false);
  await detail.getByRole("button", { name: "加载更多明细" }).click();
  await expect(detail.getByText("已显示 200 条，共 201 条")).toBeVisible();
  await detail.getByRole("button", { name: "加载更多明细" }).click();
  await expect(detail.getByText("已显示 201 条，共 201 条")).toBeVisible();
  await expect(detail.getByText("分页商品101", { exact: true }).first())
    .toBeVisible();
});

test(
  "375px仓库详情关闭操作可达，只有内部表格允许横滚",
  async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const detail = await openOrder(page, request, "warehouse-reader");
    await expect(detail.getByText("仓库 · 备货仓01")).toBeVisible();
    const close = detail.getByRole("button", { name: "关闭" });
    await close.scrollIntoViewIfNeeded();
    const bounds = await close.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(375);
    await page.screenshot({
      path: testInfo.outputPath("warehouse-detail-mobile.png"),
      fullPage: true,
    });
    await close.focus();
    await page.keyboard.press("Enter");
    await expect(detail).toHaveCount(0);
  },
);
