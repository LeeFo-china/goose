import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const paymentBackend = "http://127.0.0.1:3995";
export async function loginPaymentRole(page: Page, request: APIRequestContext, role: string, path: string) {
  expect((await request.post(`${paymentBackend}/__test/role`, { data: { role } })).ok()).toBe(true);
  await page.context().clearCookies();
  expect((await page.request.post("/api/auth/login", { data: { phone: "18637605353", code: "" } })).ok()).toBe(true);
  await page.goto(path, { waitUntil: "networkidle" });
}
export function paymentRequestRow(page: Page, requestNo = "PAYREQ-E2E-0002") {
  return page.getByRole("row").filter({ hasText: requestNo });
}
export async function requestAction(page: Page, action: string, requestNo = "PAYREQ-E2E-0002") {
  await paymentRequestRow(page, requestNo).getByRole("button", { name: `更多操作 ${requestNo}` }).click();
  await page.getByRole("menuitem", { name: action }).click();
}
export async function createWarehouseDraft(page: Page, request: APIRequestContext, role = "warehouse-applicant") {
  await loginPaymentRole(page, request, role, "/supplier-payables");
  for (const receipt of ["REC-WH-0001", "REC-WH-0002"]) {
    await page.getByRole("row").filter({ hasText: receipt }).getByRole("checkbox").click();
  }
  await expect(page.getByRole("row").filter({ hasText: "REC-WH-0003" }).getByRole("checkbox")).toBeDisabled();
  await page.getByRole("button", { name: "创建付款申请（2）" }).click();
  const editor = page.getByRole("dialog", { name: "创建付款申请" });
  await editor.getByLabel("申请原因").fill("历史停用仓应付结算");
  await editor.getByRole("button", { name: "保存草稿" }).click();
  return editor;
}
export async function submitWarehouseDraft(page: Page) {
  await expect(paymentRequestRow(page)).toContainText("草稿");
  await requestAction(page, "提交审批");
  await page.getByRole("dialog", { name: "提交付款申请？" }).getByRole("button", { name: "确认提交" }).click();
  const sheet = page.getByRole("dialog", { name: "付款申请详情" });
  await expect(sheet.getByText("待审批", { exact: true }).first()).toBeVisible();
  await sheet.getByRole("button", { name: "关闭", exact: true }).last().click();
}
export async function approveWarehouseRequest(page: Page, request: APIRequestContext) {
  await loginPaymentRole(page, request, "warehouse-approver", "/supplier-payment-requests");
  await requestAction(page, "批准申请");
  await page.getByRole("dialog", { name: "批准付款申请？" }).getByRole("button", { name: "确认批准" }).click();
  const sheet = page.getByRole("dialog", { name: "付款申请详情" });
  await expect(sheet.getByText("已批准", { exact: true }).first()).toBeVisible();
  await sheet.getByRole("button", { name: "关闭", exact: true }).last().click();
}
export async function openWarehousePayment(page: Page, request: APIRequestContext) {
  await loginPaymentRole(page, request, "warehouse-finance", "/supplier-payment-requests");
  await paymentRequestRow(page).getByRole("button", { name: "查看" }).click();
  await page.getByRole("dialog", { name: "付款申请详情" }).getByRole("button", { name: "确认付款" }).click();
  const dialog = page.getByRole("dialog", { name: "确认供应商付款" });
  await dialog.getByLabel("付款流水号").fill("BANK-WH-001");
  await dialog.getByLabel("付款凭证（1–9 张）").setInputFiles({ name: "proof.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
  await expect(dialog.getByAltText("付款凭证 1")).toBeVisible();
  return dialog;
}

export type PaymentTestState = {
  requests: Array<{ id: string; request_no: string; destination_type?: string; project_id: string | null; warehouse_id?: string; status: string }>;
  payables: Array<{ id: string; reserved_amount: string; paid_amount: string }>;
  payments: Array<{ id: string; project_id: string | null; warehouse_id: string; amount: string }>;
  journal: Array<{ path: string; idempotencyKey: string; payload: Record<string, unknown> }>;
  httpGets: string[];
};
export async function paymentState(request: APIRequestContext): Promise<PaymentTestState> {
  return (await request.get(`${paymentBackend}/__test/state`)).json();
}
