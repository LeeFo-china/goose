import { test, expect } from '@playwright/test';

const backend = 'http://127.0.0.1:3989';

test.beforeEach(async ({ page, request }) => {
  await request.post(`${backend}/__test/reset`);
  await page.context().addCookies([{ name: 'gooes_admin_token', value: 'synthetic-ai-routes-admin', url: 'http://127.0.0.1:3039' }]);
});

test('新增路由从业务场景注册表选择只读身份，并自动加载可用模型', async ({ page, request }) => {
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });

  await expect(page.getByLabel('业务场景')).toBeVisible();
  await page.getByLabel('业务场景').click();
  await page.getByRole('option', { name: /装修问答/ }).click();
  await expect(page.getByLabel('场景编码')).toHaveValue('decoration_qa');
  await expect(page.getByLabel('模型模态')).toHaveValue('text');
  await expect(page.getByLabel('场景编码')).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('模型模态')).toHaveAttribute('readonly', '');
  await expect(page.getByText('候选模型加载中')).toHaveCount(0);
  await expect(page.getByLabel('选择主模型')).not.toContainText('DeepSeek Chat');
  await page.getByLabel('选择主模型').click();
  await expect(page.getByRole('option', { name: /DeepSeek Chat/ })).toBeVisible();
  const reads = (await (await request.get(`${backend}/__test/reads`)).json()).data;
  expect(reads).toHaveLength(2);
  expect(reads[0].query).toEqual({ page: '1', pageSize: '20', modality: 'text', status: 'active' });
});

test('场景候选错误、空态、分页搜索和离页目录候选都保持可保存选择', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { route_options_error_once: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByLabel('业务场景').click();
  await page.getByRole('option', { name: /装修问答/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: '模型候选加载失败' }).first()).toBeVisible();
  await page.getByRole('button', { name: '重试加载模型' }).first().click();
  await page.getByLabel('搜索主模型').fill('catalog-page-2');
  await page.getByRole('button', { name: '搜索', exact: true }).first().click();
  await page.getByRole('group', { name: '主模型', exact: true }).getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByLabel('选择主模型').click();
  await page.getByRole('option', { name: 'Catalog page two', exact: true }).click();
  await page.getByRole('group', { name: '主模型', exact: true }).getByRole('button', { name: '上一页', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();

  await expect(page.getByText('场景路由已创建', { exact: true })).toBeVisible();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes).toContainEqual({
    path: `/platform/ai-config/providers/10000000-0000-4000-8000-000000000001/route-model-options:resolve`,
    input: { source: 'catalog', value: '60000000-0000-4000-8000-000000000021' },
  });
  expect(writes).toContainEqual(expect.objectContaining({
    path: '/platform/ai-config/routes',
    input: expect.objectContaining({ primary_model_id: '50000000-0000-4000-8000-000000000002' }),
  }));
  const persisted = (await (await request.get(`${backend}/platform/ai-config/routes`)).json()).data.list[0];
  expect(persisted.primary_model_id).toBe('50000000-0000-4000-8000-000000000002');
});

test('手工候选在搜索离页后按原始模态解析，备用模型只在明确清空后移除', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { legacy_missing: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('搜索主模型').fill('manual');
  await page.getByRole('group', { name: '主模型', exact: true }).getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByLabel('选择主模型').click();
  await page.getByRole('option', { name: 'custom-text-model', exact: true }).click();
  await page.getByLabel('搜索主模型').fill('empty');
  await page.getByRole('group', { name: '主模型', exact: true }).getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByText('暂无符合场景模态的可用模型。')).toBeVisible();
  await page.getByLabel('选择备用模型').click();
  await page.getByRole('option', { name: '无备用模型', exact: true }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('场景路由已更新', { exact: true })).toBeVisible();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes[0].input).toEqual({ source: 'manual', model_name: 'custom-text-model', modality: 'text' });
  expect(writes[1].input.fallback_model_id).toBeNull();
});

