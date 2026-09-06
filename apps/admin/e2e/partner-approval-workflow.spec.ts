import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const mock = 'http://127.0.0.1:3989';
const route = '/platform/partners?tab=partners&partnerPageSize=6';
async function enter(page: Page, token = 'manage') {
  await page.context().addCookies([{ name: 'gooes_admin_token', value: token, url: 'http://127.0.0.1:3039' }]);
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('审核验收合伙人', { exact: true })).toBeVisible();
}
async function state(request: APIRequestContext) {
  return (await (await request.get(`${mock}/__test/state`)).json()).data as {
    partner: { status: string; contract_status: string; settlement_account_status: string };
    journal: { path: string; payload: Record<string, unknown> }[];
  };
}
async function openApproval(page: Page) {
  await page.getByRole('button', { name: '审核通过', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '审核通过并启用', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mock}/__test/reset`, { data: {} })).ok()).toBe(true);
});

test('审核入口、核对信息和取消不产生写入', async ({ page, request }, testInfo) => {
  await enter(page);
  const dialog = await openApproval(page);
  for (const text of ['审核验收合伙人', '验收联系人', '13000000001', '固始县']) {
    await expect(dialog).toContainText(text);
  }
  await expect(dialog).toContainText('备注');
  await page.screenshot({ path: testInfo.outputPath('approval-desktop.png'), fullPage: true });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await state(request)).journal).toHaveLength(0);
});

test('重复提交只写一次，审核成功刷新原分页并隐藏入口', async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { delay: true } });
  await enter(page);
  const dialog = await openApproval(page);
  await dialog.getByLabel('审核说明', { exact: true }).fill('  平台确认审核通过  ');
  await dialog.locator('form').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByRole('button', { name: '审核通过并启用', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: '审核通过', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(route);
  const result = await state(request);
  expect(result.journal).toEqual([{ path: '/platform/partners/11111111-1111-4111-8111-111111111111/status', payload: { status: 'active', reason: '平台确认审核通过' } }]);
  expect(result.partner).toMatchObject({ status: 'active', contract_status: 'pending', settlement_account_status: 'pending' });
});

test('无管理权限及非待审核状态不展示审核入口', async ({ page, request }) => {
  await enter(page, 'read');
  await expect(page.getByRole('button', { name: '审核通过', exact: true })).toHaveCount(0);
  for (const status of ['active', 'suspended', 'terminated']) {
    await request.post(`${mock}/__test/reset`, { data: { status } });
    await enter(page);
    await expect(page.getByRole('button', { name: '审核通过', exact: true })).toHaveCount(0);
  }
  expect((await state(request)).journal).toHaveLength(0);
});

test('审核说明必填并限制长度，纯空白不能审核成功', async ({ page, request }) => {
  await enter(page);
  const dialog = await openApproval(page);
  const reason = dialog.getByLabel('审核说明', { exact: true });
  await expect(reason).toHaveAttribute('maxlength', '300');
  await reason.fill('');
  await dialog.getByRole('button', { name: '审核通过并启用', exact: true }).click();
  expect((await state(request)).journal).toHaveLength(0);
  await reason.fill('   ');
  await dialog.getByRole('button', { name: '审核通过并启用', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog).toBeVisible();
  expect((await state(request)).partner.status).toBe('pending');
});

for (const failure of [{ conflict: true, message: '该区县已有启用的合伙人' }, { forbidden: true, message: '缺少合伙人管理权限' }]) {
  test(`服务端拒绝保留输入：${failure.message}`, async ({ page, request }) => {
    await request.post(`${mock}/__test/reset`, { data: failure });
    await enter(page);
    const dialog = await openApproval(page);
    const reason = dialog.getByLabel('审核说明', { exact: true });
    await reason.fill('保留审核说明');
    await dialog.getByRole('button', { name: '审核通过并启用', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(failure.message);
    await expect(reason).toHaveValue('保留审核说明');
    await expect(dialog.getByRole('button', { name: '审核通过并启用', exact: true })).toBeEnabled();
    expect((await state(request)).partner.status).toBe('pending');
    // Simulate operator fixing the external condition, then explicitly retry.
    await request.post(`${mock}/__test/reset`, { data: {} });
    await dialog.getByRole('button', { name: '审核通过并启用', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await state(request)).journal).toHaveLength(1);
  });
}

test('无区县阻止审核，窄屏弹窗可完整操作', async ({ page, request }, testInfo) => {
  await request.post(`${mock}/__test/reset`, { data: { noRegion: true } });
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  const dialog = await openApproval(page);
  await expect(dialog).toContainText('未配置运营区县');
  await dialog.getByLabel('审核说明', { exact: true }).fill('区域尚未配置');
  await expect(dialog.getByRole('button', { name: '审核通过并启用', exact: true })).toBeDisabled();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  if (box) { expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390); }
  await page.screenshot({ path: testInfo.outputPath('approval-mobile.png'), fullPage: true });
  expect((await state(request)).journal).toHaveLength(0);
});
