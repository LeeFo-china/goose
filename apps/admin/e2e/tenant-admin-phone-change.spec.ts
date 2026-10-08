import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const mock = "http://127.0.0.1:3996";
const route = "/platform/tenants/11111111-1111-4111-8111-111111111111";
async function enter(page: Page, token = "manage") {
  await page.context().addCookies([{ name: "gooes_admin_token", value: token, url: "http://127.0.0.1:3036" }]);
  await page.goto(route);
  await expect(page.getByText("当前租户管理员", { exact: true })).toBeVisible();
}
async function open(page: Page, name = "合成管理员1") {
  await page.getByRole("row").filter({ has: page.getByText(name, { exact: true }) }).getByRole("button", { name: "变更登录手机号" }).click();
  return page.getByRole("dialog", { name: "变更登录手机号" });
}
async function fill(dialog: Locator) {
  await dialog.getByLabel("新手机号", { exact: true }).fill("13000000002");
  await dialog.getByLabel("变更原因", { exact: true }).fill("本人换号，合成验收");
  await dialog.getByLabel("已核实管理员本人未变更").check();
}
async function mutations(request: APIRequestContext) {
  const state = (await (await request.get(`${mock}/__test/state`)).json()).data as {
    journal: { path: string; payload?: Record<string, unknown> }[];
  };
  return state.journal.filter((item) => item.payload);
}
test.afterEach(async ({ request }) => {
  expect((await mutations(request)).filter((item) => item.path.endsWith("/send-code"))).toHaveLength(0);
});
test.beforeEach(async ({ request }) => { await request.post(`${mock}/__test/reset`, { data: {} }); });

test("无需验证码直接成功、保留分页及独立初始化信息", async ({ page, request }, testInfo) => {
  await enter(page);
  await expect(page.getByText("初始化管理员（历史）", { exact: true })).toBeVisible();
  await expect(page.getByText(/共 21 位管理员/)).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(21);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByText(/第 2 \/ 2 页/)).toBeVisible();
  const dialog = await open(page, "合成管理员21");
  await expect(dialog).toContainText("合成管理员21");
  await expect(dialog).toContainText("本人微信绑定保留");
  await fill(dialog);
  await expect(dialog.getByRole("button", { name: /验证码|重发/ })).toHaveCount(0);
  await expect(dialog.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "确认变更", exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("phone-change-desktop.png") });
  await dialog.getByRole("button", { name: "确认变更", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/登录手机号已变更为 130\*\*\*\*0002/)).toBeVisible();
  await expect(page.getByText(/第 2 \/ 2 页/)).toBeVisible();
  const calls = await mutations(request);
  expect(calls).toHaveLength(1);
  expect(calls[0].path).toBe(`${route}/admins/22222222-2222-4222-8222-000000000021/phone-change/confirm`);
  expect(calls[0].payload).toEqual({ new_phone: "13000000002", expected_version: 7,
    reason: "本人换号，合成验收", same_person_confirmed: true, idempotency_key: expect.any(String) });
});

test("API 权限、禁用原因和空列表", async ({ page, request }) => {
  await enter(page, "read");
  await expect(page.getByRole("button", { name: "变更登录手机号" })).toHaveCount(0);
  await expect(page.getByText("仅平台超管可变更").first()).toBeVisible();
  await request.post(`${mock}/__test/reset`, { data: { empty: true } });
  await page.getByRole("button", { name: "刷新列表" }).click();
  await expect(page.getByText("暂无当前管理员", { exact: true })).toBeVisible();
  await expect(page.getByText(/共 0 位管理员/)).toBeVisible();
  expect(await mutations(request)).toHaveLength(0);
});

test("号码、原因和本人确认必填；移动端弹窗可操作", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const dialog = await open(page);
  await fill(dialog);
  await dialog.getByLabel("已核实管理员本人未变更").uncheck();
  await expect(dialog.getByRole("button", { name: "确认变更", exact: true })).toBeDisabled();
  await dialog.getByLabel("已核实管理员本人未变更").check();
  await dialog.getByLabel("变更原因", { exact: true }).fill(" ");
  await expect(dialog.getByRole("button", { name: "确认变更", exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("变更原因", { exact: true })).toHaveAttribute("maxlength", "500");
  await dialog.getByLabel("新手机号", { exact: true }).fill("13000000003");
  await dialog.getByLabel("变更原因", { exact: true }).fill("本人换号");
  await expect(dialog.getByRole("button", { name: "确认变更", exact: true })).toBeEnabled();
  await dialog.getByLabel("新手机号", { exact: true }).fill("123");
  await expect(dialog.getByRole("button", { name: "确认变更", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /验证码|重发/ })).toHaveCount(0);
  await expect(dialog.locator('input[autocomplete="one-time-code"]')).toHaveCount(0);
  const box = await dialog.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("phone-change-mobile.png") });
});

test("提交时锁定输入和关闭，阻止重复提交", async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { delay: true } });
  await enter(page);
  const dialog = await open(page);
  await fill(dialog);
  await dialog.locator("form").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByLabel("新手机号", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("变更原因", { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("已核实管理员本人未变更")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeHidden();
  expect((await mutations(request)).filter((item) => item.path.endsWith("/confirm"))).toHaveLength(1);
});

test("未知提交结果重试完整原请求且不重复变更", async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { unknown: true } });
  await enter(page);
  const dialog = await open(page);
  await fill(dialog);
  await dialog.getByRole("button", { name: "确认变更", exact: true }).click();
  await expect(dialog.getByText("变更结果尚未确认", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "重试原请求", exact: true }).click();
  await expect(dialog).toBeHidden();
  const calls = (await mutations(request)).filter((item) => item.path.endsWith("/confirm"));
  expect(calls).toHaveLength(2);
  expect(calls[0].payload).toEqual(calls[1].payload);
  const state = (await (await request.get(`${mock}/__test/state`)).json()).data;
  expect(state.admins[0].version).toBe(8);
  expect(state.admins[0].phone_masked).toBe("130****0002");
});

test("409 必须刷新版本并重新确认本人", async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { conflict: true } });
  await enter(page);
  const dialog = await open(page);
  await fill(dialog);
  await dialog.getByRole("button", { name: "确认变更", exact: true }).click();
  await expect(dialog.getByText("请刷新后重新确认", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "确认变更", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "刷新管理员资料", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "确认变更", exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("已核实管理员本人未变更")).not.toBeChecked();
  await fill(dialog);
  await dialog.getByRole("button", { name: "确认变更", exact: true }).click();
  await expect(dialog).toBeHidden();
  const calls = (await mutations(request)).filter((item) => item.path.endsWith("/confirm"));
  expect(calls[1].payload?.expected_version).toBe(8);
  expect(calls).toHaveLength(2);
  expect(calls[0].payload?.idempotency_key).not.toBe(calls[1].payload?.idempotency_key);
});

test("列表加载失败可恢复", async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { listFailure: true } });
  await enter(page);
  await expect(page.getByText(/合成列表加载失败/)).toBeVisible();
  await page.getByRole("button", { name: "刷新列表" }).click();
  await expect(page.getByText(/共 21 位管理员/)).toBeVisible();
});
