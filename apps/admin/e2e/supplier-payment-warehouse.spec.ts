import { expect, test } from "@playwright/test";
import { financialWarehouseId, financialWarehouses } from "./supplier-payment-warehouse-fixture.mjs";
import { approveWarehouseRequest, createWarehouseDraft, loginPaymentRole, openWarehousePayment, paymentBackend,
  paymentRequestRow, paymentState, requestAction, submitWarehouseDraft } from "./supplier-payment-test-helpers";

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${paymentBackend}/__test/reset`, { data: { warehouse: true } })).ok()).toBe(true);
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "wait" }); });

test("停用仓库且补货关闭仍完成同仓多应付申请、独立审批、分次付款及尾款关闭", async ({ page, request }) => {
  await createWarehouseDraft(page, request);
  await expect(paymentRequestRow(page)).toContainText("北区历史仓库");
  await submitWarehouseDraft(page);
  await approveWarehouseRequest(page, request);
  const dialog = await openWarehousePayment(page, request);
  await dialog.getByLabel("本次付款金额").fill("60.00");
  await dialog.getByLabel("本次付款分配 1").fill("40.00");
  await dialog.getByLabel("本次付款分配 2").fill("20.00");
  await dialog.getByRole("button", { name: "确认付款", exact: true }).click();
  await expect(dialog.getByText("付款成功")).toBeVisible();
  await dialog.getByRole("button", { name: "完成" }).click();
  await loginPaymentRole(page, request, "warehouse-applicant", "/supplier-payment-requests");
  await requestAction(page, "关闭尾款");
  const close = page.getByRole("dialog", { name: "关闭剩余付款？" });
  await close.getByLabel("关闭原因").fill("余款不再支付");
  await close.getByRole("button", { name: "确认关闭" }).click();
  await expect(page.getByRole("dialog", { name: "付款申请详情" }).getByText("已关闭", { exact: true }).first()).toBeVisible();
  const state = await paymentState(request);
  expect(state.payments).toHaveLength(1);
  expect(state.payments[0]).toMatchObject({ project_id: null, warehouse_id: financialWarehouseId(21), amount: "60.00" });
  expect(state.payables.filter(({ id }) => [financialWarehouseId(100), financialWarehouseId(101)].includes(id)).map(({ reserved_amount }) => reserved_amount)).toEqual(["0.00", "0.00"]);
  expect(state.httpGets.some((path) => path.startsWith("/supplier-settings"))).toBe(false);
});

test("取消仓库申请释放占用；没有仓库管理权限仅项目应付可操作", async ({ page, request }) => {
  await createWarehouseDraft(page, request);
  await submitWarehouseDraft(page);
  await requestAction(page, "取消申请");
  const cancel = page.getByRole("dialog", { name: "取消付款申请？" });
  await cancel.getByLabel("取消原因").fill("重新核对结算");
  await cancel.getByRole("button", { name: "确认取消" }).click();
  await expect(page.getByRole("dialog", { name: "付款申请详情" }).getByText("已取消", { exact: true }).first()).toBeVisible();
  await loginPaymentRole(page, request, "warehouse-no-manage", "/supplier-payables");
  await expect(page.getByRole("row").filter({ hasText: "REC-WH-0001" }).getByRole("checkbox")).toBeDisabled();
  await expect(page.getByRole("row").filter({ hasText: "REC-PAY-0001" }).getByRole("checkbox")).toBeEnabled();
  const state = await paymentState(request);
  expect(state.payables.find(({ id }) => id === financialWarehouseId(100))?.reserved_amount).toBe("0.00");
});

test("仓库筛选搜索和后页停用选项可用，付款 URL 用 snake_case；375px 页脚可达", async ({ page, request }, testInfo) => {
  await createWarehouseDraft(page, request);
  await page.getByLabel("采购去向").click();
  await page.getByRole("option", { name: "仓库补货", exact: true }).click();
  await page.getByRole("button", { name: "下一页仓库选项" }).click();
  await page.getByLabel("仓库", { exact: true }).click();
  await page.getByRole("option", { name: "北区历史仓库（已停用）" }).click();
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`destination_type=warehouse.*warehouse_id=${financialWarehouseId(21)}`));
  await expect(paymentRequestRow(page)).toBeVisible();
  await page.getByLabel("搜索仓库选项").fill("南区");
  await expect(page.getByText("第 1 / 1 页仓库选项")).toBeVisible();
  expect((await page.getByText("第 1 / 1 页仓库选项").boundingBox())?.height).toBeLessThanOrEqual(32);
  await page.screenshot({ path: testInfo.outputPath("warehouse-finance-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload({ waitUntil: "networkidle" });
  const footer = page.getByRole("button", { name: "下一页", exact: true }).last();
  const box = await footer.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(812);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("warehouse-finance-mobile.png"), fullPage: true });
});

test("应付桌面仓库筛选页码不被网格压成竖排", async ({ page, request }, testInfo) => {
  await loginPaymentRole(page, request, "warehouse-applicant", "/supplier-payables");
  await page.getByLabel("采购去向").click();
  await page.getByRole("option", { name: "仓库补货", exact: true }).click();
  const label = page.getByText("第 1 / 2 页仓库选项");
  await expect(label).toBeVisible();
  expect((await label.boundingBox())?.height).toBeLessThanOrEqual(32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("warehouse-payables-desktop.png"), fullPage: true });
});

test("manage 无 payable.view 的仓库深链走专用事实接口，不请求无权筛选或 settings", async ({ page, request }) => {
  await loginPaymentRole(page, request, "warehouse-manage-no-payables", `/supplier-payment-requests?create=1&payableIds=${financialWarehouseId(100)}`);
  const editor = page.getByRole("dialog", { name: "创建付款申请" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("申请原因").fill("专用事实结算");
  await editor.getByRole("button", { name: "保存草稿" }).click();
  await expect(paymentRequestRow(page)).toContainText("草稿");
  const state = await paymentState(request);
  expect(state.httpGets.some((path) => path.startsWith("/supplier-payment-request-payable-facts/batch"))).toBe(true);
  expect(state.httpGets.some((path) => path.startsWith("/supplier-payable-filter-options") || path.startsWith("/supplier-settings"))).toBe(false);
});

test("历史仓库付款记录按 20 条翻页，发票冻结门禁不暴露支付按钮", async ({ page, request }) => {
  await request.post(`${paymentBackend}/__test/reset`, { data: { warehouse: true, history: true } });
  await loginPaymentRole(page, request, "warehouse-finance", "/supplier-payment-requests");
  await paymentRequestRow(page, "PAYREQ-WH-HISTORY").getByRole("button", { name: "查看" }).click();
  const detail = page.getByRole("dialog", { name: "付款申请详情" });
  await expect(detail.getByText("PAY-WH-020", { exact: true })).toBeVisible();
  await expect(detail.getByText("PAY-WH-021", { exact: true })).toHaveCount(0);
  await detail.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(detail.getByText("PAY-WH-025", { exact: true })).toBeVisible();
  await expect(detail.getByText("PAY-WH-001", { exact: true })).toHaveCount(0);
  await detail.getByRole("button", { name: "关闭", exact: true }).last().click();
  await paymentRequestRow(page, "PAYREQ-WH-INVOICE").getByRole("button", { name: "查看" }).click();
  await expect(detail.getByRole("heading", { name: "发票门禁" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "确认付款", exact: true })).toHaveCount(0);
});

test("跨仓深链明确拒绝，不创建申请或发送写入", async ({ page, request }) => {
  await loginPaymentRole(page, request, "warehouse-applicant", `/supplier-payment-requests?create=1&payableIds=${financialWarehouseId(100)},${financialWarehouseId(102)}`);
  await expect(page.getByText("付款申请只能包含同一项目或仓库、供应商和币种的应付")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "创建付款申请" })).toHaveCount(0);
  expect((await paymentState(request)).journal).toHaveLength(0);
});

test("较旧的仓库搜索响应不能覆盖新搜索结果", async ({ page, request }) => {
  await loginPaymentRole(page, request, "warehouse-applicant", "/supplier-payment-requests");
  await page.getByLabel("采购去向").click();
  await page.getByRole("option", { name: "仓库补货", exact: true }).click();
  let releaseOld: () => void = () => {};
  let oldStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => { oldStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseOld = resolve; });
  await page.route(/\/api\/backend\/warehouses\?/, async (route) => {
    if (new URL(route.request().url()).searchParams.get("keyword") !== "北区") { await route.continue(); return; }
    oldStarted();
    await release;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: {
      list: [financialWarehouses[20]], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } }) });
  });
  try {
    await page.getByLabel("搜索仓库选项").fill("北区");
    await started;
    await page.getByLabel("搜索仓库选项").fill("南区");
    await expect(page.getByText("第 1 / 1 页仓库选项")).toBeVisible();
    releaseOld();
    await page.unrouteAll({ behavior: "wait" });
    await page.getByLabel("仓库", { exact: true }).click();
    await expect(page.getByRole("option", { name: "南区仓库", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "北区历史仓库（已停用）" })).toHaveCount(0);
  } finally { releaseOld(); }
});

test("付款列表失败提供明确重试并恢复真实列表", async ({ page, request }) => {
  let failed = false;
  await page.route(/\/api\/backend\/supplier-payment-requests\?/, async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, message: "付款列表临时不可用" }) });
    } else await route.continue();
  });
  await loginPaymentRole(page, request, "warehouse-readonly", "/supplier-payment-requests");
  await expect(page.getByText("付款列表临时不可用")).toBeVisible();
  await page.getByRole("button", { name: "重试加载付款申请" }).click();
  await expect(paymentRequestRow(page, "PAYREQ-E2E-INVOICE")).toBeVisible();
});
