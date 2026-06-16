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

  test("项目详情独立页默认展示工序验收工作区", async ({ page }) => {
    await gotoAdminPage(page, "/projects");

    const emptyState = page.getByText("没有符合条件的项目");
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
      return;
    }

    const detailLink = page.getByRole("link", { name: "详情" }).first();
    await expect(detailLink).toBeVisible();
    await detailLink.click();
    await expect(page).toHaveURL(/\/projects\/[^/?]+(?:\?tab=acceptances(?:&acceptanceId=[^&]+)?)?$/);
    await expect(page.getByRole("heading", { name: "工序验收" })).toBeVisible();
    await expect(page.getByText("项目档案")).toBeVisible();
    await expect(page.getByText(/验收记录|暂无验收记录|当前无可发起的工序验收/)).toBeVisible();
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

  test("微信换绑审核页可打开", async ({ page }) => {
    await gotoAdminPage(page, "/wechat-rebind-requests");

    await expect(page.getByRole("heading", { name: "微信换绑审核" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "申请人" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "目标身份" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "状态" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "操作" })).toBeVisible();
    await expect(page.getByText("服务器内部错误")).toHaveCount(0);
  });

  test("角色权限配置页可打开", async ({ page }) => {
    await gotoAdminPage(page, "/roles");

    await expect(page.getByRole("heading", { name: "角色管理" })).toBeVisible();
    await expect(page.getByText("角色列表")).toBeVisible();

    const permissionLink = page.getByRole("table").getByRole("link", {
      name: "权限",
      exact: true,
    }).first();
    if (await permissionLink.count()) {
      await expect(permissionLink).toBeVisible();
      await permissionLink.click();
      await expect(page).toHaveURL(/\/roles\/[^/?]+\/permissions$/);
      await expect(page.getByRole("heading", { name: "配置角色权限" })).toBeVisible();
      await expect(page.getByRole("button", { name: "保存权限" })).toBeVisible();
    } else {
      await expect(page.getByText("还没有创建角色")).toBeVisible();
    }
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

  test("摄像头资产页基础区域可渲染", async ({ page }) => {
    await gotoAdminPage(page, "/cameras");

    await expect(page.getByRole("heading", { name: "工地监控" })).toBeVisible();
    await expect(page.getByText(/尚未绑定项目摄像头|未绑定设备通道/)).toBeVisible();

    const devicesTab = page.getByRole("tab", { name: "设备接入" });
    if (await devicesTab.count()) {
      await devicesTab.click();
      const assetHeading = page.getByRole("heading", { name: "设备资产池" });
      if (await assetHeading.count()) {
        await expect(assetHeading).toBeVisible();
      } else {
        await expect(page.getByText("暂无设备接入上下文")).toBeVisible();
      }
    } else {
      await expect(page.getByText(/暂无可管理项目|缺少登录凭证/)).toBeVisible();
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

  test("租户用量页基础区域可渲染", async ({ page }) => {
    await gotoAdminPage(page, "/usage");

    await expect(page.getByRole("heading", { name: "用量统计" })).toBeVisible();
    await expect(page.getByText("本租户用量")).toBeVisible();
    await expect(page.getByRole("tab", { name: "用量概览" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "AI 明细" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "短信明细" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "短视频明细" })).toBeVisible();
  });

  test("平台用量页租户账号展示访问提示", async ({ page }) => {
    await gotoAdminPage(page, "/platform/usage");

    await expect(page.getByRole("heading", { name: "用量统计" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "平台用量" })).toBeVisible();
    await expect(page.getByText("当前账号不是平台超管，无法访问平台用量统计")).toBeVisible();
  });

  test("营销活动页 H5 线索入口可渲染", async ({ page }) => {
    await gotoAdminPage(page, "/marketing?tab=h5-leads");

    await expect(page.getByRole("heading", { name: "营销活动" })).toBeVisible();
    await expect(page.getByText("H5 线索").first()).toBeVisible();
    await expect(page.getByText(/线索|提交时间|跟进/).first()).toBeVisible();
  });
});
