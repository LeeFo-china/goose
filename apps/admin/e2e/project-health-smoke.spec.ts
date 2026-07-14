import { expect, test } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

const viewportWidths = [390, 768, 1024, 1440] as const;
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
      if (width >= 1024) {
        await expect(page.getByRole("link", { name: "项目风险" })).toBeVisible();
      }
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

  test("风险中心支持键盘提交筛选和触发 AI 摘要", async ({ page }) => {
    let aiRequestCount = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/backend/project-health/ai-summary")) {
        aiRequestCount += 1;
      }
    });

    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/project-health", { waitUntil: "networkidle" });

    const keywordInput = page.getByPlaceholder("项目名称或完整项目 ID");
    await keywordInput.focus();
    await expect(keywordInput).toBeFocused();
    await keywordInput.fill("云麓");

    const filteredResponse = page.waitForResponse((response) =>
      response.url().includes("/api/backend/project-health/risks") &&
      response.url().includes("keyword=%E4%BA%91%E9%BA%93") &&
      response.status() === 200
    );
    await page.keyboard.press("Enter");
    await filteredResponse;

    await expect(page).toHaveURL(/\/project-health\?page=1&keyword=%E4%BA%91%E9%BA%93$/);
    await expect(page.getByTestId("project-health-table-viewport").getByText("云麓花园 3-1")).toBeVisible();

    const aiButton = page.getByRole("button", { name: "生成 AI 经营摘要" });
    await aiButton.focus();
    await expect(aiButton).toBeFocused();

    const aiResponse = page.waitForResponse((response) =>
      response.url().includes("/api/backend/project-health/ai-summary") &&
      response.status() === 200
    );
    await page.keyboard.press("Enter");
    await aiResponse;

    await expect(page.getByRole("heading", { name: "AI 经营摘要" })).toBeVisible();
    expect(aiRequestCount).toBe(1);
  });

  test("风险中心快速切换筛选时旧响应不会覆盖新结果", async ({ page }) => {
    await page.route("**/api/backend/project-health/risks**", async (route) => {
      const url = route.request().url();
      if (url.includes("keyword=%E6%B9%96%E7%95%94")) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      await route.continue().catch(() => undefined);
    });

    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/project-health", { waitUntil: "networkidle" });

    const jiangwanResponse = page.waitForResponse((response) =>
      response.url().includes("/api/backend/project-health/risks") &&
      response.url().includes("keyword=%E6%B1%9F%E6%B9%BE") &&
      response.status() === 200
    );

    await page.evaluate(() => {
      window.history.pushState(null, "", "/project-health?page=1&keyword=湖畔");
      window.dispatchEvent(new PopStateEvent("popstate"));
      window.history.pushState(null, "", "/project-health?page=1&keyword=江湾");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await jiangwanResponse;

    const tableViewport = page.getByTestId("project-health-table-viewport");
    await expect(page).toHaveURL(/\/project-health\?page=1&keyword=%E6%B1%9F%E6%B9%BE$/);
    await expect(page.getByText("当前显示 1 条，共 1 条")).toBeVisible();
    await expect(tableViewport.getByText("江湾府 8-2")).toBeVisible();
    await expect(tableViewport.getByText("湖畔雅居 12-1")).toHaveCount(0);
  });

  test("风险中心为五类风险生成处理入口", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto("/project-health", { waitUntil: "networkidle" });

    const tableViewport = page.getByTestId("project-health-table-viewport");
    const actionHrefs = await tableViewport
      .getByRole("link", { name: "去处理" })
      .evaluateAll((links) =>
        links.map((link) => (link as HTMLAnchorElement).getAttribute("href")),
      );

    expect(actionHrefs).toEqual([
      "/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?tab=overview",
      "/projects/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb?tab=overview",
      "/projects/cccccccc-cccc-4ccc-8ccc-cccccccccccc?tab=logs",
      "/projects/dddddddd-dddd-4ddd-8ddd-dddddddddddd?tab=acceptances&acceptanceId=dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      "/customer-service?ticketId=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    ]);
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

  test("风险列表失败态不展示为风险 0", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/project-health?page=1&keyword=__server_error__", {
      waitUntil: "networkidle",
    });

    await expect(page.getByText("模拟项目风险加载失败")).toBeVisible();
    await expect(page.getByText("列表数据未加载")).toBeVisible();
    await expect(page.getByText("当前显示 0 条，共 0 条")).toHaveCount(0);
    await expect(page.getByText("风险总数").locator("..").getByText("0")).toHaveCount(0);
  });
});
