import { expect, test, type Page } from '@playwright/test';

const backend = 'http://127.0.0.1:3999';
type Write = { path: string; method: string; key: string; body: { expected_version: number; items?: { supplier_sku_id: string; quantity: string }[] } };
async function open(page: Page, scenario = 'normal', persona = 'all') {
  await page.request.post(`${backend}/__test/reset`, { data: { scenario } });
  await page.request.post('/api/auth/login', { data: { phone: persona } });
  await page.goto('/warehouse-transfers');
}
async function writes(page: Page): Promise<Write[]> {
  return ((await (await page.request.get(`${backend}/__test/requests`)).json()) as Write[]).filter(row => row.method === 'POST');
}
async function selectWarehouse(page: Page, label: string, name: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name, exact: true }).click();
}
async function draft(page: Page) {
  await page.getByRole('button', { name: '新建调拨', exact: true }).click();
  await selectWarehouse(page, '调出仓库', '仓库01');
  await selectWarehouse(page, '调入仓库', '仓库02');
  await page.getByLabel('调拨原因', { exact: true }).fill('浏览器测试调拨');
  await page.getByLabel('调出仓库存料', { exact: true }).click();
  await page.getByRole('option', { name: /节能灯01/ }).click();
  await page.locator('input[id^="transfer-quantity-"]').fill('2.0001');
}
async function save(page: Page) { await page.getByRole('button', { name: '保存草稿', exact: true }).click(); }
async function action(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
}
test('新建到完成保持精确数量与请求字段，终态只读且来源可追溯', async ({ page }, info) => {
  await open(page); await draft(page);
  await page.screenshot({ path: info.outputPath('transfer-draft.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '保存草稿', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('transfer-draft-actions.png'), fullPage: true });
  await save(page);
  await expect(page.getByRole('heading', { name: 'DBNEW', exact: true })).toBeVisible();
  await action(page, '提交调拨');
  await expect(page.getByRole('region', { name: '调拨单详情' })).toContainText('待调拨');
  await action(page, '完成调拨');
  const detail = page.getByRole('region', { name: '调拨单详情' });
  await expect(detail).toContainText('已调拨');
  await expect(detail).toContainText('总金额 16');
  await expect(page.getByRole('button', { name: '编辑草稿' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '完成调拨' })).toHaveCount(0);
  const requests = await writes(page);
  expect(requests).toHaveLength(3);
  expect(requests[0].body.items?.[0].quantity).toBe('2.0001');
  expect(Object.keys(requests[0].body).sort()).toEqual(['destination_warehouse_id', 'expected_version', 'items', 'reason', 'source_warehouse_id']);
  expect(Object.keys(requests[0].body.items![0]).sort()).toEqual(['quantity', 'supplier_sku_id']);
  expect(requests[1].body).toEqual({ expected_version: 1 });
  expect(requests[2].body).toEqual({ expected_version: 2 });
  await page.screenshot({ path: info.outputPath('transfer-completed.png'), fullPage: true });
  await page.goto('/inventory');
  await page.getByRole('tab', { name: '库存流水' }).click();
  // Both directions intentionally link to the same completed document.
  const links = page.getByRole('link', { name: '调拨单 DBNEW', exact: true });
  await expect(links).toHaveCount(2);
  await links.first().click();
  await expect(page.getByRole('heading', { name: 'DBNEW', exact: true })).toBeVisible();
});
test('列表和明细分页，编辑完整25行不截断，取消需确认', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('table', { name: '调拨单列表' }).getByRole('row')).toHaveCount(21);
  await page.getByRole('navigation', { name: '调拨单分页' }).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看 DB0021' })).toBeVisible();
  await page.getByRole('navigation', { name: '调拨单分页' }).getByRole('button', { name: '上一页', exact: true }).click();
  await page.getByRole('button', { name: '查看 DB0002' }).click();
  await expect(page.getByRole('table', { name: '调拨明细' }).getByRole('row')).toHaveCount(21);
  await page.getByRole('navigation', { name: '调拨明细分页' }).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('table', { name: '调拨明细' }).getByRole('row')).toHaveCount(6);
  await page.getByRole('button', { name: '编辑草稿' }).click();
  await expect(page.locator('input[id^="transfer-quantity-"]')).toHaveCount(25);
  await expect(page.getByText('如需更换仓库，请新建调拨单', { exact: false })).toBeVisible();
  await expect(page.getByLabel('调出仓库', { exact: true })).toHaveCount(0);
  await save(page);
  await expect(page.getByRole('heading', { name: 'DB0002', exact: true })).toBeVisible();
  expect((await writes(page))[0].body.items).toHaveLength(25);
  await action(page, '取消调拨');
  await expect(page.getByRole('region', { name: '调拨单详情' })).toContainText('已取消');
});
test('明细不完整禁止编辑覆盖', async ({ page }) => {
  await open(page, 'incomplete');
  await page.getByRole('button', { name: '查看 DB0002' }).click();
  await page.getByRole('button', { name: '编辑草稿' }).click();
  await expect(page.getByText('明细不完整或身份已变化，请重新读取后编辑')).toBeVisible();
  await expect(page.getByRole('region', { name: '调拨草稿' })).toHaveCount(0);
  expect(await writes(page)).toHaveLength(0);
});
test('调出仓变化清空材料，同仓和非法数量不得发送', async ({ page }) => {
  await open(page); await draft(page);
  await selectWarehouse(page, '调入仓库', '仓库01'); await save(page);
  expect(await writes(page)).toHaveLength(0);
  await selectWarehouse(page, '调入仓库', '仓库02');
  await page.locator('input[id^="transfer-quantity-"]').fill('1e2'); await save(page);
  expect(await writes(page)).toHaveLength(0);
  await selectWarehouse(page, '调出仓库', '仓库03');
  await expect(page.locator('input[id^="transfer-quantity-"]')).toHaveCount(0);
});
test('只读用户无需项目权限，无权限不读数据，关闭开关保留历史', async ({ page }) => {
  await open(page, 'normal', 'read');
  await expect(page.getByRole('button', { name: '新建调拨' })).toHaveCount(0);
  await page.getByRole('button', { name: '查看 DB0002' }).click();
  await expect(page.getByRole('heading', { name: 'DB0002' })).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑草稿' })).toHaveCount(0);
  await open(page, 'off');
  await expect(page.getByRole('button', { name: '新建调拨' })).toBeDisabled();
  await page.getByRole('button', { name: '查看 DB0002' }).click();
  await expect(page.getByRole('button', { name: '编辑草稿' })).toBeDisabled();
  await open(page, 'normal', 'denied');
  await expect(page.getByText('暂无调拨查看权限')).toBeVisible();
  const requests: { path: string }[] = await (await page.request.get(`${backend}/__test/requests`)).json();
  expect(requests.filter(row => row.path.startsWith('/warehouse-transfers'))).toHaveLength(0);
});
for (const scenario of ['unknown', 'invalid-success', 'rate-limit']) {
  test(`${scenario}冻结原请求，刷新且开关关闭后仍可确认原结果`, async ({ page }) => {
    await open(page, scenario); await draft(page); await save(page);
    await expect(page.getByRole('button', { name: '重试原请求' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '新建调拨' })).toBeDisabled();
    await page.request.post(`${backend}/__test/scenario`, { data: { scenario: 'off' } });
    await page.reload();
    await expect(page.getByText('仓库调拨功能未开启')).toBeVisible();
    await page.getByRole('button', { name: '重试原请求' }).click();
    await expect(page.getByRole('heading', { name: 'DBNEW', exact: true })).toBeVisible();
    const requests = await writes(page);
    expect(requests).toHaveLength(2);
    expect(requests[1].key).toBe(requests[0].key); expect(requests[1].body).toEqual(requests[0].body);
    await expect(page.getByRole('button', { name: '新建调拨' })).toBeDisabled();
  });
}
test('版本冲突重读并需再次确认，不自动重发', async ({ page }) => {
  await open(page, 'conflict'); await page.getByRole('button', { name: '查看 DB0002' }).click();
  await action(page, '提交调拨');
  await expect(page.getByRole('region', { name: '调拨单详情' })).toContainText('版本 2');
  expect(await writes(page)).toHaveLength(1);
  await action(page, '提交调拨');
  await expect(page.getByRole('region', { name: '调拨单详情' })).toContainText('待调拨');
  const requests = await writes(page);
  expect(requests).toHaveLength(2); expect(requests[1].body.expected_version).toBe(2); expect(requests[1].key).not.toBe(requests[0].key);
});
test('库存不足保留待调拨且不显示成功', async ({ page }) => {
  await open(page, 'insufficient'); await page.getByRole('button', { name: '查看 DB0002' }).click();
  await action(page, '提交调拨'); await action(page, '完成调拨');
  await expect(page.getByText('源仓库存不足')).toBeVisible();
  await expect(page.getByRole('region', { name: '调拨单详情' })).toContainText('待调拨');
  await expect(page.getByRole('button', { name: '重试原请求' })).toHaveCount(0);
});
test('未知请求重试被拒绝仍保留，切换员工后不带入旧命令', async ({ page }) => {
  await open(page, 'retry-denied'); await draft(page); await save(page);
  await page.getByRole('button', { name: '重试原请求' }).click();
  await expect(page.getByText('重试权限已撤销')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试原请求' })).toBeVisible();
  await page.request.post('/api/auth/login', { data: { phone: 'other' } });
  await page.reload();
  await expect(page.getByText('当前为只读权限；', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '重试原请求' })).toHaveCount(0);
});

