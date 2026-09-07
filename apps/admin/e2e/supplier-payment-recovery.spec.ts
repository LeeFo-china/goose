import { expect, test } from "@playwright/test";
import { approveWarehouseRequest, createWarehouseDraft, openWarehousePayment, paymentBackend,
  paymentRequestRow, paymentState, submitWarehouseDraft } from "./supplier-payment-test-helpers";

test.beforeEach(async ({ request }) => {
  expect((await request.post(`${paymentBackend}/__test/reset`, { data: { warehouse: true } })).ok()).toBe(true);
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "wait" }); });

test("原请求重放响应延迟时切换另一申请，旧闭包不得覆盖当前详情", async ({ page, request }) => {
  await createWarehouseDraft(page, request);
  await submitWarehouseDraft(page);
  await approveWarehouseRequest(page, request);
  const payment = await openWarehousePayment(page, request);
  await request.post(`${paymentBackend}/__test/fault`, { data: { kind: "truncated", action: "/payments" } });
  await payment.getByRole("button", { name: "确认付款", exact: true }).click();
  await expect(payment.getByText("付款结果尚未确认", { exact: false })).toBeVisible();
  const original = (await paymentState(request)).journal.find(({ path }) => path.endsWith("/payments"));
  await page.reload({ waitUntil: "networkidle" });
  await paymentRequestRow(page).getByRole("button", { name: "查看", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "付款申请详情" });
  await expect(detail.getByText("PAYREQ-E2E-0002", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "关闭", exact: true }).last().click();
  let releaseReplay: () => void = () => {};
  let replayStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => { replayStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseReplay = resolve; });
  await page.route(/\/api\/backend\/supplier-payment-requests\/[0-9a-f-]+\/payments$/, async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    replayStarted();
    await release;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "使用原请求重试操作" }).click();
    await started;
    await paymentRequestRow(page, "PAYREQ-E2E-INVOICE").getByRole("button", { name: "查看", exact: true }).click();
    await expect(detail.getByText("PAYREQ-E2E-INVOICE", { exact: true })).toBeVisible();
    const allocationFacts = await detail.getByRole("table").first().innerText();
    const before = await paymentState(request);
    const originalReadPrefix = original?.path.replace(/\/payments$/, "") ?? "missing";
    releaseReplay();
    await expect(page.getByText("原请求结果已确认", { exact: true })).toBeVisible();
    await expect(detail.getByText("PAYREQ-E2E-INVOICE", { exact: true })).toBeVisible();
    await expect(detail.getByText("E2E 发票门禁申请", { exact: true })).toBeVisible();
    expect(await detail.getByRole("table").first().innerText()).toBe(allocationFacts);
    await expect(detail.getByText("PAYREQ-E2E-0002", { exact: true })).toHaveCount(0);
    const after = await paymentState(request);
    expect(after.httpGets.filter((path) => path.startsWith(originalReadPrefix))).toEqual(before.httpGets.filter((path) => path.startsWith(originalReadPrefix)));
    expect(after.payments).toHaveLength(1);
    expect(after.journal.filter(({ path }) => path.endsWith("/payments"))).toEqual([original, original]);
  } finally { releaseReplay(); }
});

for (const requestNo of ["PAYREQ-E2E-0002", "PAYREQ-E2E-INVOICE"]) {
  test(`重载未确认付款后先查看 ${requestNo}，可退出详情并恢复原请求`, async ({ page, request }, testInfo) => {
    await createWarehouseDraft(page, request);
    await submitWarehouseDraft(page);
    await approveWarehouseRequest(page, request);
    const payment = await openWarehousePayment(page, request);
    await request.post(`${paymentBackend}/__test/fault`, { data: { kind: "truncated", action: "/payments" } });
    await payment.getByRole("button", { name: "确认付款", exact: true }).click();
    await expect(payment.getByText("付款结果尚未确认", { exact: false })).toBeVisible();
    const original = (await paymentState(request)).journal.find(({ path }) => path.endsWith("/payments"));
    await page.reload({ waitUntil: "networkidle" });
    await paymentRequestRow(page, requestNo).getByRole("button", { name: "查看", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "付款申请详情" });
    await expect(detail.getByText(requestNo, { exact: true })).toBeVisible();
    await expect(detail.getByText("原付款申请 PAYREQ-E2E-0002 的操作尚未确认。", { exact: false })).toBeVisible();
    await expect(detail.getByRole("button", { name: "关闭", exact: true }).last()).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath("pending-payment-detail-safe-exit.png"), fullPage: true });
    await detail.getByRole("button", { name: "关闭", exact: true }).last().click();
    await page.getByRole("button", { name: "使用原请求重试操作" }).click();
    await expect(page.getByRole("button", { name: "使用原请求重试操作" })).toHaveCount(0);
    await paymentRequestRow(page, requestNo).getByRole("button", { name: "查看", exact: true }).click();
    await expect(detail.getByText(requestNo, { exact: true })).toBeVisible();
    const after = await paymentState(request);
    expect(after.payments).toHaveLength(1);
    expect(after.journal.filter(({ path }) => path.endsWith("/payments"))).toEqual([original, original]);
  });
}

