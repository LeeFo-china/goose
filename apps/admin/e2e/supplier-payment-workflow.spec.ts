import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3995";

type TestRole = "applicant" | "approver" | "finance";

type JournalEntry = {
  method: string;
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
};

type ListGet = {
  path: string;
  page: string | null;
  pageSize: string | null;
};

const forbiddenMutationFacts = new Set([
  "tenant_id",
  "actor_id",
  "employee_id",
  "user_id",
  "created_by_employee_id",
  "updated_by_employee_id",
  "submitted_by_employee_id",
  "reviewed_by_employee_id",
  "confirmed_by_employee_id",
  "unit_price",
  "tax_rate",
  "cost_amount",
  "payable_amount",
  "paid_amount",
  "reserved_amount",
  "open_amount",
  "available_to_request_amount",
  "balance",
]);

async function resetMock(request: APIRequestContext) {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`);
  expect(response.ok()).toBe(true);
}

async function switchRole(
  page: Page,
  request: APIRequestContext,
  role: TestRole,
  path: string,
) {
  const roleResponse = await request.post(
    `${mockBackendBaseUrl}/__test/role`,
    { data: { role } },
  );
  expect(roleResponse.ok()).toBe(true);
  await page.context().clearCookies();
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { phone: "18637605353", code: "" },
  });
  expect(loginResponse.ok()).toBe(true);
  await page.goto(path, { waitUntil: "networkidle" });
}

function payableRow(page: Page, receiptNo: string) {
  return page.getByRole("row").filter({ hasText: receiptNo });
}

function requestRow(page: Page, requestNo: string) {
  return page.getByRole("row").filter({ hasText: requestNo });
}

async function openRequestAction(
  page: Page,
  requestNo: string,
  action: string,
) {
  await requestRow(page, requestNo)
    .getByRole("button", { name: `更多操作 ${requestNo}` })
    .click();
  await page.getByRole("menuitem", { name: action }).click();
}

async function uploadEvidence(dialog: ReturnType<Page["getByRole"]>) {
  await dialog.getByLabel("付款凭证（1–9 张）").setInputFiles({
    name: "supplier-payment-evidence.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(dialog.getByAltText("付款凭证 1")).toBeVisible();
}

function expectNoServerFacts(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(expectNoServerFacts);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(forbiddenMutationFacts.has(key)).toBe(false);
    expectNoServerFacts(nested);
  }
}

test("供应商应付完成申请、分权审批、分次付款与发票门禁闭环", async ({
  page,
  request,
}) => {
  await resetMock(request);
  await page.clock.setFixedTime("2030-01-10T08:00:00.000Z");
  await switchRole(page, request, "applicant", "/supplier-payables");

  await expect(page.getByRole("heading", { name: "供应商应付", level: 1 }))
    .toBeVisible();
  await page.getByLabel("项目").click();
  await page.getByRole("option", { name: "E2E 海棠湾项目" }).click();
  await expect(payableRow(page, "REC-PAY-0001")).toBeVisible();
  await expect(payableRow(page, "REC-PAY-0002")).toBeVisible();
  await payableRow(page, "REC-PAY-0001").getByRole("checkbox").click();
  await payableRow(page, "REC-PAY-0002").getByRole("checkbox").click();
  await page.getByRole("button", { name: "创建付款申请（2）" }).click();

  let sheet = page.getByRole("dialog", { name: "创建付款申请" });
  await expect(sheet.getByText("PO-PAY-0001 / REC-PAY-0001"))
    .toBeVisible();
  await expect(sheet.getByText("PO-PAY-0001 / REC-PAY-0002"))
    .toBeVisible();
  await sheet.getByLabel("申请原因").fill("E2E 两笔应付合并付款");
  await sheet.getByRole("button", { name: "保存草稿" }).click();

  const requestNo = "PAYREQ-E2E-0002";
  await expect(requestRow(page, requestNo)).toContainText("草稿");
  await openRequestAction(page, requestNo, "提交审批");
  let dialog = page.getByRole("dialog", { name: "提交付款申请？" });
  await dialog.getByRole("button", { name: "确认提交" }).click();
  sheet = page.getByRole("dialog", { name: "付款申请详情" });
  await expect(sheet.getByText("待审批", { exact: true }).first())
    .toBeVisible();
  await sheet.getByRole("button", { name: "关闭", exact: true }).last()
    .click();

  await page.goto("/supplier-payables", { waitUntil: "networkidle" });
  for (const receiptNo of ["REC-PAY-0001", "REC-PAY-0002"]) {
    const row = payableRow(page, receiptNo);
    await expect(row.getByText("已申请待付", { exact: true })).toBeVisible();
    await expect(row.getByText("¥0.00", { exact: true }).last())
      .toBeVisible();
  }

  await switchRole(
    page,
    request,
    "approver",
    "/supplier-payment-requests",
  );
  await expect(page.getByRole("heading", {
    name: "供应商付款申请",
    level: 1,
  })).toBeVisible();
  await openRequestAction(page, requestNo, "批准申请");
  dialog = page.getByRole("dialog", { name: "批准付款申请？" });
  await dialog.getByLabel("审批备注").fill("E2E 审批通过");
  await dialog.getByRole("button", { name: "确认批准" }).click();
  sheet = page.getByRole("dialog", { name: "付款申请详情" });
  await expect(sheet.getByText("已批准", { exact: true }).first())
    .toBeVisible();
  await sheet.getByRole("button", { name: "关闭", exact: true }).last()
    .click();

  await switchRole(
    page,
    request,
    "finance",
    "/supplier-payment-requests",
  );
  await requestRow(page, requestNo).getByRole("button", { name: "查看" })
    .click();
  sheet = page.getByRole("dialog", { name: "付款申请详情" });
  await sheet.getByRole("button", { name: "确认付款" }).click();
  dialog = page.getByRole("dialog", { name: "确认供应商付款" });
  await dialog.getByLabel("付款流水号").fill("BANK-E2E-PARTIAL-001");
  await dialog.getByLabel("本次付款金额").fill("60.00");
  await dialog.getByLabel("本次付款分配 1").fill("40.00");
  await dialog.getByLabel("本次付款分配 2").fill("20.00");
  await uploadEvidence(dialog);
  await dialog.getByRole("button", { name: "确认付款" }).click();
  await expect(dialog.getByText("付款成功")).toBeVisible();
  await expect(dialog.getByText("PAY-E2E-0001")).toBeVisible();
  await dialog.getByRole("button", { name: "完成" }).click();
  await expect(sheet.getByText("部分付款", { exact: true }).first())
    .toBeVisible();

  await sheet.getByRole("button", { name: "确认付款" }).click();
  dialog = page.getByRole("dialog", { name: "确认供应商付款" });
  await dialog.getByLabel("付款流水号").fill("BANK-E2E-FINAL-002");
  await uploadEvidence(dialog);
  await dialog.getByRole("button", { name: "确认付款" }).click();
  await expect(dialog.getByText("PAY-E2E-0002")).toBeVisible();
  await dialog.getByRole("button", { name: "完成" }).click();
  await expect(sheet.getByText("已付清", { exact: true }).first())
    .toBeVisible();
  await sheet.getByRole("button", { name: "关闭", exact: true }).last()
    .click();

  await page.goto("/supplier-purchase-orders", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "采购单", level: 1 }))
    .toBeVisible();
  const orderRow = page.getByRole("row").filter({ hasText: "PO-PAY-0001" });
  await orderRow.getByRole("button", { name: "查看" }).click();
  sheet = page.getByRole("dialog", { name: "采购单详情" });
  const summary = sheet.getByText("采购财务闭环")
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
  await expect(summary.getByText("¥120.00", { exact: true })).toHaveCount(3);
  await expect(summary.getByText("¥0.00", { exact: true })).toHaveCount(2);
  await sheet.getByRole("button", { name: "关闭", exact: true }).last()
    .click();

  await page.goto("/supplier-payment-requests", { waitUntil: "networkidle" });
  const invoiceRequestNo = "PAYREQ-E2E-INVOICE";
  await requestRow(page, invoiceRequestNo)
    .getByRole("button", { name: "查看" }).click();
  sheet = page.getByRole("dialog", { name: "付款申请详情" });
  await expect(sheet.getByRole("heading", { name: "发票门禁" }))
    .toBeVisible();
  await expect(sheet.getByText("当前不提供绕过操作", { exact: false }))
    .toBeVisible();
  await expect(sheet.getByRole("button", { name: "确认付款" }))
    .toHaveCount(0);

  const journalResponse = await request.get(
    `${mockBackendBaseUrl}/__test/journal`,
  );
  expect(journalResponse.ok()).toBe(true);
  const journal = (await journalResponse.json() as {
    journal: JournalEntry[];
  }).journal;
  expect(journal.length).toBeGreaterThanOrEqual(5);
  for (const entry of journal) {
    expect(["POST", "PUT"]).toContain(entry.method);
    expect(entry.idempotencyKey).toEqual(expect.any(String));
    expect(entry.idempotencyKey?.trim()).not.toBe("");
    expectNoServerFacts(entry.payload);
  }

  const listGetsResponse = await request.get(
    `${mockBackendBaseUrl}/__test/list-gets`,
  );
  expect(listGetsResponse.ok()).toBe(true);
  const listGets = (await listGetsResponse.json() as {
    requests: ListGet[];
  }).requests;
  const requiredListPaths = [
    "/supplier-payables",
    "/supplier-payable-filter-options",
    "/supplier-payment-requests",
    "/supplier-payment-requests/:id/payments",
    "/supplier-purchase-orders",
    "/supplier-purchase-orders/:id/items",
  ];
  for (const path of requiredListPaths) {
    expect(listGets.some((requestEntry) => requestEntry.path === path)).toBe(true);
  }
  for (const requestEntry of listGets) {
    const pageNumber = Number(requestEntry.page);
    const pageSize = Number(requestEntry.pageSize);
    expect(requestEntry.page).not.toBeNull();
    expect(requestEntry.pageSize).not.toBeNull();
    expect(Number.isSafeInteger(pageNumber) && pageNumber >= 1).toBe(true);
    expect(
      Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 100,
    ).toBe(true);
  }
});
