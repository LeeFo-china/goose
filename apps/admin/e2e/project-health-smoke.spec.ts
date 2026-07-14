import { expect, test } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

const viewportWidths = [390, 768, 1440] as const;
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

function isPageHorizontallyOverflowing(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 1;
  });
}

test.describe("project health smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTenantAdmin(page);
  });

  for (const width of viewportWidths) {
    test(`风险中心在 ${width}px 视口下展示列表且不产生页面级横向溢出`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const failedResponses: Response[] = [];

      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400) failedResponses.push(response);
      });

      await page.setViewportSize({ width, height: 900 });
      await page.goto("/project-health", { waitUntil: "networkidle" });

      await expect(page.getByRole("heading", { name: "项目风险" })).toBeVisible();
      await expect(page.getByText("风险总数")).toBeVisible();
      const tableViewport = page.getByTestId("project-health-table-viewport");
      await expect(tableViewport).toBeVisible();
      await expect(tableViewport.getByText("流程任务逾期")).toBeVisible();
      await expect(page.getByText("当前显示 5 条，共 5 条")).toBeVisible();
      expect(await isPageHorizontallyOverflowing(page)).toBe(false);

      expect(consoleErrors).toEqual([]);
      expect(failedResponses.map((response) => `${response.status()} ${response.url()}`)).toEqual([]);
    });
  }

  test("风险中心可按需生成 AI 经营摘要", async ({ page }) => {
    let aiRequestCount = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/backend/project-health/ai-summary")) {
        aiRequestCount += 1;
      }
    });

    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/project-health", { waitUntil: "networkidle" });
    expect(aiRequestCount).toBe(0);

    const aiResponse = page.waitForResponse((response) =>
      response.url().includes("/api/backend/project-health/ai-summary") &&
      response.status() === 200
    );

    await page.getByRole("button", { name: "生成 AI 经营摘要" }).click();
    await aiResponse;

    await expect(page.getByRole("heading", { name: "AI 经营摘要" })).toBeVisible();
    await expect(page.getByText("当前有 5 条项目运营风险")).toBeVisible();
    await expect(page.getByText("AI 摘要仅用于运营排序")).toBeVisible();
    expect(await isPageHorizontallyOverflowing(page)).toBe(false);
    expect(aiRequestCount).toBe(1);
  });

  test("风险中心筛选和重置会同步 URL 并刷新列表", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/project-health", { waitUntil: "networkidle" });

    await page.getByPlaceholder("项目名称或完整项目 ID").fill("湖畔");
    await page.getByRole("combobox").nth(0).click();
    await page.getByRole("option", { name: "严重" }).click();
    await page.getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: "流程任务逾期" }).click();

    const filteredResponse = page.waitForResponse((response) => {
      const url = response.url();
      return url.includes("/api/backend/project-health/risks") &&
        url.includes("severity=danger") &&
        url.includes("risk_type=workflow_task_overdue") &&
        url.includes("keyword=%E6%B9%96%E7%95%94") &&
        response.status() === 200;
    });
    await page.getByRole("button", { name: "查询" }).click();
    await filteredResponse;

    await expect(page).toHaveURL(/\/project-health\?page=1&severity=danger&risk_type=workflow_task_overdue&keyword=%E6%B9%96%E7%95%94$/);
    await expect(page.getByText("当前显示 1 条，共 1 条")).toBeVisible();
    await expect(page.getByTestId("project-health-table-viewport").getByText("湖畔雅居 12-1")).toBeVisible();
    await expect(page.getByTestId("project-health-table-viewport").getByText("江湾府 8-2")).toHaveCount(0);

    const resetResponse = page.waitForResponse((response) => {
      const url = response.url();
      return url.includes("/api/backend/project-health/risks?page=1&pageSize=20") &&
        !url.includes("severity=") &&
        !url.includes("risk_type=") &&
        !url.includes("keyword=") &&
        response.status() === 200;
    });
    await page.getByRole("button", { name: "重置" }).click();
    await resetResponse;

    await expect(page).toHaveURL(/\/project-health\?page=1$/);
    await expect(page.getByText("当前显示 5 条，共 5 条")).toBeVisible();
    expect(await isPageHorizontallyOverflowing(page)).toBe(false);
  });

  test("AI 摘要失败只显示摘要错误且保留风险列表", async ({ page }) => {
    await page.route("**/api/backend/project-health/ai-summary", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "模拟 AI 服务不可用",
          code: "AI_UNAVAILABLE",
        }),
      });
    });

    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/project-health", { waitUntil: "networkidle" });

    await page.getByRole("button", { name: "生成 AI 经营摘要" }).click();

    await expect(page.getByText("AI 摘要生成失败")).toBeVisible();
    await expect(page.getByText("模拟 AI 服务不可用")).toBeVisible();
    await expect(page.getByTestId("project-health-table-viewport").getByText("流程任务逾期")).toBeVisible();
    await expect(page.getByText("当前显示 5 条，共 5 条")).toBeVisible();
  });
});
