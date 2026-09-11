import { test, expect } from '@playwright/test';

const backend = 'http://127.0.0.1:3989';
test.beforeEach(async ({ page, request }) => {
  await request.post(`${backend}/__test/reset`);
  await page.context().addCookies([{ name: 'gooes_admin_token', value: 'synthetic-ai-secret-admin', url: 'http://127.0.0.1:3039' }]);
});

test('真实密钥独立保存，空白不写，关闭清空，结果未验证', async ({ page, request }, info) => {
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: '配置密钥', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '保存密钥', exact: true })).toBeDisabled();
  await dialog.getByLabel('真实 API Key').fill('discard-this-synthetic-value');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '配置密钥', exact: true }).click();
  await expect(dialog.getByLabel('真实 API Key')).toHaveValue('');
  await dialog.getByLabel('真实 API Key').fill('synthetic-new-value');
  await dialog.getByRole('button', { name: '保存密钥', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('已配置（未验证）', { exact: true })).toBeVisible();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes).toEqual([{ path: '/platform/ai-config/secret-settings/ARK_API_KEY', nonempty: true }]);
  const response = await page.request.get('/api/backend/platform/ai-config/secret-settings');
  expect(response.headers()['cache-control']).toBe('private, no-store');
  await page.screenshot({ path: info.outputPath('provider-secret-configured.png'), fullPage: true });
});

test('新引用保存前禁止改密钥，失败不自动重试，窄屏弹窗可操作', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('combobox', { name: '密钥配置', exact: true }).click();
  await page.getByRole('option', { name: 'DeepSeek 接口密钥', exact: true }).click();
  await expect(page.getByRole('button', { name: '配置密钥', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByRole('button', { name: '配置密钥', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await request.post(`${backend}/__test/options`, { data: { write_failure: true } });
  await dialog.getByLabel('真实 API Key').fill('synthetic-failure-value');
  await dialog.getByRole('button', { name: '保存密钥', exact: true }).click();
  await expect(dialog.getByText(/保存未确认/)).toBeVisible();
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('provider-secret-mobile-error.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('只读、无权限和状态失败不会破坏供应商列表', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { readonly: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByText('当前账号没有更换密钥的权限。')).toBeVisible();
  await expect(page.getByRole('button', { name: '配置密钥', exact: true })).toHaveCount(0);
  await request.post(`${backend}/__test/options`, { data: { denied: true } });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await expect(page.getByText(/没有查看密钥配置的权限/)).toBeVisible();
  await expect(page.getByRole('cell', { name: '方舟测试 ark', exact: true })).toBeVisible();
  await request.post(`${backend}/__test/options`, { data: { denied: false, load_failure: true } });
  await page.getByRole('button', { name: '重新加载密钥状态' }).click();
  await expect(page.getByText('密钥配置状态加载失败，请重试。')).toBeVisible();
  await request.post(`${backend}/__test/options`, { data: { load_failure: false } });
  await page.getByRole('button', { name: '重新加载密钥状态' }).click();
  await expect(page.getByText('密钥配置状态加载失败，请重试。')).toHaveCount(0);
});

test('系统配置页 AI 空白不清空，非 AI 保留原有清空行为', async ({ page, request }) => {
  await page.goto('/settings?group=ai', { waitUntil: 'networkidle' });
  const input = page.locator('#setting-ARK_API_KEY');
  await expect(input).toHaveValue('');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await input.fill('  ');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toHaveLength(0);
  await input.fill('synthetic-replacement');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.goto('/settings?group=sms', { waitUntil: 'networkidle' });
  await expect(page.locator('#setting-SMS_TEST_SECRET')).toHaveValue('');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toEqual([
    { path: '/admin/system-settings/ARK_API_KEY', cleared: false },
    { path: '/admin/system-settings/SMS_TEST_SECRET', cleared: true },
  ]);
});
