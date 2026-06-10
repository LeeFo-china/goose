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

test("竣工验收归入施工阶段能力的阶段类型", async ({ page }) => {
  await loginAsTenantAdmin(page);

  await page.goto("/workflows", { waitUntil: "load" });
  const workflowHref = await page
    .locator("a[href^='/workflows/']")
    .first()
    .getAttribute("href");
  expect(workflowHref).toBeTruthy();
  await page.goto(workflowHref!, { waitUntil: "load" });

  const node = page.locator("[data-workflow-node='true']").nth(1);
  await expect(node).toBeVisible();
  await node.getByRole("button").first().click();

  await page.getByLabel("节点能力").click();
  await expect(page.getByRole("option", { name: "施工阶段" })).toBeVisible();
  await expect(page.getByRole("option", { name: "竣工验收" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByLabel("节点能力").click();
  await page.getByRole("option", { name: "施工阶段" }).click();

  await page.getByLabel("阶段类型").click();
  await expect(page.getByRole("option", { name: "开工" })).toBeVisible();
  await expect(page.getByRole("option", { name: "竣工验收" })).toBeVisible();
});
