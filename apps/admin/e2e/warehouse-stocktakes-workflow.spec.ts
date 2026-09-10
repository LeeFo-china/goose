import { expect, test } from '@playwright/test';
import { action, backend, count, detail, draft, open, quantity, reason, save, saveCounts, scenario, writes } from './warehouse-stocktakes-helpers';

test('详情往返保留关键词仓库状态和页码，取消后重读当前页', async ({ page }) => {
  await open(page);
  const list = page.getByRole('region', { name: '盘点单列表' });
  await list.getByLabel('搜索单号 / 原因').fill('PD');
  await list.getByLabel('搜索单号 / 原因').press('Enter');
  await list.getByLabel('状态', { exact: true }).click();
  await page.getByRole('option', { name: '草稿', exact: true }).click();
  await list.getByLabel('盘点仓库', { exact: true }).click();
  await page.getByRole('option', { name: '仓库01', exact: true }).click();
  const pager = page.getByRole('navigation', { name: '盘点单分页' });
  await pager.getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByRole('button', { name: '查看 PD0023', exact: true }).click();
  await page.getByRole('button', { name: '返回列表', exact: true }).click();
  await expect(pager).toContainText('第 2 / 2 页');
  await expect(list.getByLabel('搜索单号 / 原因')).toHaveValue('PD');
  await expect(list.getByLabel('状态', { exact: true })).toContainText('草稿');
  await expect(list.getByLabel('盘点仓库', { exact: true })).toContainText('仓库01');
  await page.getByRole('button', { name: '查看 PD0023', exact: true }).click();
  await action(page, '取消盘点'); await expect(detail(page)).toContainText('已取消');
  await page.getByRole('button', { name: '返回列表', exact: true }).click();
  await expect(pager).toContainText('共 22 条');
  await expect(pager).toContainText('第 2 / 2 页');
  await expect(page.getByRole('button', { name: '查看 PD0023', exact: true })).toHaveCount(0);
});

