import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const tenantAdminPhone = process.env.GOOES_E2E_TENANT_ADMIN_PHONE || "18800000001";

async function loginAsTenantAdmin(page: Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: {
      phone: tenantAdminPhone,
      code: "",
    },
  });
  expect(loginResponse.ok()).toBe(true);
}

async function openFirstWorkflow(page: Page) {
  await page.goto("/workflows", { waitUntil: "load" });
  const workflowHref = await page
    .locator("a[href^='/workflows/']")
    .first()
    .getAttribute("href");
  expect(workflowHref).toBeTruthy();
  await page.goto(workflowHref!, { waitUntil: "load" });
}

test("收款归入财务能力且审批保持独立", async ({ page }) => {
  await loginAsTenantAdmin(page);
  await openFirstWorkflow(page);

  const node = page.locator("[data-workflow-node='true']").nth(1);
  await expect(node).toBeVisible();
  await node.click();

  await page.getByLabel("节点能力").click();
  await expect(page.getByRole("option", { name: "财务" })).toBeVisible();
  await expect(page.getByRole("option", { name: "审批" })).toBeVisible();
  await expect(page.getByRole("option", { name: "收款" })).toHaveCount(0);

  await page.getByRole("option", { name: "财务" }).click();
  await page.getByLabel("财务类型").click();
  await expect(page.getByRole("option", { name: "收款" })).toBeVisible();
  await expect(page.getByRole("option", { name: "结算" })).toBeVisible();
  await expect(page.getByRole("option", { name: "审批" })).toHaveCount(0);
});
