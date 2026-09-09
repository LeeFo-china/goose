import { expect, test } from '@playwright/test';
import { action, detail, draft, open, save, scenario, writes } from './warehouse-stocktakes-helpers';

for (const value of ['unknown', 'invalid-success', 'rate-limit', 'network']) {
  test(`${value}冻结原始路径body字节和key，reload关闭开关仍可原样确认`, async ({ page }) => {
    await open(page, value); await draft(page); await save(page);
    await expect(page.getByRole('button', { name: '重试原请求' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '新建盘点' })).toBeDisabled();
    await scenario(page, 'off'); await page.reload();
    await expect(page.getByText('仓库盘点功能未开启')).toBeVisible();
    await page.getByRole('button', { name: '重试原请求' }).click();
    await expect(detail(page)).toContainText('PDNEW');
    const requests = await writes(page); expect(requests).toHaveLength(2);
    expect(requests[1].path).toBe(requests[0].path);
    expect(requests[1].rawBody).toBe(requests[0].rawBody);
    expect(requests[1].key).toBe(requests[0].key);
    await expect(page.getByRole('button', { name: '新建盘点' })).toBeDisabled();
  });
}

test('retry403仍保留，账号租户员工各自隔离', async ({ page }) => {
  await open(page, 'retry-denied'); await draft(page); await save(page);
  await page.getByRole('button', { name: '重试原请求' }).click();
  await expect(page.getByText('重试权限已撤销')).toBeVisible();
  await expect(page.getByRole('button', { name: '重试原请求' })).toBeEnabled();
  for (const persona of ['other-user', 'other-tenant', 'other-employee']) {
    await page.request.post('/api/auth/login', { data: { phone: persona } }); await page.reload();
    await expect(page.getByRole('button', { name: '新建盘点' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '重试原请求' })).toHaveCount(0);
  }
  expect(await writes(page)).toHaveLength(2);
});

test('版本冲突重读后必须手动确认，不自动重发', async ({ page }) => {
  await open(page, 'conflict'); await page.getByRole('button', { name: '查看 PD0002' }).click();
  await action(page, '开始盘点'); await expect(detail(page)).toContainText('版本 2');
  expect(await writes(page)).toHaveLength(1);
  await action(page, '开始盘点'); await expect(detail(page)).toContainText('盘点中');
  const requests = await writes(page); expect(requests).toHaveLength(2);
  expect(requests[1].body.expected_version).toBe(2); expect(requests[1].key).not.toBe(requests[0].key);
});

test('损坏存储不能启动新的写请求', async ({ page }) => {
  await open(page, 'unknown'); await draft(page); await save(page);
  await expect(page.getByRole('button', { name: '重试原请求' })).toBeEnabled();
  const changed = await page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(value => value.endsWith(':warehouse-stocktake-command'));
    if (!key) return false;
    sessionStorage.setItem(key, '{broken'); return true;
  });
  expect(changed).toBe(true); await page.reload();
  await expect(page.getByRole('button', { name: '新建盘点' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '重试原请求' })).toHaveCount(0);
  expect(await writes(page)).toHaveLength(1);
});

test('真实React开发StrictMode卸载旧实例，迟到成功不消费后续实例待确认请求', async ({ page }) => {
  await open(page, 'slow-success');
  await page.getByRole('button', { name: '查看 PD0002' }).click();
  await action(page, '开始盘点');
  await expect(page.getByRole('button', { name: '重试原请求' })).toBeDisabled();
  // Client navigation unmounts the live hook while the HTTP response remains pending.
  const inventory = page.locator('main').getByRole('link', { name: '仓库库存', exact: true });
  await expect(inventory).toHaveCount(1); await inventory.click();
  await expect(page).toHaveURL(/\/inventory$/);
  const stocktakes = page.locator('main').getByRole('link', { name: '仓库盘点', exact: true });
  await expect(stocktakes).toHaveCount(1); await stocktakes.click();
  await expect(page.getByRole('button', { name: '重试原请求' })).toBeEnabled();
  await page.waitForTimeout(2800); // Cross the old request's known 2.5s response boundary.
  await expect(page.getByRole('button', { name: '重试原请求' })).toBeEnabled();
  await page.getByRole('button', { name: '重试原请求' }).click();
  await expect(detail(page)).toContainText('盘点中');
  const requests = await writes(page); expect(requests).toHaveLength(2);
  expect(requests[1].rawBody).toBe(requests[0].rawBody); expect(requests[1].key).toBe(requests[0].key);
});
