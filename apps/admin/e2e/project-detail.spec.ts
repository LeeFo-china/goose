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

async function getFirstProjectId(page: Page) {
  const response = await page.request.get("/api/backend/projects?page=1&pageSize=1");
  expect(response.ok()).toBe(true);

  const payload = await response.json() as {
    data?: { list?: Array<{ id?: unknown }> };
  };
  const projectId = payload.data?.list?.[0]?.id;
  expect(typeof projectId).toBe("string");
  return projectId as string;
}

test.describe("project detail", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTenantAdmin(page);
  });

  test("项目详情页可以打开并结束骨架屏加载", async ({ page }) => {
    test.setTimeout(60_000);

    const projectId = await getFirstProjectId(page);
    await page.goto(`/projects/${projectId}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });

    await expect(page.getByTestId("project-detail-workspace"))
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("project-detail-content").getByRole("heading", {
      name: "工序验收",
    }))
      .toBeVisible();
    await expect.poll(
      () => page.locator("[data-slot='skeleton'], .animate-pulse").count(),
      { timeout: 25_000 },
    ).toBe(0);
  });
});
