import { expect, test, type Page, type APIRequestContext } from "@playwright/test";
import { PLATFORM_SERVICE_TRIAL_FULL_SCOPE, PLATFORM_SERVICE_TRIAL_CAPABILITY_LABELS } from "@gooes/domain";
const mock = "http://127.0.0.1:3997";
async function enter(page: Page, route = "/platform/tenants") {
  await page.context().addCookies([{ name: "gooes_admin_token", value: "synthetic", url: "http://127.0.0.1:3037" }]);
  await page.goto(route);
  await expect(page.getByText("合成范围验收租户", { exact: true }).first()).toBeVisible();
}
async function openScope(page: Page) {
  await page.getByRole("button", { name: "调整试用范围", exact: true }).first().click();
  return page.getByRole("dialog", { name: "调整试用范围", exact: true });
}
async function state(request: APIRequestContext) {
  return (await (await request.get(`${mock}/__test/state`)).json()).data as {
    journal: { path: string; payload: { scope: typeof PLATFORM_SERVICE_TRIAL_FULL_SCOPE; trial?: { scope: typeof PLATFORM_SERVICE_TRIAL_FULL_SCOPE }; expected_version: number; reason: string; idempotency_key: string } }[];
    trial: { trial_ends_at: string; grace_ends_at: string; extension_count: number };
  };
}
test.beforeEach(async ({ request }) => { await request.post(`${mock}/__test/reset`, { data: {} }); });

test("tenant creation defaults full and allows an explicit custom subset", async ({ page, request }) => {
  await enter(page);
  for (const custom of [false, true]) {
    await page.getByRole("button", { name: "新建租户", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "新建租户", exact: true });
    await expect(dialog.getByLabel("范围模式")).toContainText("完整业务");
    await expect(dialog).toContainText("13 个业务模块");
    if (custom) {
      await dialog.getByLabel("范围模式").click();
      await page.getByRole("option", { name: "自定义模块", exact: true }).click();
      await expect(dialog.getByRole("checkbox")).toHaveCount(13);
      await dialog.getByLabel(PLATFORM_SERVICE_TRIAL_CAPABILITY_LABELS["business.ai"], { exact: true }).uncheck();
    }
    await dialog.getByLabel("公司名称", { exact: true }).fill("合成新租户");
    await dialog.getByLabel("管理员姓名", { exact: true }).fill("合成管理员");
    await dialog.getByLabel("管理员手机号", { exact: true }).fill("13000000001");
    await dialog.getByLabel("开通原因", { exact: true }).fill("合成试用");
    await dialog.getByRole("button", { name: "创建租户", exact: true }).click();
    await expect(dialog).toBeHidden();
    const calls = (await state(request)).journal;
    const scope = calls[calls.length - 1].payload.trial?.scope;
    expect(scope?.version).toBe(1);
    expect(scope?.capabilities).toEqual(PLATFORM_SERVICE_TRIAL_FULL_SCOPE.capabilities.filter((item) => !custom || item !== "business.ai"));
  }
});

test("latest version, pending lock and unchanged expiry on mobile despite can_extend false", async ({ page, request }, info) => {
  await request.post(`${mock}/__test/reset`, { data: { delay: true } });
  await enter(page);
  const dialog = await openScope(page);
  // Existing tenant-page summary collapses its table on narrow screens; inspect the dialog independently.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("checkbox")).toHaveCount(13);
  await expect(dialog.getByLabel("范围模式")).toContainText("自定义模块");
  await dialog.getByLabel("范围模式").click();
  await page.getByRole("option", { name: "完整业务", exact: true }).click();
  await dialog.getByLabel("调整原因").fill("补齐业务");
  await page.screenshot({ path: info.outputPath("scope-mobile.png") });
  const box = await dialog.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  await dialog.locator("form").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByLabel("调整原因")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeHidden();
  const result = await state(request);
  expect(result.journal).toHaveLength(1);
  expect(result.journal[0].payload).toEqual({ scope: PLATFORM_SERVICE_TRIAL_FULL_SCOPE, expected_version: 7, reason: "补齐业务", idempotency_key: expect.any(String) });
  expect(result.trial).toMatchObject({ trial_ends_at: "2026-10-31T00:00:00Z", grace_ends_at: "2026-11-07T00:00:00Z", extension_count: 2 });
});

test("load failure retries; denied scope action never submits", async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { denied: true, loadFailure: true } });
  await enter(page);
  const dialog = await openScope(page);
  await expect(dialog.getByRole("alert").first()).toContainText("合成详情加载失败");
  await dialog.getByRole("button", { name: "重新加载最新范围" }).click();
  await expect(dialog).toContainText("无试用管理权限");
  await expect(dialog.getByRole("button", { name: "确认调整范围" })).toBeDisabled();
  expect((await state(request)).journal).toHaveLength(0);
});

test("conflict requires reload and a new explicit submit with current version", async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { conflict: true } });
  await enter(page);
  const dialog = await openScope(page);
  await dialog.getByLabel("调整原因").fill("调整业务");
  await dialog.getByRole("button", { name: "确认调整范围" }).click();
  await expect(dialog).toContainText("记录版本已变化");
  await expect(dialog.getByRole("button", { name: "确认调整范围" })).toBeDisabled();
  await dialog.getByRole("button", { name: "重新加载最新范围" }).click();
  await dialog.getByRole("button", { name: "确认调整范围" }).click();
  await expect(dialog).toBeHidden();
  const calls = (await state(request)).journal;
  expect(calls.map((call) => call.payload.expected_version)).toEqual([7, 8]);
  expect(calls[0].payload.idempotency_key).not.toBe(calls[1].payload.idempotency_key);
});

test("failed identical retry keeps key; edited scope creates new intent", async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { failure: true } });
  await enter(page);
  const dialog = await openScope(page);
  await dialog.getByLabel("调整原因").fill("调整业务");
  for (let index = 0; index < 2; index++) {
    await dialog.getByRole("button", { name: "确认调整范围" }).click();
    await expect(dialog).toContainText("合成保存失败");
  }
  await dialog.getByLabel(PLATFORM_SERVICE_TRIAL_CAPABILITY_LABELS["business.ai"], { exact: true }).check();
  await dialog.getByRole("button", { name: "确认调整范围" }).click();
  await expect(dialog).toContainText("合成保存失败");
  const calls = (await state(request)).journal;
  expect(calls).toHaveLength(3);
  expect(calls[0].payload.idempotency_key).toBe(calls[1].payload.idempotency_key);
  expect(calls[2].payload.idempotency_key).not.toBe(calls[1].payload.idempotency_key);
});

test("trial list, detail, grant, approval and both policy scopes reuse full catalog", async ({ page }) => {
  await enter(page, "/platform/service-orders?tab=trials");
  const scope = await openScope(page);
  await expect(scope.getByRole("checkbox")).toHaveCount(13);
  await scope.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "主动开通试用", exact: true }).click();
  const grant = page.getByRole("dialog", { name: "主动开通试用", exact: true });
  await expect(grant.getByLabel("范围模式")).toContainText("完整业务");
  await grant.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "试用规则", exact: true }).click();
  const policy = page.getByRole("dialog", { name: "技术服务试用规则" });
  await expect(policy.getByRole("checkbox")).toHaveCount(26);
  await policy.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "查看", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "合成范围验收租户", exact: true });
  await expect(detail.getByRole("button", { name: "调整试用范围" })).toBeVisible();
  await detail.getByRole("button", { name: "通过", exact: true }).click();
  const approval = page.getByRole("dialog", { name: "通过试用申请" });
  await expect(approval.getByRole("checkbox")).toHaveCount(13);
});
