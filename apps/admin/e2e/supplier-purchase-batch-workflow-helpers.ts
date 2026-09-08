import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

import { ids } from "./supplier-purchase-batch-fixture.mjs";

export const batchBackend = "http://127.0.0.1:3986";

export async function openBatchPage(
  page: Page,
  request: APIRequestContext,
  scenario = "empty",
  role = "manager",
) {
  const reset = await request.post(
    `${batchBackend}/__test/reset?scenario=${scenario}`,
  );
  expect(reset.ok()).toBe(true);
  const login = await page.request.post("/api/auth/login", {
    data: { phone: role, code: "" },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/supplier-purchase-batches");
}

export async function chooseBatchPurpose(
  editor: Locator,
  purpose: "项目备料" | "现场补料" | string,
) {
  if (purpose === "项目备料" || purpose === "现场补料") {
    await editor.getByRole("button", { name: purpose, exact: true }).click();
    return;
  }
  await editor.getByRole("button", { name: "其他", exact: true }).click();
  await editor.getByPlaceholder("一句话说明采购用途").fill(purpose);
}

export async function openProjectBatchEditor(
  page: Page,
  request: APIRequestContext,
  options: {
    scenario?: string;
    purpose?: "项目备料" | "现场补料" | string;
    addProduct?: string;
  } = {},
) {
  await openBatchPage(page, request, options.scenario);
  await page.getByRole("button", { name: "新建批次" }).click();
  const editor = page.getByRole("dialog", { name: "新建采购批次" });
  await editor.getByLabel("采购项目", { exact: true }).click();
  await page.getByRole("option", { name: "采购项目01", exact: true }).click();
  await chooseBatchPurpose(editor, options.purpose ?? "项目备料");
  const productName = options.addProduct ?? "采购商品02";
  await editor.getByRole("row").filter({ hasText: productName }).getByRole(
    "button",
    { name: `加入${productName}`, exact: true },
  ).click();
  return editor;
}

export async function readBatchState(request: APIRequestContext) {
  const response = await request.get(`${batchBackend}/__test/state`);
  expect(response.ok()).toBe(true);
  return await response.json() as {
    commands: Array<{ path: string; payload: Record<string, unknown> }>;
    requests: string[];
  };
}

export { ids };