test('切换至未接通场景后迟到的文本候选被丢弃，再切回文本自动加载', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { delayed_route_options: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByLabel('业务场景').click();
  await page.getByRole('option', { name: /装修问答/ }).click();
  const oldResponse = page.waitForResponse((response) => response.url().includes('route-model-options'));
  await page.getByLabel('业务场景').click();
  await page.getByRole('option', { name: /装修生图/ }).click();
  await oldResponse;
  await expect(page.getByLabel('选择主模型')).toBeDisabled();
  await expect(page.getByLabel('选择主模型')).not.toContainText('DeepSeek Chat');
  await page.getByLabel('业务场景').click();
  await page.getByRole('option', { name: /装修问答/ }).click();
  await expect(page.getByRole('status').filter({ hasText: '候选模型加载中' }).first()).toBeVisible();
  await expect(page.getByLabel('选择主模型')).toBeEnabled();
  await page.getByLabel('选择主模型').click();
  await expect(page.getByRole('option', { name: /DeepSeek Chat/ })).toBeVisible();
});

test('缺失旧绑定被后端拒绝后仍保留表单、绑定和版本，不重写身份', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { legacy_missing: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByLabel('业务场景')).toBeDisabled();
  await expect(page.getByLabel('选择主模型')).toContainText('原绑定模型');
  await expect(page.getByLabel('选择备用模型')).toContainText('原绑定模型');
  await expect(page.getByText('当前绑定模型不可用')).toHaveCount(2);
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('AI 模型不存在', { exact: true })).toBeVisible();
  await expect(page.getByLabel('场景编码')).toHaveValue('legacy_custom');
  await expect(page.getByLabel('选择主模型')).toContainText('原绑定模型');
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes[0].input).toEqual({ name: '旧业务名称', expected_version: 7, primary_model_id: '40000000-0000-4000-8000-000000000001', fallback_model_id: '40000000-0000-4000-8000-000000000099', temperature: null, timeout_ms: null, status: 'inactive' });
});

test('迟到的供应商结果不能覆盖新供应商，搜索空态保留当前选择', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { second_provider: true, delay_first_provider: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '候选模型加载中' }).first()).toBeVisible();
  await page.getByLabel('主模型供应商', { exact: true }).click();
  await page.getByRole('option', { name: '第二供应商', exact: true }).click();
  await expect(page.getByLabel('选择主模型')).toBeEnabled();
  await page.getByLabel('选择主模型').click();
  await page.getByRole('option', { name: 'Second model', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '候选模型加载中' })).toHaveCount(0);
  await page.getByLabel('搜索主模型').fill('empty');
  await page.getByRole('button', { name: '搜索', exact: true }).first().click();
  await expect(page.getByText('暂无符合场景模态的可用模型。')).toBeVisible();
  await expect(page.getByLabel('选择主模型')).toContainText('Second model');
  await page.getByLabel('选择主模型').click();
  await expect(page.getByRole('option', { name: /DeepSeek Chat/ })).toHaveCount(0);
});

