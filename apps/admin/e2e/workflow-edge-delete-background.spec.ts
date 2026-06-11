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

test("连线删除按钮聚焦时保持实底背景", async ({ page }) => {
  await loginAsTenantAdmin(page);
  await openFirstWorkflow(page);

  const deleteEdgeButton = page.getByRole("button", { name: "删除连线" }).first();
  await expect(deleteEdgeButton).toBeVisible();
  await deleteEdgeButton.focus();

  await expect(deleteEdgeButton).not.toHaveClass(/bg-background\/95/);
  await expect(deleteEdgeButton).toHaveClass(/(^| )bg-background( |$)/);
  await expect(deleteEdgeButton).toHaveClass(/focus-visible:bg-background/);
  await expect(deleteEdgeButton).toHaveClass(/active:bg-background/);
});