test('管理与审批权限分离，审批员工只能完成已提交单据', async ({ page }) => {
  await open(page, 'normal', 'manage');
  await page.getByRole('button', { name: '查看 DB0002' }).click();
  await action(page, '提交调拨');
  await expect(page.getByRole('region', { name: '调拨单详情' })).toContainText('待调拨');
  await expect(page.getByRole('button', { name: '完成调拨' })).toHaveCount(0);
  await page.request.post('/api/auth/login', { data: { phone: 'approve' } });
  await page.reload();
  await expect(page.getByRole('button', { name: '新建调拨' })).toHaveCount(0);
  await page.getByRole('button', { name: '查看 DB0002' }).click();
  await expect(page.getByRole('button', { name: '取消调拨' })).toHaveCount(0);
  await action(page, '完成调拨');
  await expect(page.getByRole('region', { name: '调拨单详情' })).toContainText('已调拨');
  expect((await writes(page)).map(row => row.path.split('/').at(-1))).toEqual(['submit', 'complete']);
});

for (const scenario of ['settings-error', 'settings-invalid']) {
  test(`${scenario}禁止新写，配置重读成功后恢复`, async ({ page }) => {
    await open(page, scenario);
    await expect(page.getByText('功能配置读取失败', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '新建调拨' })).toBeDisabled();
    await page.getByRole('button', { name: '查看 DB0002' }).click();
    await expect(page.getByRole('button', { name: '提交调拨' })).toBeDisabled();
    expect(await writes(page)).toHaveLength(0);
    await page.request.post(`${backend}/__test/scenario`, { data: { scenario: 'normal' } });
    await page.getByRole('button', { name: '重试功能配置' }).click();
    await expect(page.getByRole('button', { name: '提交调拨' })).toBeEnabled();
    expect(await writes(page)).toHaveLength(0);
  });
}