test('全流程精确盘盈盘亏，空白不是零，不发客户端成本，来源可追溯', async ({ page }, info) => {
  await open(page); await draft(page, 2);
  await page.screenshot({ path: info.outputPath('stocktake-draft.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await save(page); await expect(detail(page)).toContainText('PDNEW');
  await action(page, '开始盘点'); await expect(detail(page)).toContainText('盘点中');
  await count(page);
  await quantity(page, 1).fill('11.0001'); await saveCounts(page);
  await expect(page.getByText('节能灯01：请填写差异原因', { exact: true })).toBeVisible();
  expect(await writes(page)).toHaveLength(2);
  await reason(page, 1).fill('验收盘盈'); await saveCounts(page);
  await expect(detail(page)).toContainText('已实盘 1');
  await expect(page.getByRole('button', { name: '提交盘点' })).toHaveCount(0);
  expect((await writes(page))[2].body.items).toHaveLength(1);
  await count(page); await expect(quantity(page, 1)).toHaveValue('11.0001');
  await expect(quantity(page, 2)).toHaveValue('');
  await quantity(page, 2).fill('0'); await reason(page, 2).fill('验收盘亏');
  await page.screenshot({ path: info.outputPath('stocktake-counts.png'), fullPage: true });
  await saveCounts(page); await action(page, '提交盘点'); await action(page, '完成盘点');
  await expect(detail(page)).toContainText('已完成');
  await expect(detail(page)).toContainText('盘盈金额 8');
  await expect(detail(page)).toContainText('盘亏金额 80');
  await expect(page.getByRole('button', { name: '录入实盘', exact: true })).toHaveCount(0);
  const requests = await writes(page);
  expect(requests.map(row => row.path.split('/').at(-1))).toEqual(['save-draft', 'start', 'record-counts', 'record-counts', 'submit', 'complete']);
  expect(Object.keys(requests[0].body).sort()).toEqual(['expected_version', 'items', 'reason', 'warehouse_id']);
  expect(Object.keys(requests[0].body.items![0])).toEqual(['supplier_sku_id']);
  expect(requests[2].body.items![0].counted_quantity).toBe('11.0001');
  expect(requests[3].body.items![1].counted_quantity).toBe('0');
  for (const line of requests[3].body.items!) expect(Object.keys(line).sort()).toEqual(['counted_quantity', 'difference_reason', 'supplier_sku_id']);
  expect(requests.map(row => row.body.expected_version)).toEqual([0, 1, 2, 3, 4, 5]);
  await page.screenshot({ path: info.outputPath('stocktake-completed.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: '仓库库存', exact: true }).last().click();
  await page.getByRole('tab', { name: '库存流水' }).click();
  const links = page.getByRole('link', { name: '盘点单 PDNEW', exact: true });
  await expect(links).toHaveCount(2); // Both directions intentionally share one source.
  await links.first().click(); await expect(detail(page)).toContainText('PDNEW');
});

test('25行明细分页和完整编辑，分次录入首尾行保留，取消只读', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('table', { name: '盘点单列表' }).getByRole('row')).toHaveCount(21);
  await page.getByRole('navigation', { name: '盘点单分页' }).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看 PD0021' })).toBeVisible();
  await page.getByRole('navigation', { name: '盘点单分页' }).getByRole('button', { name: '上一页', exact: true }).click();
  await page.getByRole('button', { name: '查看 PD0002' }).click();
  const table = page.getByRole('table', { name: '盘点明细' });
  await expect(table.getByRole('row')).toHaveCount(21);
  await page.getByRole('navigation', { name: '盘点明细分页' }).getByRole('button', { name: '下一页', exact: true }).click();
  await expect(table.getByRole('row')).toHaveCount(6);
  await page.getByRole('button', { name: '编辑草稿' }).click();
  await expect(page.getByRole('button', { name: /^移除 / })).toHaveCount(25);
  await expect(page.getByRole('region', { name: '盘点草稿' }).getByLabel('盘点仓库', { exact: true })).toHaveCount(0);
  await save(page); await expect(detail(page)).toContainText('版本 2');
  expect((await writes(page))[0].body.items).toHaveLength(25);
  await action(page, '开始盘点'); await count(page);
  await expect(page.locator('input[id^="stocktake-count-"]')).toHaveCount(25);
  await quantity(page, 1).fill('10'); await saveCounts(page);
  await expect(detail(page)).toContainText('已实盘 1'); await count(page);
  await expect(quantity(page, 1)).toHaveValue('10'); await expect(quantity(page, 25)).toHaveValue('');
  await quantity(page, 25).fill('10'); await saveCounts(page);
  await expect(detail(page)).toContainText('已实盘 2'); await count(page);
  await expect(quantity(page, 1)).toHaveValue('10'); await expect(quantity(page, 25)).toHaveValue('10');
  await page.getByRole('button', { name: '关闭编辑' }).click();
  await action(page, '取消盘点'); await expect(detail(page)).toContainText('已取消');
  await expect(page.getByRole('button', { name: '录入实盘' })).toHaveCount(0);
});

test('零余额已有SKU可选入草稿，草稿取消不需录入数量', async ({ page }) => {
  await open(page); await draft(page, 3);
  await expect(page.getByText('节能灯03 · LED-03 · 库存 0.0000', { exact: true })).toBeVisible();
  await save(page); await expect(detail(page)).toContainText('3 种材料');
  expect((await writes(page))[0].body.items).toHaveLength(3);
  await action(page, '取消盘点'); await expect(detail(page)).toContainText('已取消');
});

test('完整明细校验阻止截断覆盖，非法数量不发送，未保存关闭和链接离开确认', async ({ page }) => {
  await open(page, 'incomplete'); await page.getByRole('button', { name: '查看 PD0002' }).click();
  await page.getByRole('button', { name: '编辑草稿' }).click();
  await expect(page.getByText('明细不完整或身份已变化，请重新读取后编辑')).toBeVisible();
  expect(await writes(page)).toHaveLength(0);
  await scenario(page, 'normal'); await action(page, '开始盘点'); await count(page);
  await quantity(page, 1).fill('1e2'); await saveCounts(page); expect(await writes(page)).toHaveLength(1);
  await page.getByRole('button', { name: '关闭编辑' }).click();
  await expect(page.getByRole('alertdialog')).toHaveAccessibleName('放弃未保存的修改？');
  await page.getByRole('button', { name: '继续编辑' }).click(); await expect(quantity(page, 1)).toHaveValue('1e2');
  await page.getByRole('link', { name: '仓库库存', exact: true }).last().click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: '放弃修改' }).click(); await expect(page).toHaveURL(/\/inventory$/);
});

test('只读无需项目采购权限，denied无数据请求，manage和approve独立', async ({ page }) => {
  await open(page, 'normal', 'read'); await page.getByRole('button', { name: '查看 PD0002' }).click();
  await expect(detail(page)).toContainText('PD0002');
  await expect(page.getByRole('button', { name: '新建盘点' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始盘点' })).toHaveCount(0);
  await open(page, 'normal', 'manage'); await page.getByRole('button', { name: '查看 PD0003' }).click();
  await expect(page.getByRole('button', { name: '取消盘点' })).toBeVisible();
  await expect(page.getByRole('button', { name: '完成盘点' })).toHaveCount(0);
  await page.request.post('/api/auth/login', { data: { phone: 'approve' } }); await page.reload();
  await page.getByRole('button', { name: '查看 PD0003' }).click();
  await expect(page.getByRole('button', { name: '取消盘点' })).toHaveCount(0);
  await action(page, '完成盘点'); await expect(detail(page)).toContainText('已完成');
  await open(page, 'normal', 'denied'); await expect(page.getByText('暂无盘点查看权限')).toBeVisible();
  const requests: { path: string }[] = await (await page.request.get(`${backend}/__test/requests`)).json();
  expect(requests.filter(row => row.path.startsWith('/warehouse-stocktakes'))).toHaveLength(0);
});

for (const value of ['off', 'settings-error', 'settings-invalid']) test(`${value}锁新写仍读历史`, async ({ page }) => {
  await open(page, value); await expect(page.getByRole('button', { name: '新建盘点' })).toBeDisabled();
  await page.getByRole('button', { name: '查看 PD0002' }).click();
  await expect(page.getByRole('button', { name: '开始盘点' })).toBeDisabled(); expect(await writes(page)).toHaveLength(0);
  if (value !== 'off') {
    await scenario(page, 'normal'); await page.getByRole('button', { name: '重试功能配置' }).click();
    await expect(page.getByRole('button', { name: '开始盘点' })).toBeEnabled();
  }
});

for (const value of ['snapshot-conflict', 'cost-basis']) test(`${value}不可强过或输入成本`, async ({ page }) => {
  await open(page, value); await page.getByRole('button', { name: '查看 PD0003' }).click(); await action(page, '完成盘点');
  await expect(page.getByText(value === 'snapshot-conflict' ? '库存快照已变化，请取消本盘点单并重新建立盘点，不可强制覆盖。' : '缺少可用成本依据，请先补齐仓库成本依据后重试；盘点不能手填成本。')).toBeVisible();
  await expect(detail(page)).toContainText('待确认');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '强制完成' })).toHaveCount(0);
  await action(page, '取消盘点'); await expect(detail(page)).toContainText('已取消');
  await page.getByRole('button', { name: '新建盘点' }).click(); await expect(page.getByRole('region', { name: '盘点草稿' })).toBeVisible();
});

test('慢列表响应不覆盖新搜索', async ({ page }) => {
  await open(page);
  const input = page.getByLabel('搜索单号 / 原因');
  await input.fill('慢响应');
  const started = page.waitForRequest(request => decodeURIComponent(request.url()).includes('keyword=慢响应'));
  await input.press('Enter'); await started;
  await input.fill('PD0002'); await input.press('Enter');
  await expect(page.getByRole('table', { name: '盘点单列表' }).getByRole('row')).toHaveCount(2);
  await page.waitForTimeout(1400); // Cross the fixture's known 1.2s stale-response boundary.
  await expect(page.getByRole('button', { name: '查看 PD0002' })).toBeVisible(); expect(await writes(page)).toHaveLength(0);
});
