import { expect, test, type Page } from "@playwright/test";

const notice = "小程序当前统计主动登录和业务操作，页面浏览待客户端接入";
const detail = "/platform/tenants/11111111-1111-4111-8111-111111111110";
async function enter(page: Page, token: string, path: string) {
  await page.context().addCookies([{ name: "gooes_admin_token", value: token, url: "http://127.0.0.1:3037" }]);
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
async function visibility(page: Page, state: "visible" | "hidden") {
  await page.evaluate((value) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

test("list and flat detail expose states and coverage at desktop and mobile widths", async ({ page, request }, testInfo) => {
  await request.post("http://127.0.0.1:3997/__test/reset");
  await page.setViewportSize({ width: 1720, height: 1100 });
  await enter(page, "platform", "/platform/tenants?pageSize=20");
  await expect(page.getByRole("columnheader", { name: "使用情况", exact: true })).toBeVisible();
  await expect(page.getByText("统计暂不可用", { exact: true })).toBeVisible();
  await expect(page.getByText("尚未采集", { exact: true })).toBeVisible();
  await expect(page.getByText(/采集中 2\/7 天/)).toBeVisible();
  await expect(page.getByText(notice, { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tenant-activity-list.png") });
  await page.goto(detail);
  const section = page.getByRole("region", { name: "使用情况 · 近 7 日" });
  await expect(section.getByText("跨端去重员工", { exact: true })).toBeVisible();
  await expect(section.getByText("8 次", { exact: true })).toBeVisible();
  await section.screenshot({ path: testInfo.outputPath("tenant-activity-detail-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: testInfo.outputPath("tenant-activity-detail-mobile.png") });
  const box = await section.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await section.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect((await (await request.get("http://127.0.0.1:3997/__test/state")).json()).data).toEqual([]);
});

test("visible events only; failed event waits for the next resume, successful view dedups", async ({ page }) => {
  let calls = 0;
  const bodies: unknown[] = [];
  await page.addInitScript(() => Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }));
  await page.route("**/api/backend/tenant-activity/view", async (route) => {
    calls++;
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: calls === 1 ? 503 : 200, contentType: "application/json", body: JSON.stringify(calls === 1 ? { success: false, message: "unavailable" } : { data: { recorded: false }, message: "success" }) });
  });
  await enter(page, "tenant", "/dashboard");
  expect(calls).toBe(0);
  await visibility(page, "visible");
  await expect.poll(() => calls).toBe(1);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.includes("activity-view")))).toEqual([]);
  expect(calls).toBe(1);
  await visibility(page, "hidden");
  await visibility(page, "visible");
  await expect.poll(() => calls).toBe(2);
  await page.waitForLoadState("networkidle");
  await visibility(page, "visible");
  await page.waitForLoadState("networkidle");
  expect(calls).toBe(2);
  expect(bodies).toEqual([{ screen: "dashboard" }, { screen: "dashboard" }]);
  await expect(page.getByRole("heading", { name: "公司概览" })).toBeVisible();
});

test("navigation collects a different screen, and storage survives reload", async ({ page }) => {
  const screens: string[] = [];
  await page.route("**/api/backend/tenant-activity/view", async (route) => {
    screens.push(route.request().postDataJSON().screen);
    await route.fulfill({ json: { data: { recorded: true }, message: "success" } });
  });
  await enter(page, "grace", "/dashboard");
  await expect.poll(() => screens).toEqual(["dashboard"]);
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(screens).toEqual(["dashboard"]);
  await page.getByRole("link", { name: "客户", exact: true }).click();
  await expect.poll(() => screens).toEqual(["dashboard", "customers"]);
  await page.getByRole("link", { name: "概览", exact: true }).click();
  await page.waitForLoadState("networkidle");
  expect(screens).toEqual(["dashboard", "customers"]);
});

test("platform staff, platform pages and service-blocked workspaces never collect", async ({ page }) => {
  const calls: unknown[] = [];
  await page.route("**/api/backend/tenant-activity/view", async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ json: { data: { recorded: true }, message: "success" } });
  });
  for (const [token, path] of [["no-permission", "/dashboard"], ["staff", "/dashboard"], ["tenant", "/platform/tenants"], ["blocked", "/dashboard"]]) {
    await enter(page, token, path);
    await visibility(page, "visible");
    await page.waitForLoadState("networkidle");
    expect(calls).toEqual([]);
  }
});
