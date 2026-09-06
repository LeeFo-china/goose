import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

const mock = 'http://127.0.0.1:3988';
async function enter(page: Page, token = 'generic', path = '/customer-leads') {
  await page.context().addCookies([{ name: 'gooes_admin_token', value: token, url: 'http://127.0.0.1:3038' }]);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}
async function openDetail(page: Page) {
  await page.getByRole('button', { name: '查看线索', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '示例客户', exact: true })).toBeVisible();
}
async function state(request: APIRequestContext) {
  const response = await request.get(`${mock}/__test/state`);
  return (await response.json()).data as {
    journal: { path: string; payload: Record<string, unknown> }[];
    reads: string[];
  };
}
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${mock}/__test/reset`, { data: {} })).ok()).toBe(true);
});

test('新入口分页、来源筛选和空状态，窄屏无页面横溢出', async ({ page }, testInfo) => {
  await enter(page);
  await expect(page.getByRole('button', { name: '查看线索', exact: true })).toHaveCount(20);
  await page.screenshot({ path: testInfo.outputPath('customer-leads-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看线索', exact: true })).toHaveCount(1);
  await page.locator('#customer-lead-source').click();
  await page.getByRole('option', { name: '抖音小程序', exact: true }).click();
  await page.locator('#customer-lead-assignment').click();
  await page.getByRole('option', { name: '已分配', exact: true }).click();
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看线索', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/source=douyin_miniapp/);
  await expect(page).toHaveURL(/assignment=assigned/);
  await page.setViewportSize({ width: 390, height: 844 });
  // Wait for the shell's existing responsive padding transition to settle.
  // Overflow hidden alone can conceal a clipped page, so check content geometry.
  await expect.poll(async () => {
    const bounds = await page.getByRole('heading', { name: '客户线索', exact: true }).boundingBox();
    return Boolean(bounds && bounds.x < 100 && bounds.width > 200);
  }).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('customer-leads-mobile.png'), fullPage: true });
});

test('普通跟进可无预约提交，成功后刷新失败仅重试读取', async ({ page, request }, testInfo) => {
  await request.post(`${mock}/__test/reset`, { data: { failRefresh: true } });
  await enter(page);
  await openDetail(page);
  await page.getByRole('button', { name: '记录跟进', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '记录线索跟进', exact: true });
  await expect(dialog.getByText('不关联预约（普通跟进）', { exact: true })).toBeVisible();
  await expect(dialog.locator('#douyin-lead-appointment-status')).toHaveCount(0);
  await dialog.getByLabel('跟进摘要', { exact: true }).fill('浏览器普通跟进');
  await dialog.getByLabel('沟通结果', { exact: true }).fill('下周联系');
  await page.screenshot({ path: testInfo.outputPath('customer-leads-follow-up.png'), fullPage: true });
  await dialog.getByRole('button', { name: '提交跟进记录', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '重新同步最新状态', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '重新同步最新状态', exact: true }).click();
  await expect(dialog).toBeHidden();
  const { journal } = await state(request);
  expect(journal).toHaveLength(1);
  expect(journal[0].payload).toMatchObject({ appointment_id: null, appointment_status: null, confirmed_visit_at: null, expected_lead_version: 1 });
  expect(journal[0].payload.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByText('浏览器普通跟进', { exact: true })).toBeVisible();
});

test('转客户成功但无客户查看权限，不出现客户跳转', async ({ page, request }) => {
  await enter(page);
  await openDetail(page);
  await page.getByRole('button', { name: '转为客户', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认转为客户', exact: true });
  await dialog.getByRole('button', { name: '确认转为客户', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('link', { name: '查看客户', exact: true })).toHaveCount(0);
  expect((await state(request)).journal).toHaveLength(1);
  await expect(page).toHaveURL(/customer-leads/);
});

test('分配后失去详情权限关闭详情，不重复提交', async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { loseAccess: true, failRefresh: true } });
  await enter(page);
  await openDetail(page);
  await page.getByRole('button', { name: '分配负责人', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '分配负责人', exact: true });
  await dialog.locator('#douyin-lead-assignee').click();
  await page.getByRole('option', { name: '示例员工', exact: true }).click();
  await dialog.getByRole('button', { name: '确认分配负责人', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '重新同步最新状态', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '重新同步最新状态', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await state(request)).journal).toHaveLength(1);
});

test('无效操作必填原因，并提交版本与幂等键', async ({ page, request }) => {
  await enter(page);
  await openDetail(page);
  await page.getByRole('button', { name: '判为无效', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认判为无效', exact: true });
  await dialog.getByRole('button', { name: '确认判为无效', exact: true }).click();
  await expect(dialog.getByText('请填写无效原因', { exact: true })).toBeVisible();
  await dialog.getByLabel('无效原因', { exact: true }).fill('暂无装修需求');
  await dialog.getByRole('button', { name: '确认判为无效', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await state(request)).journal[0].payload.reason).toBe('暂无装修需求');
});

test('409 提示刷新且不产生成功写入', async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { conflict: true } });
  await enter(page);
  await openDetail(page);
  await page.getByRole('button', { name: '转为客户', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '确认转为客户', exact: true });
  await dialog.getByRole('button', { name: '确认转为客户', exact: true }).click();
  await expect(dialog.getByText(/线索已更新|刷新后重试/)).toBeVisible();
  await dialog.getByRole('button', { name: '刷新后重新确认', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await state(request)).journal).toHaveLength(0);
});

test('旧抖音权限只开旧入口，旧新增跟进仍要求预约', async ({ page, request }, testInfo) => {
  await enter(page, 'legacy', '/douyin-miniapp/leads');
  await expect(page.getByRole('button', { name: '查看线索', exact: true })).toHaveCount(20);
  await page.screenshot({ path: testInfo.outputPath('douyin-leads-legacy.png'), fullPage: true });
  await openDetail(page);
  await page.getByRole('button', { name: '记录跟进', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '记录线索跟进', exact: true });
  await dialog.getByLabel('跟进摘要', { exact: true }).fill('旧入口跟进');
  await dialog.getByLabel('沟通结果', { exact: true }).fill('尚未预约');
  await dialog.getByRole('button', { name: '提交跟进记录', exact: true }).click();
  await expect(dialog.getByText('请选择量房预约', { exact: true })).toBeVisible();
  expect((await state(request)).journal).toHaveLength(0);
  await page.goto('/customer-leads');
  await expect(page.getByText('当前账号缺少客户线索查看权限', { exact: true })).toBeVisible();
});

test('无 read 权限不加载线索或负责人', async ({ page, request }) => {
  await enter(page, 'none');
  await expect(page.getByText('当前账号缺少客户线索查看权限', { exact: true })).toBeVisible();
  expect((await state(request)).reads).toHaveLength(0);
});

test('H5 旧入口目标直达活动详情，筛选并记录普通跟进', async ({ page, request }, testInfo) => {
  await request.post(`${mock}/__test/reset`, { data: { h5: true } });
  const examples = JSON.parse(readFileSync(new URL('../../../docs/customer-leads-api-examples.json', import.meta.url), 'utf8'));
  const leadId = examples.detail.response.data.id;
  await enter(page, 'generic', `/customer-leads?source=h5&leadId=${leadId}`);
  const sheet = page.getByRole('dialog', { name: '示例客户', exact: true });
  await expect(sheet.getByText('秋季装修活动', { exact: true })).toBeVisible();
  await expect(sheet.getByText('确定性预算', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('h5-lead-detail.png'), fullPage: true });
  await sheet.getByRole('button', { name: '记录跟进', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '记录线索跟进', exact: true });
  await dialog.getByLabel('跟进摘要', { exact: true }).fill('H5 活动电话回访');
  await dialog.getByLabel('沟通结果', { exact: true }).fill('预约沟通设计需求');
  await dialog.getByRole('button', { name: '提交跟进记录', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(sheet.getByText('H5 活动电话回访', { exact: true })).toBeVisible();
  const result = await state(request);
  expect(result.reads).toContain('/tenant/customer-leads?page=1&pageSize=20&source=h5&assignment=all');
  expect(result.journal).toHaveLength(1);
  expect(result.journal[0].payload).toMatchObject({ appointment_id: null, expected_lead_version: 1 });
});

test('全部来源混合分页，H5 和抖音可以分别筛选', async ({ page, request }) => {
  await request.post(`${mock}/__test/reset`, { data: { h5: true } });
  await enter(page);
  await expect(page.getByRole('cell', { name: 'H5活动', exact: true })).toHaveCount(10);
  await expect(page.getByRole('cell', { name: '抖音小程序', exact: true })).toHaveCount(10);
  await page.locator('#customer-lead-source').click();
  await page.getByRole('option', { name: 'H5活动', exact: true }).click();
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'H5活动', exact: true })).toHaveCount(11);
  await expect(page.getByRole('cell', { name: '抖音小程序', exact: true })).toHaveCount(0);
});
