import { test, expect, type Locator } from '@playwright/test';

const backend = 'http://127.0.0.1:3989';
async function textboxWithValue(scope: Locator, value: string) {
  for (const textbox of await scope.getByRole('textbox').all()) {
    if (await textbox.inputValue() === value) return textbox;
  }
  throw new Error(`没有找到值为 ${value} 的文本框`);
}

async function regionWithTextboxValue(regions: Locator, value: string) {
  for (const region of await regions.all()) {
    if (await textboxWithValue(region, value).catch(() => null)) return region;
  }
  throw new Error(`没有找到包含文本框值 ${value} 的区域`);
}

test.beforeEach(async ({ page, request }) => {
  await request.post(`${backend}/__test/reset`);
  await page.context().addCookies([{ name: 'gooes_admin_token', value: 'synthetic-ai-secret-admin', url: 'http://127.0.0.1:3039' }]);
});

test('真实密钥独立保存，空白不写，关闭清空，结果未验证', async ({ page, request }, info) => {
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '配置密钥', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: '保存密钥', exact: true })).toBeDisabled();
  await dialog.getByLabel('真实 API Key').fill('ark-test-redacted');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '配置密钥', exact: true }).click();
  await expect(dialog.getByLabel('真实 API Key')).toHaveValue('');
  await dialog.getByLabel('真实 API Key').fill('ark-test-redacted');
  await dialog.getByRole('button', { name: '保存密钥', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('密钥已保存，尚未验证模型调用。', { exact: true })).toBeVisible();
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes).toEqual([{ path: '/platform/ai-config/secret-settings/ARK_API_KEY', input: { value: 'ark-test-redacted' } }]);
  const response = await page.request.get('/api/backend/platform/ai-config/secret-settings');
  expect(response.headers()['cache-control']).toBe('private, no-store');
  await page.screenshot({ path: info.outputPath('provider-secret-configured.png'), fullPage: true });
});

