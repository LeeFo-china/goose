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

test("审批节点可以选择费用审批或流程审批", async ({ page }) => {
  await loginAsTenantAdmin(page);
  await openFirstWorkflow(page);

  const node = page.locator("[data-workflow-node='true']").nth(1);
  await expect(node).toBeVisible();
  await node.getByRole("button").first().click();

  await page.getByLabel("节点能力").click();
  await page.getByRole("option", { name: "审批" }).click();

  await page.getByLabel("审批类型").click();
  await expect(page.getByRole("option", { name: "费用审批" })).toBeVisible();
  await expect(page.getByRole("option", { name: "流程审批" })).toBeVisible();

  await page.getByRole("option", { name: "流程审批" }).click();
  await expect(page.getByText("流程审批").first()).toBeVisible();
});
