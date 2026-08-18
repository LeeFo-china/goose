import { expect } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

export const mockBackendBaseUrl = "http://127.0.0.1:3997";
const platformAdminPhone = "18637605353";
const tenantAdminPhone = "18637605354";

export type MutationJournalEntry = {
  method: "POST" | "PATCH";
  path: string;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
};

export async function resetMock(request: APIRequestContext) {
  const response = await request.post(`${mockBackendBaseUrl}/__test/reset`);
  expect(response.ok()).toBe(true);
}

export async function loginAsPlatformAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: platformAdminPhone, code: "" },
  });
  expect(response.ok()).toBe(true);
}

export async function loginAsTenantAdmin(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone: tenantAdminPhone, code: "" },
  });
  expect(response.ok()).toBe(true);
}

export async function readMutations(
  request: APIRequestContext,
): Promise<MutationJournalEntry[]> {
  const response = await request.get(`${mockBackendBaseUrl}/__test/mutations`);
  expect(response.ok()).toBe(true);
  return (await response.json() as { mutations: MutationJournalEntry[] })
    .mutations;
}

export async function submitStatus(
  row: Locator,
  page: Page,
  action: "停用" | "启用",
) {
  await row.getByRole("button", { name: action, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`^${action}`) });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", {
    name: `${action}目录数据`,
    exact: true,
  }).click();
}
