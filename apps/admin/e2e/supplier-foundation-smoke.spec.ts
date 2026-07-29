import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const tenantAdminPhone =
  process.env.GOOES_E2E_TENANT_ADMIN_PHONE || "18800000001";
const platformAdminPhone =
  process.env.GOOES_E2E_PLATFORM_ADMIN_PHONE || "18637605353";

async function login(page: Page, phone: string) {
  const response = await page.request.post("/api/auth/login", {
    data: { phone, code: "" },
  });
  expect(response.ok()).toBe(true);
}

async function loginAsPlatformAdmin(page: Page) {
  await login(page, platformAdminPhone);
}

async function loginAsTenantAdmin(page: Page) {
  await login(page, tenantAdminPhone);
}

async function isVisible(locator: Locator) {
  return await locator.count() > 0 && await locator.first().isVisible();
}

test.describe("供应商 Phase 0 平台工作台", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPlatformAdmin(page);
  });

  test("平台供应商列表可打开新增弹窗且不直接编辑状态", async ({ page }) => {
    await page.goto("/platform/suppliers", { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { name: "供应商管理", level: 1 }),
    ).toBeVisible();

    const denied = page.getByText("当前账号缺少供应商查看权限");
    test.skip(await isVisible(denied), "平台测试账号缺少 platform.supplier.view");

    const createButton = page.getByRole("button", { name: "新增供应商" });
    test.skip(
      !await isVisible(createButton),
      "平台测试账号缺少 platform.supplier.manage",
    );

    await createButton.click();
    const dialog = page.getByRole("dialog").filter({ hasText: "新增供应商" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("先上传营业执照识别主体信息")).toBeVisible();
    await expect(dialog.getByText("营业执照", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "上传并识别" })).toBeVisible();
    await expect(dialog.getByLabel("供应商名称")).toBeVisible();
    await expect(dialog.getByLabel("供应商类型")).toBeVisible();
    await expect(dialog.getByLabel("统一社会信用代码")).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "主要联系人" }),
    ).toBeVisible();
    await expect(dialog.getByLabel("联系人姓名")).toBeVisible();
    await expect(dialog.getByLabel("联系方式")).toBeVisible();
    await expect(dialog.getByLabel(/准入状态|运营状态|供应商状态/)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "创建供应商" })).toBeVisible();
  });

  test("供应标准目录可切换视图并打开三个新建弹窗", async ({ page }) => {
    await page.goto("/platform/catalog", { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { name: "供应标准目录", level: 1 }),
    ).toBeVisible();

    const denied = page.getByText("当前账号缺少供应标准目录管理权限");
    test.skip(await isVisible(denied), "平台测试账号缺少 platform.catalog.manage");

    const tablist = page.getByRole("tablist");
    await expect(tablist.getByRole("tab", { name: "标准类目" })).toBeVisible();
    await page.getByRole("button", { name: "新建类目" }).click();
    const categoryDialog = page.getByRole("dialog", {
      name: "新建标准类目",
    });
    await expect(categoryDialog).toBeVisible();
    await categoryDialog.getByRole("button", { name: "取消编辑" }).click();
    await expect(categoryDialog).toBeHidden();

    await tablist.getByRole("tab", { name: "品牌" }).click();
    await expect.poll(() =>
      new URL(page.url()).searchParams.get("view")
    ).toBe("brands");
    await expect(page.getByRole("tab", { name: "品牌" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await page.getByRole("button", { name: "新建品牌" }).click();
    const brandDialog = page.getByRole("dialog", { name: "新建品牌" });
    await expect(brandDialog).toBeVisible();
    await brandDialog.getByRole("button", { name: "取消编辑" }).click();
    await expect(brandDialog).toBeHidden();

    await page.getByRole("tab", { name: "单位" }).click();
    await expect.poll(() =>
      new URL(page.url()).searchParams.get("view")
    ).toBe("units");
    await expect(page.getByRole("tab", { name: "单位" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await page.getByRole("button", { name: "新建单位" }).click();
    const unitDialog = page.getByRole("dialog", { name: "新建单位" });
    await expect(unitDialog).toBeVisible();
    await unitDialog.getByRole("button", { name: "取消编辑" }).click();
    await expect(unitDialog).toBeHidden();

    await page.getByRole("tab", { name: "标准类目" }).click();
    await expect.poll(() => ({
      pathname: new URL(page.url()).pathname,
      view: new URL(page.url()).searchParams.get("view"),
    })).toEqual({ pathname: "/platform/catalog", view: null });
  });

  test("租户详情展示供应商模块 rollout 配置", async ({ page }) => {
    await page.goto("/platform/tenants", { waitUntil: "load" });
    const tenantLink = page.getByRole("link", { name: "查看" }).first();
    test.skip(
      !await isVisible(tenantLink),
      "没有可用于只读核查的租户，或平台测试账号无租户查看权限",
    );

    await tenantLink.click();
    await expect(page).toHaveURL(/\/platform\/tenants\/[^/?]+$/);

    const supplierModuleTitle = page.getByText("供应商模块", { exact: true });
    test.skip(
      !await isVisible(supplierModuleTitle),
      "平台测试账号缺少 platform.supplier.view",
    );
    await expect(supplierModuleTitle).toBeVisible();
    await expect(
      page.getByText("控制该租户是否可建立供应商合作关系。", {
        exact: false,
      }),
    ).toBeVisible();
  });
});

test.describe("供应商 Phase 0 租户工作台", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTenantAdmin(page);
  });

  test("按 rollout 状态展示停用态或分页列表，且不暴露价格字段", async ({ page }) => {
    await page.goto("/suppliers", { waitUntil: "load" });

    const denied = page.getByText(/没有 supplier\.view 权限/);
    const disabled = page.getByText("供应商模块尚未启用", { exact: true });
    const search = page.getByLabel("搜索合作供应商");
    await expect.poll(async () =>
      Number(await isVisible(denied)) +
      Number(await isVisible(disabled)) +
      Number(await isVisible(search))
    ).toBeGreaterThan(0);

    test.skip(await isVisible(denied), "租户测试账号缺少 supplier.view");
    await expect(
      page.getByRole("heading", { name: "合作供应商", level: 1 }),
    ).toBeVisible();

    if (await isVisible(disabled)) {
      await expect(
        page.getByText("当前页面为只读状态，不会加载供应商列表或目录。", {
          exact: false,
        }),
      ).toBeVisible();
    } else {
      await expect(search).toBeVisible();
      await expect(page.getByText(/第 \d+ \/ \d+ 页，共 \d+ 个合作供应商/))
        .toBeVisible();
    }

    await expect(page.getByText(/成本价|展示价|结算价/)).toHaveCount(0);
  });

  test("模块启用时添加供应商弹窗使用服务端分页目录", async ({ page }) => {
    await page.goto("/suppliers", { waitUntil: "load" });

    const denied = page.getByText(/没有 supplier\.view 权限/);
    const disabled = page.getByText("供应商模块尚未启用", { exact: true });
    const addButton = page.getByRole("button", { name: "添加合作供应商" });
    await expect.poll(async () =>
      Number(await isVisible(denied)) +
      Number(await isVisible(disabled)) +
      Number(await isVisible(addButton))
    ).toBeGreaterThan(0);

    test.skip(await isVisible(denied), "租户测试账号缺少 supplier.view");
    test.skip(await isVisible(disabled), "当前租户尚未 rollout 供应商模块");
    test.skip(
      !await isVisible(addButton),
      "租户测试账号缺少 supplier.manage",
    );

    const directoryResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/api/backend/suppliers/directory") &&
        url.searchParams.get("page") === "1" &&
        url.searchParams.get("pageSize") === "10";
    });
    await addButton.click();
    expect((await directoryResponse).ok()).toBe(true);

    const dialog = page.getByRole("dialog").filter({
      hasText: "添加合作供应商",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("搜索供应商")).toBeVisible();
    await expect(dialog.getByText(/第 1 \/ \d+ 页，共 \d+ 个/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "上一页" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "下一页" })).toBeVisible();
    await expect(dialog.getByText(/成本价|展示价|结算价/)).toHaveCount(0);
  });
});
