import { test, expect, type APIRequestContext } from '@playwright/test';

const backend = 'http://127.0.0.1:3989';

test.beforeEach(async ({ page, request }) => {
  await request.post(`${backend}/__test/reset`);
  await page.context().addCookies([{ name: 'gooes_admin_token', value: 'synthetic-ai-routes-admin', url: 'http://127.0.0.1:3039' }]);
});

async function backendWrites(request: APIRequestContext) {
  return (await (await request.get(`${backend}/__test/writes`)).json()).data as Array<{ path: string; input: Record<string, unknown> }>;
}

test('未接通装修生图可绑定图片模型且刷新保留', async ({ page, request }, info) => {
  await request.post(`${backend}/__test/options`, { data: { image_model: true, raw_unbound: true } });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByText('待业务接入', { exact: true })).toBeVisible();
  const primary = page.getByRole('group', { name: '主模型', exact: true });
  await primary.getByLabel('选择主模型').click();
  await page.getByRole('option', { name: /Seedream 5 Pro/ }).click();
  await expect(page.getByLabel('响应格式')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('route-seedream-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('场景路由已更新', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(primary.getByLabel('选择主模型')).toContainText('Seedream 5 Pro');
  const routeWrite = (await backendWrites(request)).find((item) => item.path.includes('/routes/'));
  expect(routeWrite?.input).toMatchObject({ primary_model_id: '40000000-0000-4000-8000-000000000050' });
});

test('模型候选失败后可手填Seedream且按图片模态解析', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { raw_unbound: true, route_options_error_once: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const primary = page.getByRole('group', { name: '主模型', exact: true });
  await expect(primary.getByRole('alert')).toContainText('模型候选加载失败');
  await primary.getByRole('button', { name: '手动填写调用名称', exact: true }).click();
  const manual = page.getByRole('group', { name: '手动填写主模型', exact: true });
  await manual.getByLabel('主模型显示名称').fill('Seedream 5 Pro');
  await manual.getByLabel('主模型调用名称（必填）').fill('doubao-seedream-5-0-pro-260628');
  await expect(page.getByLabel('响应格式')).toHaveCount(0);
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('场景路由已更新', { exact: true })).toBeVisible();
  expect(await backendWrites(request)).toContainEqual({
    path: '/platform/ai-config/providers/10000000-0000-4000-8000-000000000001/route-model-options:resolve',
    input: {
      source: 'manual', name: 'Seedream 5 Pro', model_name: 'doubao-seedream-5-0-pro-260628',
      modality: 'image', input_modalities: ['text', 'image'],
    },
  });
});

test('自定义文本场景保存前提示系统生成并在刷新后显示scene编码', async ({ page, request }) => {
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByLabel('场景来源').click();
  await page.getByRole('option', { name: '新建自定义场景', exact: true }).click();
  await page.getByLabel('自定义场景名称（必填）').fill('客户方案总结');
  await page.getByLabel('模型模态（必填）').click();
  await page.getByRole('option', { name: '文本', exact: true }).click();
  await expect(page.getByLabel('场景编码')).toHaveValue('保存后生成');
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByText('场景路由已创建', { exact: true })).toBeVisible();
  await expect(page.getByLabel('场景编码')).toHaveValue('scene_custom_text_001');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(page.getByLabel('场景编码')).toHaveValue('scene_custom_text_001');
  const routeWrite = (await backendWrites(request)).find((item) => item.path === '/platform/ai-config/routes');
  expect(routeWrite?.input).toMatchObject({ scene_source: 'custom', scene_name: '客户方案总结', modality: 'text' });
  expect(routeWrite?.input).not.toHaveProperty('scene_code');
});

test('自定义场景可重命名停用并确认删除，系统场景无操作菜单', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { custom_scene: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByLabel('业务场景', { exact: true }).click();
  await page.getByRole('option', { name: /自定义文案 · 自定义/ }).click();
  await page.getByRole('button', { name: '自定义场景操作' }).click();
  await page.getByRole('menuitem', { name: '重命名场景' }).click();
  let dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('场景名称').fill('更新后的自定义文案');
  await dialog.getByRole('button', { name: '重命名场景', exact: true }).click();
  await expect(page.getByText('场景已更新', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '自定义场景操作' }).click();
  await page.getByRole('menuitem', { name: '停用场景' }).click();
  dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: '停用场景', exact: true }).click();
  await expect(page.getByText('场景已更新', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '自定义场景操作' }).click();
  await page.getByRole('menuitem', { name: '删除场景' }).click();
  dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('删除后不可恢复');
  await dialog.getByRole('button', { name: '删除场景', exact: true }).click();
  await expect(page.getByText('场景已删除', { exact: true })).toBeVisible();
  await page.getByLabel('业务场景', { exact: true }).click();
  await page.getByRole('option', { name: /装修问答 · 系统/ }).click();
  await expect(page.getByRole('button', { name: '自定义场景操作' })).toHaveCount(0);
  const mutations = (await backendWrites(request)).filter((item) => item.path.includes('/scenes/'));
  expect(mutations.map((item) => item.input)).toEqual([
    { name: '更新后的自定义文案', expected_version: 1 },
    { status: 'inactive', expected_version: 2 },
    { expected_version: 3 },
  ]);
});

test('只读账号可查看路由与未接通状态但无变更入口', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { readonly_delete: true, raw_unbound: true, image_model: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await expect(page.getByText('装修生图', { exact: true })).toBeVisible();
  await expect(page.getByText('运行时尚未接通', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '新增', exact: true })).toHaveCount(0);
});