test('未接通场景切回文本及编辑时自动加载，重置会使旧请求失效', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { delayed_route_options: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByLabel('业务场景').click();
  await page.getByRole('option', { name: /装修生图/ }).click();
  await expect(page.getByText('尚未接通', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新增', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '候选模型加载中' }).first()).toBeVisible();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.getByLabel('场景编码')).toHaveValue('');
  await page.waitForResponse((response) => response.url().includes('route-model-options'));
  await page.getByLabel('业务场景').click();
  await page.getByRole('option', { name: /装修问答/ }).click();
  await expect(page.getByRole('status').filter({ hasText: '候选模型加载中' }).first()).toBeVisible();
  await expect(page.getByLabel('选择主模型')).not.toContainText('DeepSeek Chat');
  await expect(page.getByRole('status').filter({ hasText: '候选模型加载中' })).toHaveCount(0);
  await expect(page.getByLabel('选择主模型')).not.toContainText('DeepSeek Chat');
});

test('保存同步锁定编辑重置及供应商删除，重复提交只产生一次写入', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { route_save_delay: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByLabel('场景名称')).toBeDisabled();
  await expect(page.getByRole('button', { name: '重置', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await expect(page.getByRole('button', { name: /删除/ })).toBeDisabled();
  await expect(page.getByText('场景路由已更新', { exact: true })).toBeVisible();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes.filter((write: { path: string }) => write.path.includes('/routes/'))).toHaveLength(1);
});

test('注册表失败保留路由和供应商列表，支持独立重试', async ({ page, request }, info) => {
  await request.post(`${backend}/__test/options`, { data: { scene_error: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await expect(page.getByText('装修问答', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重试加载场景' })).toBeVisible();
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await expect(page.getByText('方舟测试', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '场景路由', exact: true }).click();
  await request.post(`${backend}/__test/options`, { data: { scene_error: false } });
  await page.getByRole('button', { name: '重试加载场景' }).click();
  await expect(page.getByLabel('业务场景')).toBeEnabled();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByLabel('选择主模型')).toBeEnabled();
  await page.getByRole('table').evaluate((table) => { if (table.parentElement) table.parentElement.scrollLeft = 0; });
  await page.screenshot({ path: info.outputPath('route-desktop.png'), fullPage: true });
});

test('未接通生图场景阻止新绑定，旧路由保留只读身份和已有绑定', async ({ page, request }, info) => {
  await request.post(`${backend}/__test/options`, { data: { raw_route: true } });
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();

  await expect(page.getByText('尚未接通', { exact: true })).toBeVisible();
  await expect(page.getByLabel('场景编码')).toHaveValue('decoration_raw_drawing');
  await expect(page.getByLabel('选择主模型')).toBeDisabled();
  await expect(page.getByLabel('选择主模型')).toContainText('旧生图模型');
  await expect(page.getByText('当前绑定模型不可用')).toBeVisible();
  await expect(page.getByRole('button', { name: '新增', exact: true })).toHaveCount(0);
  await expect.poll(async () => (await page.getByRole('heading', { name: 'AI 模型路由', exact: true }).boundingBox())?.x).toBeLessThan(30);
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await page.getByText('尚未接通', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('route-raw-drawing-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('AI 模型已停用', { exact: true })).toBeVisible();
  await expect(page.getByLabel('选择主模型')).toContainText('旧生图模型');
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes).toHaveLength(1);
  expect(writes[0].input).toEqual({ name: '装修生图', expected_version: 1, primary_model_id: '40000000-0000-4000-8000-000000000001', fallback_model_id: null, temperature: null, timeout_ms: null, status: 'inactive', quality_tier: 'balanced' });
});

test('只读账号在生图路由列表也能看到运行时未接通', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { raw_route: true, readonly_delete: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await expect(page.getByRole('table').getByText('运行时尚未接通', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
});

test('未接通生图场景允许保留有效旧绑定保存，不宣称生图可用', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { raw_route: true, raw_model_active: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByText('尚未接通', { exact: true })).toBeVisible();
  await expect(page.getByLabel('选择主模型')).toBeDisabled();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('场景路由已更新', { exact: true })).toBeVisible();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes[0].input.primary_model_id).toBe('40000000-0000-4000-8000-000000000001');
  expect(writes[0].input).not.toHaveProperty('scene_code');
  await expect(page.getByRole('table').getByText('运行时尚未接通', { exact: true })).toBeVisible();
});

test('只读账号可浏览路由但没有路由变更入口', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { readonly_delete: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });

  await expect(page.getByText('装修问答', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新增', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
});

test('停用供应商的旧绑定可见，但不能在该供应商下更换模型', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { inactive_provider: true, second_provider: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByLabel('主模型供应商', { exact: true })).toContainText('已停用');
  await expect(page.getByRole('status').filter({ hasText: '候选模型加载中' })).toHaveCount(0);
  await expect(page.getByLabel('选择主模型')).toBeDisabled();
  await expect(page.getByLabel('选择主模型')).toContainText('DeepSeek Chat');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('AI 供应商已停用', { exact: true })).toBeVisible();
  await expect(page.getByLabel('选择主模型')).toContainText('DeepSeek Chat');
  await page.getByLabel('主模型供应商', { exact: true }).click();
  await expect(page.getByRole('option', { name: /方舟测试/ })).toBeDisabled();
  await page.getByRole('option', { name: '第二供应商', exact: true }).click();
  await expect(page.getByLabel('选择主模型')).toBeEnabled();
  await expect(page.getByLabel('选择主模型')).not.toContainText('DeepSeek Chat');
});

test('编辑时补入不在供应商候选页的旧绑定供应商及停用状态', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { bound_provider_off_page: true, inactive_provider: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByLabel('主模型供应商', { exact: true })).toContainText('方舟测试（已停用）');
  await expect(page.getByLabel('选择主模型')).toContainText('DeepSeek Chat');
  await expect(page.getByLabel('选择主模型')).toBeDisabled();
  const reads = (await (await request.get(`${backend}/__test/reads`)).json()).data;
  expect(reads.every((read: { path: string }) => read.path.includes('10000000-0000-4000-8000-000000000001'))).toBe(true);
});
