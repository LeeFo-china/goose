import { test, expect } from '@playwright/test';

const backend = 'http://127.0.0.1:3989';
test.beforeEach(async ({ page, request }) => {
  await request.post(`${backend}/__test/reset`);
  await page.context().addCookies([{ name: 'gooes_admin_token', value: 'synthetic-ai-routes-admin', url: 'http://127.0.0.1:3039' }]);
});

test('未绑定生图可查看唯一文本模型和不匹配原因，400px无溢出', async ({ page, request }, info) => {
  await request.post(`${backend}/__test/options`, { data: { raw_unbound: true } });
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const primary = page.getByRole('group', { name: '主模型', exact: true });
  await expect(primary.getByText('尚未绑定主模型')).toBeVisible();
  await expect(primary.getByLabel('主模型供应商', { exact: true })).toBeEnabled();
  await expect(primary.getByText('已登记文本模型 1', { exact: true })).toBeVisible();
  await expect(primary.getByText('文本模型不匹配图片场景')).toBeVisible();
  await expect(primary.getByText('能力待核实')).toBeVisible();
  await expect(primary.getByLabel('选择主模型')).toHaveCount(0);
  const reads = (await (await request.get(`${backend}/__test/reads`)).json()).data;
  expect(reads).toHaveLength(2);
  expect(reads.every((read: { query: unknown }) => JSON.stringify(read.query) === JSON.stringify({ page: '1', pageSize: '20', view: 'inspect' }))).toBe(true);
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await primary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('unbound-inspection-mobile.png'), fullPage: true });
});

test('浏览主备供应商、分页和搜索不改已有绑定，保存锁定浏览且不resolve', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { raw_route: true, raw_model_active: true, raw_fallback: true, second_provider: true, inspect_paginated: true, route_save_delay: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  for (const title of ['主模型', '备用模型']) {
    const group = page.getByRole('group', { name: title, exact: true });
    await group.getByLabel(`${title}供应商`, { exact: true }).click();
    await page.getByRole('option', { name: '第二供应商', exact: true }).click();
    await group.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(group.getByText('第二供应商登记模型 21', { exact: true })).toBeVisible();
    await expect(group.getByText('模型已停用', { exact: true })).toBeVisible();
    await group.getByLabel(`搜索${title}`).fill('empty');
    await group.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(group.getByText('暂无已登记模型。')).toBeVisible();
  }
  await expect(page.getByLabel('当前主模型绑定', { exact: true })).toContainText('方舟测试');
  await expect(page.getByLabel('当前主模型绑定', { exact: true })).toContainText('旧生图模型');
  await expect(page.getByLabel('当前备用模型绑定', { exact: true })).toContainText('方舟测试');
  await expect(page.getByLabel('当前备用模型绑定', { exact: true })).toContainText('旧备用生图模型');
  await page.getByLabel('场景名称').fill('装修生图备注');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByLabel('主模型供应商', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('搜索备用模型')).toBeDisabled();
  await expect(page.getByText('场景路由已更新', { exact: true })).toBeVisible();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes).toHaveLength(1);
  expect(writes[0].input).toMatchObject({ name: '装修生图备注', primary_model_id: '40000000-0000-4000-8000-000000000001', fallback_model_id: '40000000-0000-4000-8000-000000000099' });
});

test('浏览错误清空旧列表可重试，主备迟到结果各自失效', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { raw_unbound: true, second_provider: true, delay_first_provider: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const late = page.waitForResponse((response) => response.url().includes('000000000001/route-model-options'));
  for (const title of ['主模型', '备用模型']) {
    await page.getByLabel(`${title}供应商`, { exact: true }).click();
    await page.getByRole('option', { name: '第二供应商', exact: true }).click();
  }
  await late;
  for (const title of ['主模型', '备用模型']) {
    await expect(page.getByLabel(`${title}已登记模型`, { exact: true })).toContainText('第二供应商登记模型 1');
    await expect(page.getByLabel(`${title}已登记模型`, { exact: true })).not.toContainText('已登记文本模型');
  }
  await request.post(`${backend}/__test/options`, { data: { inspect_error: true } });
  const primary = page.getByRole('group', { name: '主模型', exact: true });
  await primary.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(primary.getByRole('alert')).toBeVisible();
  await expect(primary.getByLabel('主模型已登记模型', { exact: true })).toHaveCount(0);
  await request.post(`${backend}/__test/options`, { data: { inspect_error: false } });
  await primary.getByRole('button', { name: '重试加载模型' }).click();
  await expect(primary.getByText('第二供应商登记模型 1', { exact: true })).toBeVisible();
});

test('删除正在浏览的其他供应商不清空生图原绑定', async ({ page, request }, info) => {
  await request.post(`${backend}/__test/options`, { data: { raw_route: true, raw_model_active: true, second_provider: true } });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByLabel('主模型已登记模型', { exact: true })).toContainText('文本模型不匹配图片场景');
  await page.getByLabel('当前主模型绑定', { exact: true }).evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.getByRole('table').evaluate((table) => { if (table.parentElement) table.parentElement.scrollLeft = 0; });
  await page.screenshot({ path: info.outputPath('bound-inspection-desktop.png'), fullPage: true });
  await page.getByLabel('主模型供应商', { exact: true }).click();
  await page.getByRole('option', { name: '第二供应商', exact: true }).click();
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '删除供应商 第二供应商', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.getByRole('tab', { name: '场景路由', exact: true }).click();
  await expect(page.getByLabel('当前主模型绑定', { exact: true })).toContainText('旧生图模型');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('场景路由已更新', { exact: true })).toBeVisible();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes.at(-1).input.primary_model_id).toBe('40000000-0000-4000-8000-000000000001');
});
