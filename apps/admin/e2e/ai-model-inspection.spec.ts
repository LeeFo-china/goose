import { test, expect } from '@playwright/test';

const backend = 'http://127.0.0.1:3989';

test.beforeEach(async ({ page, request }) => {
  await request.post(`${backend}/__test/reset`);
  await page.context().addCookies([{ name: 'gooes_admin_token', value: 'synthetic-ai-inspection-admin', url: 'http://127.0.0.1:3039' }]);
});

test('400px页面无横向溢出且长模型ID限制在局部区域', async ({ page, request }, info) => {
  await request.post(`${backend}/__test/options`, { data: { model_paginated: true } });
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  const table = page.getByRole('table', { name: '方舟测试的模型' });
  await expect(table.getByText('分页模型 1', { exact: true })).toBeVisible();
  const longCallName = table.getByText('very-long-provider-model-identifier-001-for-local-wrapping', { exact: true });
  await expect(longCallName.evaluate((element) => getComputedStyle(element).wordBreak)).resolves.toBe('break-all');
  await expect(longCallName.evaluate((element) => element.scrollWidth <= element.clientWidth)).resolves.toBe(true);
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await expect(table.evaluate((element) => {
    const container = element.parentElement;
    return Boolean(container && container.scrollWidth > container.clientWidth);
  })).resolves.toBe(true);
  await table.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('provider-models-mobile-400.png'), fullPage: true });
  await page.getByRole('region', { name: '模型', exact: true }).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(table.getByText('分页模型 21', { exact: true })).toBeVisible();
});

test('主备独立浏览分页和搜索不改已有绑定，保存也不触发resolve', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: {
    raw_route: true, raw_model_active: true, raw_fallback: true,
    inspect_paginated: true, route_save_delay: true,
  } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  for (const title of ['主模型', '备用模型']) {
    const group = page.getByRole('group', { name: title, exact: true });
    const pageResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.includes('/route-model-options') && url.searchParams.get('page') === '2'
        && url.searchParams.get('status') === 'active';
    });
    await group.getByRole('button', { name: '下一页', exact: true }).click();
    await pageResponse;
    await group.getByLabel(`选择${title}`, { exact: true }).click();
    await expect(page.getByRole('option', { name: '已登记图片模型 21 · image-model-21', exact: true })).toBeEnabled();
    await page.keyboard.press('Escape');
    await group.getByLabel(`搜索${title}`).fill('empty');
    await group.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(group.getByText('暂无符合场景模态的可用模型，可手动填写调用名称。', { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('group', { name: '主模型', exact: true }).getByLabel('选择主模型')).toContainText('旧生图模型');
  await expect(page.getByRole('group', { name: '备用模型', exact: true }).getByLabel('选择备用模型')).toContainText('旧备用生图模型');
  await page.getByLabel('路由名称', { exact: true }).fill('装修生图备注');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByLabel('主模型供应商', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('搜索备用模型', { exact: true })).toBeDisabled();
  await expect(page.getByText('场景路由已更新', { exact: true })).toBeVisible();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data as Array<{
    path: string; input: Record<string, unknown>;
  }>;
  expect(writes).toHaveLength(1);
  expect(writes[0]?.path).toContain('/routes/');
  expect(writes[0]?.input).toMatchObject({
    name: '装修生图备注',
    primary_model_id: '40000000-0000-4000-8000-000000000001',
    fallback_model_id: '40000000-0000-4000-8000-000000000099',
  });
  expect(writes.some((item) => item.path.endsWith('route-model-options:resolve'))).toBe(false);
  const reads = (await (await request.get(`${backend}/__test/reads`)).json()).data as Array<{
    path: string; query: Record<string, string>;
  }>;
  const candidateReads = reads.filter((item) => item.path.endsWith('/route-model-options'));
  expect(candidateReads.length).toBeGreaterThanOrEqual(6);
  expect(candidateReads.every((item) => item.query.status === 'active')).toBe(true);
});

test('场景分页追加与关键词搜索保持pageSize 20', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { scene_paginated: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  const nextResponse = page.waitForResponse((response) => response.url().includes('/platform/ai-config/scenes?page=2&pageSize=20'));
  await page.getByRole('button', { name: '加载更多场景', exact: true }).click();
  await nextResponse;
  await page.getByLabel('业务场景', { exact: true }).click();
  await expect(page.getByRole('option', { name: /分页场景 21/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('搜索业务场景').fill('分页场景 21');
  const searchResponse = page.waitForResponse((response) => response.url().includes('/platform/ai-config/scenes?page=1&pageSize=20&keyword='));
  await page.getByRole('button', { name: '搜索场景', exact: true }).click();
  await searchResponse;
  await page.getByLabel('业务场景', { exact: true }).click();
  await expect(page.getByRole('option', { name: /分页场景 21/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /分页场景 1 ·/ })).toHaveCount(0);
});

test('切换供应商后迟到的模型结果不会覆盖当前候选', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { raw_unbound: true, second_provider: true, delay_first_provider: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const late = page.waitForResponse((response) => response.url().includes('000000000001/route-model-options'));
  const primary = page.getByRole('group', { name: '主模型', exact: true });
  await primary.getByLabel('主模型供应商').click();
  await page.getByRole('option', { name: '第二供应商', exact: true }).click();
  await late;
  await primary.getByLabel('选择主模型').click();
  await expect(page.getByRole('option', { name: 'Second model', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: /DeepSeek Chat/ })).toHaveCount(0);
});
