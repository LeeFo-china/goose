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

test("选中节点保持实底背景", async ({ page }) => {
  await loginAsTenantAdmin(page);
  await openFirstWorkflow(page);

  const node = page.locator("[data-workflow-node='true']").nth(1);
  await expect(node).toBeVisible();
  await node.click();

  await expect(node).toHaveClass(/scale-\[1\.08\]/);
  await expect(node).not.toHaveClass(/bg-primary\/\[0\.03\]/);
});
