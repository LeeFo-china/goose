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

test.describe("finance workspace", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTenantAdmin(page);
  });

  test("财务总览展示图表并可进入财务诊断", async ({ page }) => {
    await page.goto("/finance", { waitUntil: "load" });

    const financeNav = page.getByRole("navigation", { name: "财务模块" });
    await expect(financeNav.getByRole("link", { name: "财务总览" }))
      .toHaveAttribute("aria-current", "page");
    await expect(financeNav.getByRole("link", { name: "财务诊断" }))
      .toBeVisible();

    await expect(page.getByRole("heading", { name: "回款结构" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "利润结构" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "风险分布" })).toBeVisible();

    await financeNav.getByRole("link", { name: "财务诊断" }).click();
    await expect(page).toHaveURL(/\/finance\/diagnostics/);
    await expect(page.getByRole("heading", { level: 1, name: "财务诊断" }))
      .toBeVisible();
    await expect(financeNav.getByRole("link", { name: "财务诊断" }))
      .toHaveAttribute("aria-current", "page");
  });
});
