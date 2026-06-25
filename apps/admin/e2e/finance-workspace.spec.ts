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

async function expectNoDocumentScroll(page: Page) {
  const state = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(state.scrollHeight).toBeLessThanOrEqual(state.clientHeight + 1);
  expect(state.scrollWidth).toBeLessThanOrEqual(state.clientWidth + 1);
}

async function expectFinanceAdvancedFilterInline(page: Page) {
  const toolbar = page.locator("form[action='/finance']").first();
  const positions = await toolbar.evaluate((form) => {
    const risk = form.querySelector("#finance-risk-level")?.getBoundingClientRect();
    const more = Array.from(form.querySelectorAll("summary"))
      .find((item) => item.textContent?.includes("更多筛选"))
      ?.getBoundingClientRect();
    const submit = form.querySelector("button[type='submit']")?.getBoundingClientRect();
    const reset = Array.from(form.querySelectorAll("a"))
      .find((item) => item.textContent?.trim() === "重置")
      ?.getBoundingClientRect();
    return risk && more && submit && reset
      ? {
          riskRight: risk.right,
          moreLeft: more.left,
          moreRight: more.right,
          submitLeft: submit.left,
          submitRight: submit.right,
          resetLeft: reset.left,
          yDelta: Math.max(risk.top, more.top, submit.top, reset.top) -
            Math.min(risk.top, more.top, submit.top, reset.top),
        }
      : null;
  });

  expect(positions).not.toBeNull();
  expect(positions!.moreLeft).toBeGreaterThanOrEqual(positions!.riskRight - 1);
  expect(positions!.submitLeft).toBeGreaterThanOrEqual(positions!.moreRight - 1);
  expect(positions!.resetLeft).toBeGreaterThanOrEqual(positions!.submitRight - 1);
  expect(positions!.yDelta).toBeLessThanOrEqual(4);
}

async function expectFinanceProjectTablePageSize(page: Page) {
  await expect(page.getByText("每页 3 个")).toBeVisible();
  await expect(page.getByText(/当前显示 3 个项目，共 \d+ 个/)).toBeVisible();
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
    const profitBreakdown = page
      .getByRole("heading", { name: "利润拆解" })
      .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
    await expect(profitBreakdown).toBeVisible();
    await expect(profitBreakdown.getByText("合同")).toHaveCount(0);
    await expect(profitBreakdown.getByText("已付成本")).toBeVisible();
    await expect(profitBreakdown.getByText("实际利润")).toBeVisible();
    await expect(page.getByRole("heading", { name: "风险分布" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "30天现金流" })).toBeVisible();
    await expectFinanceAdvancedFilterInline(page);
    await expectFinanceProjectTablePageSize(page);
    await expectNoDocumentScroll(page);

    await financeNav.getByRole("link", { name: "财务诊断" }).click();
    await expect(page).toHaveURL(/\/finance\/diagnostics/);
    await expect(page.getByRole("heading", { level: 1, name: "财务诊断" }))
      .toBeVisible();
    await expect(financeNav.getByRole("link", { name: "财务诊断" }))
      .toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "全部" }))
      .toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "重点项目" })).toBeVisible();
    await page.getByRole("link", { name: "待补数据" }).click();
    await expect(page).toHaveURL(/\/finance\/diagnostics\?view=data/);
    await expect(page.getByRole("link", { name: "待补数据" }))
      .toHaveAttribute("aria-current", "page");
    await expectNoDocumentScroll(page);
  });
});