test('已登记的新密钥引用可预先配置，失败不自动重试且窄屏可操作', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  const providerTab = page.getByRole('tabpanel', { name: '供应商', exact: true });
  await expect(providerTab.getByRole('region', { name: '供应商详情', exact: true })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('combobox', { name: '密钥配置', exact: true }).click();
  await page.getByRole('option', { name: 'DeepSeek 接口密钥', exact: true }).click();
  await expect(page.getByRole('button', { name: '配置密钥', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '配置密钥', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await request.post(`${backend}/__test/options`, { data: { write_failure: true } });
  await dialog.getByLabel('真实 API Key').fill('ark-test-redacted');
  await dialog.getByRole('button', { name: '保存密钥', exact: true }).click();
  await expect(dialog.getByText(/保存未确认/)).toBeVisible();
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('provider-secret-mobile-error.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('供应商切换只替换右侧唯一详情和对应模型', async ({ page, request }, info) => {
  await request.post(`${backend}/__test/options`, { data: {
    second_provider: true, provider_models_by_supplier: true,
  } });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  const providerTab = page.getByRole('tabpanel', { name: '供应商', exact: true });
  const detail = providerTab.getByRole('region', { name: '供应商详情', exact: true });
  await expect(detail).toHaveCount(1);
  await expect(detail).toHaveAttribute('data-provider-detail-id', '10000000-0000-4000-8000-000000000001');
  await expect(detail.getByLabel('名称', { exact: true })).toHaveValue('方舟测试');
  await expect(detail.getByLabel('Endpoint Base URL', { exact: true })).toHaveValue('https://ark.example.test/api/v3');

  const rail = providerTab.getByRole('complementary', { name: '供应商列表' });
  await rail.getByRole('button', { name: '第二供应商', exact: true }).click();
  await expect(detail).toHaveCount(1);
  await expect(detail).toHaveAttribute('data-provider-detail-id', '10000000-0000-4000-8000-000000000002');
  await expect(detail.getByLabel('名称', { exact: true })).toHaveValue('第二供应商');
  await expect(detail.getByLabel('Endpoint Base URL', { exact: true })).toHaveValue('https://second.example.test/v1');
  const secondModels = detail.getByRole('table', { name: '第二供应商的模型', exact: true });
  await expect(secondModels.getByText('第二供应商模型', { exact: true })).toBeVisible();
  await expect(secondModels.getByText('second-model', { exact: true })).toBeVisible();
  await expect(providerTab.getByRole('table', { name: '方舟测试的模型', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('provider-master-detail-desktop.png'), fullPage: true });
});

test('快速切换时迟到的旧供应商模型不会覆盖当前详情', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: {
    second_provider: true, provider_models_by_supplier: true, delay_first_provider_models: true,
  } });
  const firstProviderModelsRequest = page.waitForRequest((outgoing) => {
    const target = new URL(outgoing.url());
    return target.pathname.endsWith('/platform/ai-config/models')
      && target.searchParams.get('providerId') === '10000000-0000-4000-8000-000000000001';
  });
  await page.goto('/platform/ai-models', { waitUntil: 'domcontentloaded' });
  const providerTabTrigger = page.getByRole('tab', { name: '供应商', exact: true });
  await expect(async () => {
    await providerTabTrigger.click();
    await expect(providerTabTrigger).toHaveAttribute('aria-selected', 'true');
  }).toPass();
  await firstProviderModelsRequest;
  await expect.poll(async () => {
    const response = await request.get(`${backend}/__test/provider-model-delay`);
    if (!response.ok()) return `status:${response.status()}`;
    return String((await response.json()).data.started);
  }).toBe('true');
  const providerTab = page.getByRole('tabpanel', { name: '供应商', exact: true });
  const detail = providerTab.getByRole('region', { name: '供应商详情', exact: true });
  await providerTab.getByRole('complementary', { name: '供应商列表' })
    .getByRole('button', { name: '第二供应商', exact: true }).click();
  const secondModels = detail.getByRole('table', { name: '第二供应商的模型', exact: true });
  await expect(secondModels.getByText('第二供应商模型', { exact: true })).toBeVisible();

  const released = await request.post(`${backend}/__test/provider-model-delay/release`);
  expect(released.ok()).toBe(true);
  await expect.poll(async () => {
    const response = await request.get(`${backend}/__test/provider-model-delay`);
    if (!response.ok()) return `status:${response.status()}`;
    return String((await response.json()).data.completed);
  }).toBe('true');
  await expect(detail).toHaveCount(1);
  await expect(detail).toHaveAttribute('data-provider-detail-id', '10000000-0000-4000-8000-000000000002');
  await expect(detail.getByLabel('名称', { exact: true })).toHaveValue('第二供应商');
  await expect(secondModels.getByText('第二供应商模型', { exact: true })).toBeVisible();
  await expect(secondModels.getByText('second-model', { exact: true })).toBeVisible();
  await expect(providerTab.getByRole('table', { name: '方舟测试的模型', exact: true })).toHaveCount(0);
});

test('供应商模型候选视图统一参与过滤分页且reset不泄漏', async ({ request }) => {
  await request.post(`${backend}/__test/options`, { data: {
    image_model: true, second_provider: true, provider_models_by_supplier: true,
  } });
  const modelPage = async (query: string) => {
    const response = await request.get(`${backend}/platform/ai-config/models?${query}`);
    expect(response.ok()).toBe(true);
    return (await response.json()).data;
  };

  const all = await modelPage('page=1&pageSize=20');
  expect(all.list.map((model: { model_name: string }) => model.model_name)).toContain('second-model');
  expect(all.pagination).toMatchObject({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
  const firstPage = await modelPage('page=1&pageSize=1');
  const secondPage = await modelPage('page=2&pageSize=1');
  expect(firstPage.pagination).toMatchObject({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
  expect(secondPage.pagination).toMatchObject({ page: 2, pageSize: 1, total: 2, totalPages: 2 });
  expect(secondPage.list.map((model: { model_name: string }) => model.model_name)).toEqual(['second-model']);

  const secondProvider = await modelPage('providerId=10000000-0000-4000-8000-000000000002&page=1&pageSize=20');
  expect(secondProvider.list.map((model: { model_name: string }) => model.model_name)).toEqual(['second-model']);
  for (const mismatch of ['keyword=missing', 'modality=image', 'status=inactive']) {
    const filtered = await modelPage(`providerId=10000000-0000-4000-8000-000000000002&${mismatch}&page=1&pageSize=20`);
    expect(filtered.list).toEqual([]);
    expect(filtered.pagination).toMatchObject({ total: 0, totalPages: 0 });
  }

  await request.post(`${backend}/__test/reset`);
  const reset = await modelPage('page=1&pageSize=20');
  expect(reset.list).toEqual([]);
  expect(reset.pagination).toMatchObject({ total: 0, totalPages: 0 });
});

test('只读、无权限和状态失败不会破坏供应商列表', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { readonly: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await expect(page.getByText('没有密钥管理权限', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '配置密钥', exact: true })).toHaveCount(0);
  await request.post(`${backend}/__test/options`, { data: { denied: true } });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await expect(page.getByText('没有密钥管理权限', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '方舟测试', exact: true })).toBeVisible();
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
  await input.fill('ark-test-redacted');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page.goto('/settings?group=sms', { waitUntil: 'networkidle' });
  await expect(page.locator('#setting-SMS_TEST_SECRET')).toHaveValue('');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect((await (await request.get(`${backend}/__test/writes`)).json()).data).toEqual([
    { path: '/admin/system-settings/ARK_API_KEY', input: { value: 'ark-test-redacted' } },
    { path: '/admin/system-settings/SMS_TEST_SECRET', input: { value: null } },
  ]);
});

test('火山方舟可登记图片模型且保存后系统编码只读', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { ark_workspace: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByRole('button', { name: '火山方舟', exact: true }).click();
  await page.getByRole('button', { name: '新增模型', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新增模型' });
  await dialog.getByLabel('名称', { exact: true }).fill('Seedream 5 Pro');
  await dialog.getByLabel('供应商调用名', { exact: true }).fill('doubao-seedream-5-0-pro-260628');
  await dialog.getByLabel('模型模态', { exact: true }).click();
  await page.getByRole('option', { name: '图片', exact: true }).click();
  await dialog.getByLabel('图片', { exact: true }).click();
  await dialog.getByRole('button', { name: '保存模型', exact: true }).click();
  await expect(page.getByText('模型已保存。', { exact: true })).toBeVisible();
  const createWrite = ((await (await request.get(`${backend}/__test/writes`)).json()).data as Array<{
    path: string; input: Record<string, unknown>;
  }>).find((item) => item.path === '/platform/ai-config/models');
  expect(createWrite?.input).toEqual({
    provider_id: '10000000-0000-4000-8000-000000000001',
    name: 'Seedream 5 Pro', model_name: 'doubao-seedream-5-0-pro-260628',
    modality: 'image', input_modalities: ['text', 'image'], status: 'active', sort_order: 0,
  });
  expect(createWrite?.input).not.toHaveProperty('code');
  await page.getByRole('button', { name: '编辑模型 Seedream 5 Pro', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: '编辑模型' });
  await expect(editDialog.getByLabel('系统编码')).toHaveValue('mdl_0123456789abcdef0123456789abcdef');
  await expect(editDialog.getByLabel('系统编码')).toHaveValue(/^mdl_[0-9a-f]{32}$/);
  await expect(editDialog.getByLabel('系统编码')).toHaveAttribute('readonly', '');
});

test('模型写接口拒绝客户端指定系统编码', async ({ request }) => {
  const input = {
    provider_id: '10000000-0000-4000-8000-000000000001', code: 'client-owned-code',
    name: '非法模型', model_name: 'invalid-model', modality: 'text', input_modalities: ['text'],
    status: 'active', sort_order: 0,
  };
  const create = await request.post(`${backend}/platform/ai-config/models`, { data: input });
  expect(create.status()).toBe(400);
  expect((await create.json()).code).toBe('VALIDATION_ERROR');
  await request.post(`${backend}/__test/options`, { data: { image_model: true } });
  const update = await request.patch(`${backend}/platform/ai-config/models/40000000-0000-4000-8000-000000000050`, {
    data: { code: 'client-owned-code', name: '非法改名', expected_version: 1 },
  });
  expect(update.status()).toBe(400);
  expect((await update.json()).code).toBe('VALIDATION_ERROR');
});

test('OpenRouter仅验证目录连接，OpenAI Compatible明确显示不支持无损验证', async ({ page, request }) => {
  const browserRequests: string[] = [];
  page.context().on('request', (outgoing) => browserRequests.push(outgoing.url()));
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  await page.getByLabel('接入协议').click();
  await page.getByRole('option', { name: 'OpenRouter', exact: true }).click();
  await page.getByLabel('Endpoint Base URL').fill('https://openrouter.ai/api/v1');
  await page.getByRole('button', { name: '保存供应商', exact: true }).click();
  await expect(page.getByText('供应商配置已保存。', { exact: true })).toBeVisible();
  const verifiedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/validate'));
  await page.getByRole('button', { name: '验证连接', exact: true }).click();
  await expect(page.getByText('连接验证通过，尚未验证模型调用。', { exact: true })).toBeVisible();
  expect((await (await verifiedResponse).json()).data).toEqual({
    status: 'verified', checked_at: '2026-09-12T08:00:00.000Z', method: 'openrouter_catalog',
  });
  await page.getByLabel('接入协议').click();
  await page.getByRole('option', { name: 'OpenAI Compatible', exact: true }).click();
  await page.getByRole('button', { name: '保存供应商', exact: true }).click();
  await expect(page.getByText('供应商配置已保存。', { exact: true })).toBeVisible();
  const unsupportedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith('/validate'));
  await page.getByRole('button', { name: '验证连接', exact: true }).click();
  await expect(page.getByText('配置已保存，当前协议没有无损验证方式', { exact: true })).toBeVisible();
  expect((await (await unsupportedResponse).json()).data).toEqual({
    status: 'unsupported', checked_at: '2026-09-12T08:00:00.000Z', method: 'none',
    message: 'OpenAI Compatible 供应商未约定安全的只读发现接口，暂不支持连通性验证',
  });
  const writes = (await (await request.get(`${backend}/__test/writes`)).json()).data;
  expect(writes.filter((item: { path: string }) => item.path.endsWith('/validate'))).toHaveLength(2);
  expect(writes.some((item: { path: string }) => item.path.includes('generations'))).toBe(false);
  expect(browserRequests.filter((target) => {
    const hostname = new URL(target).hostname;
    return hostname === 'volces.com' || hostname.endsWith('.volces.com')
      || hostname === 'openrouter.ai' || hostname.endsWith('.openrouter.ai');
  })).toEqual([]);
  expect(browserRequests.filter((target) => new URL(target).pathname.includes('/images/generations'))).toEqual([]);
});

test('模型弹窗恢复焦点且409冲突保留安全反馈', async ({ page, request }) => {
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  const trigger = page.getByRole('button', { name: '新增模型', exact: true });
  await trigger.click();
  await page.getByRole('dialog', { name: '新增模型' }).getByRole('button', { name: '取消', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '新增模型' });
  await dialog.getByLabel('名称', { exact: true }).fill('冲突模型');
  await dialog.getByLabel('供应商调用名', { exact: true }).fill('duplicate-model');
  await request.post(`${backend}/__test/options`, { data: { model_conflict: true } });
  await dialog.getByRole('button', { name: '保存模型', exact: true }).click();
  await expect(dialog.getByText('同一供应商已登记相同调用名和模态的模型，请编辑已有模型。', { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText('mock private');
});

test('跨页选择的供应商在保存刷新后仍保留编辑上下文', async ({ page, request }) => {
  await request.post(`${backend}/__test/options`, { data: { paginated: true } });
  await page.goto('/platform/ai-models', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: '供应商', exact: true }).click();
  const rail = page.getByRole('complementary', { name: '供应商列表' });
  await rail.getByRole('button', { name: '下一页', exact: true }).click();
  await rail.getByRole('button', { name: '方舟测试', exact: true }).click();
  const providerTab = page.getByRole('tabpanel', { name: '供应商', exact: true });
  const editor = await regionWithTextboxValue(providerTab.getByRole('region', { name: '连接设置', exact: true }), 'ark');
  const nameInput = await textboxWithValue(editor, '方舟测试');
  await nameInput.fill('方舟跨页保留');
  await editor.getByRole('button', { name: '保存供应商', exact: true }).click();
  await expect(page.getByText('供应商配置已保存。', { exact: true })).toBeVisible();
  await expect(nameInput).toHaveValue('方舟跨页保留');
  await expect(await textboxWithValue(editor, 'ark')).toHaveValue('ark');
});