test('慢列表响应不能覆盖更新后的搜索结果', async ({ page }) => {
  await open(page);
  const search = page.locator('form').filter({ has: page.getByLabel('搜索单号 / 原因') }).getByRole('button', { name: '搜索', exact: true });
  await page.getByLabel('搜索单号 / 原因').fill('慢响应');
  const started = page.waitForRequest(request => decodeURIComponent(request.url()).includes('keyword=慢响应'));
  await search.click();
  await started;
  await page.getByLabel('搜索单号 / 原因').fill('DB0002');
  await search.click();
  await expect(page.getByRole('table', { name: '调拨单列表' }).getByRole('row')).toHaveCount(2);
  // The local fixture holds the obsolete request for 1.2s; cross that known boundary.
  await page.waitForTimeout(1400);
  await expect(page.getByRole('button', { name: '查看 DB0002' })).toBeVisible();
  expect(await writes(page)).toHaveLength(0);
});

test('历史筛选包含停用仓库，新建不提供停用仓库', async ({ page }) => {
  await open(page);
  await page.getByLabel('搜索调出仓库', { exact: true }).fill('仓库25');
  await page.getByLabel('搜索调出仓库', { exact: true }).press('Enter');
  await selectWarehouse(page, '调出仓库', '仓库25（已停用）');
  await expect(page.getByText('暂无符合条件的调拨单', { exact: true })).toBeVisible();
  const requests: { path: string }[] = await (await page.request.get(`${backend}/__test/requests`)).json();
  expect(requests.some(row => row.path.includes('sourceWarehouseId=77000000-0000-4000-8000-000000000124'))).toBe(true);
  await page.getByRole('button', { name: '新建调拨', exact: true }).click();
  await page.getByLabel('搜索调出仓库', { exact: true }).fill('仓库25');
  await page.getByLabel('搜索调出仓库', { exact: true }).press('Enter');
  await expect(page.getByText('暂无可选调出仓库', { exact: true })).toBeVisible();
  expect(await writes(page)).toHaveLength(0);
});
