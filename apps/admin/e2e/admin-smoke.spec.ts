import { expect, test } from "@playwright/test";

const tenantAdminPhone = process.env.GOOES_E2E_TENANT_ADMIN_PHONE || "18800000001";

test.describe("admin smoke", () => {
  test("租户管理员可访问组织架构并打开配置岗位弹窗", async ({ page }) => {
    const loginResponse = await page.request.post("/api/auth/login", {
      data: {
        phone: tenantAdminPhone,
        code: "",
      },
    });
    expect(loginResponse.ok()).toBe(true);

    await page.goto("/dashboard");
    await expect(page.getByText("鹅班长工作台")).toBeVisible();

    await page.goto("/organization");
    await page.waitForLoadState("networkidle");
    const configurePostButton = page.getByRole("button", { name: /配置岗位/ }).first();
    await expect(configurePostButton).toBeVisible();

    await configurePostButton.click();
    const dialog = page.getByRole("dialog").filter({ hasText: "搜索或新增岗位" });
    await expect(dialog).toBeVisible();

    const searchInput = dialog.getByLabel("搜索或新增岗位");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("临时验收岗位X");

    await expect(dialog.getByText("创建并加入当前部门：临时验收岗位X")).toBeVisible();
  });
});