test("保存已落事实但 200 JSON 截断，浏览器重载仍用同申请 UUID、key 和 payload 恢复", async ({ page, request }) => {
  await request.post(`${paymentBackend}/__test/fault`, { data: { kind: "truncated", action: "/supplier-payment-requests" } });
  const editor = await createWarehouseDraft(page, request);
  await expect(editor.getByText("保存结果暂未确认", { exact: false })).toBeVisible();
  const before = await paymentState(request);
  const original = before.journal[0];
  expect(before.requests.filter(({ request_no }) => request_no === "PAYREQ-E2E-0002")).toHaveLength(1);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "使用相同请求身份重试保存" }).click();
  await expect(paymentRequestRow(page)).toContainText("草稿");
  await expect(page.getByRole("button", { name: "使用相同请求身份重试保存" })).toHaveCount(0);
  const after = await paymentState(request);
  expect(after.requests.filter(({ request_no }) => request_no === "PAYREQ-E2E-0002")).toHaveLength(1);
  expect(after.journal).toHaveLength(2);
  expect(after.journal[1]).toEqual(original);
});

for (const kind of ["truncated", "disconnect"] as const) {
  test(`付款已入账但 ${kind}，刷新不能解除冻结，重载原 key 只重放一笔付款`, async ({ page, request }, testInfo) => {
    await createWarehouseDraft(page, request);
    await submitWarehouseDraft(page);
    await approveWarehouseRequest(page, request);
    const dialog = await openWarehousePayment(page, request);
    await request.post(`${paymentBackend}/__test/fault`, { data: { kind, action: "/payments" } });
    await dialog.getByRole("button", { name: "确认付款", exact: true }).click();
    await expect(dialog.getByText("付款结果尚未确认", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "刷新最新数据（保留原请求）" }).click();
    await expect(dialog.getByRole("button", { name: "使用原请求重试付款" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /确认付款$/ })).toBeDisabled();
    const before = await paymentState(request);
    expect(before.payments).toHaveLength(1);
    const original = before.journal.find(({ path }) => path.endsWith("/payments"));
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "使用原请求重试操作" }).click();
    await expect(page.getByRole("button", { name: "使用原请求重试操作" })).toHaveCount(0);
    await expect(paymentRequestRow(page)).toContainText("已付清");
    const after = await paymentState(request);
    expect(after.payments).toHaveLength(1);
    const attempts = after.journal.filter(({ path }) => path.endsWith("/payments"));
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(original);
    await page.screenshot({ path: testInfo.outputPath(`warehouse-payment-${kind}-recovered.png`), fullPage: true });
  });
}

test("付款回执已确认但详情刷新失败，只重新读，不再发送付款", async ({ page, request }) => {
  await createWarehouseDraft(page, request);
  await submitWarehouseDraft(page);
  await approveWarehouseRequest(page, request);
  const dialog = await openWarehousePayment(page, request);
  let failed = false;
  await page.route(/\/api\/backend\/supplier-payment-requests\/[0-9a-f-]+$/, async (route) => {
    if (route.request().method() === "GET" && !failed) {
      failed = true;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, message: "详情临时不可用" }) });
    } else await route.continue();
  });
  await dialog.getByRole("button", { name: "确认付款", exact: true }).click();
  await expect(dialog.getByText("付款成功")).toBeVisible();
  await dialog.getByRole("button", { name: "完成" }).click();
  const detail = page.getByRole("dialog", { name: "付款申请详情" });
  await expect(detail.getByText("操作已成功，但最新详情刷新失败，请手动刷新最新数据。")).toBeVisible();
  await detail.getByRole("button", { name: "刷新最新数据", exact: true }).click();
  await expect(detail.getByText("已付清", { exact: true }).first()).toBeVisible();
  const state = await paymentState(request);
  expect(state.payments).toHaveLength(1);
  expect(state.journal.filter(({ path }) => path.endsWith("/payments"))).toHaveLength(1);
});
