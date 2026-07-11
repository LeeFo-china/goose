import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const tenantAdminPhone =
  process.env.GOOES_E2E_TENANT_ADMIN_PHONE || "18800000001";
const platformAdminPhone =
  process.env.GOOES_E2E_PLATFORM_ADMIN_PHONE || "18637605353";

async function loginAsTenantAdmin(page: Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: {
      phone: tenantAdminPhone,
      code: "",
    },
  });
  expect(loginResponse.ok()).toBe(true);
}

async function loginAsPlatformAdmin(page: Page) {
  const loginResponse = await page.request.post("/api/auth/login", {
    data: {
      phone: platformAdminPhone,
      code: "",
    },
  });
  expect(loginResponse.ok()).toBe(true);
}

test("租户系统配置页使用响应式双栏工作台", async ({ page }) => {
  await loginAsTenantAdmin(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("heading", { name: "租户系统配置", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("管理本租户使用的短信服务和客服入口。", {
      exact: false,
    }),
  ).toBeVisible();

  const groupTabs = page.getByRole("tablist", {
    name: "租户系统配置分组",
  });
  await expect(groupTabs).toHaveAttribute("aria-orientation", "vertical");
  await expect(page.getByRole("tab", { name: /短信配置/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /客服配置/ })).toBeVisible();
  await expect(page.getByLabel("发送通道")).toBeVisible();

  await page.getByRole("tab", { name: /客服配置/ }).click();
  await expect(page).toHaveURL(/\/settings\?group=customer_service$/);
  await expect(
    page.getByText("维护客户可见的客服入口与联系方式。"),
  ).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(groupTabs).toHaveAttribute("aria-orientation", "horizontal");
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("平台系统配置页保留原有运维工作台", async ({ page }) => {
  await loginAsPlatformAdmin(page);
  await page.goto("/settings", { waitUntil: "networkidle" });

  await expect(
    page.getByRole("heading", { name: "平台系统配置", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("数据库覆盖", { exact: true })).toBeVisible();
  await expect(page.getByText("环境变量回退", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "系统配置分组" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /支付配置/ })).toBeVisible();
  await expect(
    page.getByRole("tablist", { name: "租户系统配置分组" }),
  ).toHaveCount(0);
});