test('登记场景选择后保持只读身份并自动加载模型', async ({ page, request }) => {
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByLabel('业务场景', { exact: true }).click();
  await page.getByRole('option', { name: /装修问答/ }).click();
  await expect(page.getByLabel('场景编码')).toHaveValue('decoration_qa');
  await expect(page.getByLabel('模型模态')).toHaveValue('文本');
  await expect(page.getByLabel('场景编码')).toHaveAttribute('readonly', '');
  const primary = page.getByRole('group', { name: '主模型', exact: true });
  await primary.getByLabel('选择主模型').click();
  await expect(page.getByRole('option', { name: /DeepSeek Chat/ })).toBeVisible();
  const reads = (await (await request.get(`${backend}/__test/reads`)).json()).data;
  expect(reads[0].query).toEqual({ page: '1', pageSize: '20', modality: 'text', status: 'active' });
});

test('缺失旧绑定阻止提交并保留表单、主备绑定和版本', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { legacy_missing: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const primary = page.getByRole('group', { name: '主模型', exact: true });
  const fallback = page.getByRole('group', { name: '备用模型', exact: true });
  await expect(page.getByLabel('业务场景', { exact: true })).toBeDisabled();
  await expect(primary.getByLabel('选择主模型')).toContainText('原绑定模型');
  await expect(fallback.getByLabel('选择备用模型')).toContainText('原绑定模型');
  await expect(page.getByText('当前绑定模型不可用')).toHaveCount(2);
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('请恢复或更换已停用的供应商、模型。', { exact: true })).toBeVisible();
  await expect(page.getByLabel('场景编码')).toHaveValue('legacy_custom');
  await expect(primary.getByLabel('选择主模型')).toContainText('原绑定模型');
  await expect(fallback.getByLabel('选择备用模型')).toContainText('原绑定模型');
  await expect(page.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled();
  expect((await backendWrites(request)).filter((item) => item.path.includes('/routes/'))).toHaveLength(0);
  const persisted = (await (await request.get(`${backend}/platform/ai-config/routes`)).json()).data.list[0];
  expect(persisted).toMatchObject({
    version: 7,
    primary_model_id: '40000000-0000-4000-8000-000000000001',
    fallback_model_id: '40000000-0000-4000-8000-000000000099',
  });
});

test('停用供应商旧绑定可见且不可更换，切换启用供应商后才可浏览', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { inactive_provider: true, second_provider: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const primary = page.getByRole('group', { name: '主模型', exact: true });
  await expect(primary.getByLabel('主模型供应商', { exact: true })).toContainText('已停用');
  await expect(primary.getByRole('status').filter({ hasText: '候选模型加载中' })).toHaveCount(0);
  await expect(primary.getByLabel('选择主模型')).toBeDisabled();
  await expect(primary.getByLabel('选择主模型')).toContainText('DeepSeek Chat');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('请恢复或更换已停用的供应商、模型。', { exact: true })).toBeVisible();
  await expect(primary.getByLabel('选择主模型')).toContainText('DeepSeek Chat');
  expect((await backendWrites(request)).filter((item) => item.path.includes('/routes/'))).toHaveLength(0);
  await primary.getByLabel('主模型供应商', { exact: true }).click();
  await expect(page.getByRole('option', { name: /方舟测试/ })).toBeDisabled();
  await page.getByRole('option', { name: '第二供应商', exact: true }).click();
  await expect(primary.getByLabel('选择主模型')).toBeEnabled();
  await expect(primary.getByLabel('选择主模型')).not.toContainText('DeepSeek Chat');
});

test('目录候选分页选择后离页仍按原值解析', async ({ page, request }) => {
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByLabel('业务场景', { exact: true }).click();
  await page.getByRole('option', { name: /装修问答/ }).click();
  const primary = page.getByRole('group', { name: '主模型', exact: true });
  await primary.getByLabel('搜索主模型').fill('catalog-page-2');
  await primary.getByRole('button', { name: '搜索', exact: true }).click();
  await primary.getByRole('button', { name: '下一页', exact: true }).click();
  await primary.getByLabel('选择主模型').click();
  await page.getByRole('option', { name: 'Catalog page two', exact: true }).click();
  await primary.getByRole('button', { name: '上一页', exact: true }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await expect(page.getByText('场景路由已创建', { exact: true })).toBeVisible();
  expect(await backendWrites(request)).toContainEqual({
    path: '/platform/ai-config/providers/10000000-0000-4000-8000-000000000001/route-model-options:resolve',
    input: { source: 'catalog', value: '60000000-0000-4000-8000-000000000021' },
  });
});

test('路由保存期间锁定编辑与重复提交', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { route_save_delay: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click(); button.click();
  });
  await expect(page.getByLabel('路由名称')).toBeDisabled();
  await expect(page.getByRole('button', { name: '重置', exact: true })).toBeDisabled();
  await expect(page.getByText('场景路由已更新', { exact: true })).toBeVisible();
  const writes = await backendWrites(request);
  expect(writes.filter((item) => item.path.includes('/routes/'))).toHaveLength(1);
});

test('场景注册表失败不破坏路由与供应商并可独立重试', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { scene_error: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await expect(page.getByText('装修问答', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重试加载场景' })).toBeVisible();
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await expect(page.getByRole('button', { name: '方舟测试', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '场景路由', exact: true }).click();
  await request.post(`${backend}/__test/options`, { data: { scene_error: false } });
  await page.getByRole('button', { name: '重试加载场景' }).click();
  await expect(page.getByLabel('业务场景', { exact: true })).toBeEnabled();
});
