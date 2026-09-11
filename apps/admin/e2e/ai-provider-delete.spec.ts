import { test, expect } from '@playwright/test';

const backend = 'http://127.0.0.1:3989';
const id = '10000000-0000-4000-8000-000000000001';
test.beforeEach(async ({ page, request }) => {
  await request.post(`${backend}/__test/reset`);
  await page.context().addCookies([{ name: 'gooes_admin_token', value: 'synthetic-ai-delete-admin', url: 'http://127.0.0.1:3039' }]);
});

test('取消不删除，确认携带版本且清空编辑状态与列表', async ({ page, request }) => {
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.locator('#ai-route-primary-keyword').fill('尚未保存的模型搜索');
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: '删除供应商 方舟测试', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('共用的 API Key 配置会保留');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toEqual([]);
  await page.getByRole('button', { name: '删除供应商 方舟测试', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('暂无供应商', { exact: true })).toBeVisible();
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue('');
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toEqual([
    { path: `/platform/ai-config/providers/${id}`, input: { expected_version: 1 } },
  ]);
  await page.getByRole('tab', { name: '场景路由', exact: true }).click();
  await expect(page.locator('#ai-route-primary-keyword')).toHaveValue('');
  await expect(page.getByRole('button', { name: '搜索', exact: true }).first()).toBeDisabled();
});

test('关联冲突保留弹窗、显示停用提示且不重复提交，窄屏可操作', async ({ page, request }, info) => {
  await request.post(`${backend}/__test/options`, { data: { delete_error: 'AI_PROVIDER_IN_USE', delete_delay: true } });
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '删除供应商 方舟测试', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: '确认删除', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/请取消后编辑供应商/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeDisabled();
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toHaveLength(1);
  await expect(dialog).not.toContainText('mock private');
  await page.screenshot({ path: info.outputPath('provider-delete-mobile-conflict.png'), fullPage: true });
});

test('只读账号不展示删除入口', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { readonly_delete: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await expect(page.getByRole('cell', { name: '方舟测试 ark', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /删除供应商/ })).toHaveCount(0);
});

test('保存供应商期间禁止开启删除，避免刷新卸载删除弹窗', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { save_delay: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByRole('button', { name: '删除供应商 方舟测试', exact: true })).toBeDisabled();
  await expect(page.getByText('供应商已更新', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '删除供应商 方舟测试', exact: true })).toBeEnabled();
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toHaveLength(1);
});

test('版本冲突要求刷新，弹窗不回显上游错误也不自动重试', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { delete_error: 'AI_CONFIG_VERSION_STALE' } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '删除供应商 方舟测试', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog.getByText('供应商已变更或已被删除，请取消并刷新列表后再操作。')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '确认删除', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('cell', { name: '方舟测试 ark', exact: true })).toBeVisible();
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toHaveLength(1);
});

test('末页最后一条删除后回退上一页', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { paginated: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByRole('button', { name: '删除供应商 方舟测试', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByText('第 1 / 1 页，当前显示 20 条，共 20 条', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '删除供应商 方舟测试', exact: true })).toHaveCount(0);
});

test('删除成功但刷新失败不提示删除失败或再次删除', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { refresh_failure: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '删除供应商 方舟测试', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByText('供应商已删除，但列表刷新失败，请刷新页面。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '删除供应商 方舟测试', exact: true })).toHaveCount(0);
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toHaveLength(1);
});
