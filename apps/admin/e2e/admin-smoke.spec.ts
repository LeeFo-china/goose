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

async function gotoAdminPage(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
}

test.describe("admin smoke", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTenantAdmin(page);
  });

  test("租户管理员可访问组织架构并打开配置岗位弹窗", async ({ page }) => {
    await gotoAdminPage(page, "/dashboard");
    await expect(page.getByText("鹅班长工作台")).toBeVisible();

    await gotoAdminPage(page, "/organization");
    const configurePostButton = page.getByRole("button", { name: /配置岗位/ }).first();
    await expect(configurePostButton).toBeVisible();

    await configurePostButton.click();
    const dialog = page.getByRole("dialog").filter({ hasText: "搜索或新增岗位" });
    await expect(dialog).toBeVisible();

    const searchInput = dialog.getByLabel("搜索或新增岗位");
    await expect(searchInput).toBeVisible();

    const firstExistingPost = dialog.getByRole("option").first();
    await expect(firstExistingPost).toBeVisible();
    const existingPostName = (await firstExistingPost.innerText()).split("\n")[0]?.trim();
    if (!existingPostName) {
      throw new Error("没有找到可用于同名校验的已有岗位");
    }

    await searchInput.fill(existingPostName);
    await expect(dialog.getByText(`创建并加入当前部门：${existingPostName}`)).toHaveCount(0);

    await searchInput.fill("临时验收岗位X");

    await expect(dialog.getByText("创建并加入当前部门：临时验收岗位X")).toBeVisible();
  });

  test("项目新增弹窗保留客户和负责人字段", async ({ page }) => {
    await gotoAdminPage(page, "/projects");

    await page.getByRole("button", { name: "新增项目" }).click();
    const dialog = page.getByRole("dialog").filter({ hasText: "维护项目基础档案" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("项目名称")).toBeVisible();
    await expect(dialog.getByLabel("客户")).toBeVisible();
    await expect(dialog.getByLabel("设计师")).toBeVisible();
    await expect(dialog.getByLabel("工程负责人")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "创建项目" })).toBeVisible();
  });

  test("员工新增和角色配置弹窗可打开", async ({ page }) => {
    await gotoAdminPage(page, "/employees");

    await expect(page.getByRole("heading", { name: "员工管理" })).toBeVisible();
    await page.getByRole("button", { name: "新增员工" }).click();
    const createDialog = page.getByRole("dialog").filter({ hasText: "创建可登录后台或小程序员工身份" });
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByLabel("姓名")).toBeVisible();
    await expect(createDialog.getByLabel("手机号")).toBeVisible();
    await expect(createDialog.getByLabel("部门")).toBeVisible();
    await createDialog.getByRole("button", { name: "取消" }).click();

    const roleButton = page.getByRole("button", { name: "角色" }).first();
    await expect(roleButton).toBeVisible();
    await roleButton.click();
    const roleDialog = page.getByRole("dialog").filter({ hasText: "配置员工角色" });
    await expect(roleDialog).toBeVisible();
    await expect(roleDialog.getByRole("button", { name: "保存角色" })).toBeVisible();
  });

  test("权限点列表展示核心字段", async ({ page }) => {
    await gotoAdminPage(page, "/permissions");

    await expect(page.getByRole("heading", { name: "权限点管理" })).toBeVisible();
    await expect(page.getByText("权限点列表")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "权限" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "模块" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "资源" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "动作" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "状态" })).toBeVisible();
  });

  test("费用审批列表和操作入口可渲染", async ({ page }) => {
    await gotoAdminPage(page, "/expenses");

    await expect(page.getByRole("heading", { name: "费用审批" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "申请", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "处理人", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "操作", exact: true })).toBeVisible();

    const actionButton = page.getByRole("button", { name: "操作" }).first();
    if (await actionButton.count()) {
      await expect(actionButton).toBeVisible();
      if (await actionButton.isEnabled()) {
        await actionButton.click();
        await expect(page.getByRole("menuitem", { name: "详情" })).toBeVisible();
      }
    } else {
      await expect(page.getByText("没有符合条件的费用申请")).toBeVisible();
    }
  });

  test("H5 活动页新建弹窗保留 AI 和基础字段", async ({ page }) => {
    await gotoAdminPage(page, "/marketing?tab=h5");

    await expect(page.getByRole("heading", { name: "营销活动" })).toBeVisible();
    await expect(page.getByText("H5 活动页").first()).toBeVisible();
    await page.getByRole("button", { name: "新建 H5 页面" }).click();
    const dialog = page.getByRole("dialog").filter({ hasText: "新建 H5 活动页" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("活动要求")).toBeVisible();
    await expect(dialog.getByLabel("页面标题")).toBeVisible();
    await expect(dialog.getByLabel("页面描述")).toBeVisible();
    await expect(dialog.getByLabel("展示场景")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "创建" })).toBeVisible();
  });
});
