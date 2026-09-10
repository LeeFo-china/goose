import { expect, test } from '@playwright/test';
import { action, count, detail, draft, open, quantity, reason, save, scenario, writes } from './warehouse-stocktakes-helpers';

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

for (const legacy of [false, true]) {
  test(`${legacy ? '旧前缀' : '新前缀'}未知命令实际退出登录后原样重试`, async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await open(page, 'unknown'); await draft(page); await save(page);
    await expect(page.getByRole('button', { name: '重试原请求' })).toBeEnabled();
    if (legacy) {
      // A previously deployed page may leave its old record without ever opening the new workspace.
      await page.goto('/inventory');
      expect(await page.evaluate(() => {
        const key = Object.keys(sessionStorage).find(value => value.endsWith(':warehouse-stocktake-command'));
        if (!key) return false;
        const raw = sessionStorage.getItem(key);
        if (!raw) return false;
        sessionStorage.setItem(key.replace('gooes:warehouse-stocktake-recovery:', 'gooes:admin-session:'), raw);
        sessionStorage.removeItem(key); return true;
      })).toBe(true);
    }
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.request.post('/api/auth/login', { data: { phone: 'other-user' } });
    await page.goto('/warehouse-stocktakes');
    await expect(page.getByRole('button', { name: '新建盘点' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '重试原请求' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '恢复未保存编辑' })).toHaveCount(0);
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.request.post('/api/auth/login', { data: { phone: 'all' } });
    await scenario(page, 'off'); await page.goto('/warehouse-stocktakes');
    await page.getByRole('button', { name: '重试原请求' }).click();
    await expect(detail(page)).toContainText('PDNEW');
    const requests = await writes(page); expect(requests).toHaveLength(2);
    expect(requests[1].path).toBe(requests[0].path);
    expect(requests[1].rawBody).toBe(requests[0].rawBody);
    expect(requests[1].key).toBe(requests[0].key);
    await expect(page.getByRole('button', { name: '恢复未保存编辑' })).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.endsWith(':warehouse-stocktake-command') || key.startsWith('gooes:warehouse-stocktake-editor:')))).toEqual([]);
  });
}

test('浏览器后退再前进恢复草稿，明确放弃后不再恢复', async ({ page }) => {
  await open(page); await page.goto('/inventory');
  await page.locator('main').getByRole('link', { name: '仓库盘点', exact: true }).click();
  await draft(page);
  await page.goBack(); await expect(page).toHaveURL(/\/inventory$/);
  await page.goForward();
  await page.getByRole('button', { name: '恢复未保存编辑' }).click();
  const editor = page.getByRole('region', { name: '盘点草稿' });
  await expect(editor.getByLabel('盘点原因')).toHaveValue('浏览器测试盘点');
  await expect(editor.getByLabel('盘点仓库', { exact: true })).toContainText('仓库01');
  await expect(editor.getByRole('button', { name: /^移除 节能灯01/ })).toBeVisible();
  expect(await writes(page)).toHaveLength(0);
  await page.getByRole('button', { name: '关闭编辑' }).click();
  await page.getByRole('button', { name: '放弃修改' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '新建盘点' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '恢复未保存编辑' })).toHaveCount(0);
});

test('浏览器后退恢复实盘零和未完成小数，关闭开关不允许恢复写入', async ({ page }) => {
  await open(page); await page.goto('/inventory');
  await page.locator('main').getByRole('link', { name: '仓库盘点', exact: true }).click();
  await page.getByRole('button', { name: '查看 PD0002' }).click();
  await action(page, '开始盘点'); await count(page);
  await quantity(page, 1).fill('0'); await reason(page, 1).fill('待核对');
  await quantity(page, 2).fill('1.');
  await page.goBack(); await expect(page).toHaveURL(/\/inventory$/);
  await scenario(page, 'off'); await page.goForward();
  await expect(page.getByRole('button', { name: '恢复未保存编辑' })).toBeDisabled();
  await scenario(page, 'normal'); await page.reload();
  await page.getByRole('button', { name: '恢复未保存编辑' }).click();
  await expect(quantity(page, 1)).toHaveValue('0'); await expect(reason(page, 1)).toHaveValue('待核对');
  await expect(quantity(page, 2)).toHaveValue('1.');
  expect(await writes(page)).toHaveLength(1);
});

test('编辑命令409保留原输入但不套到新版本，不自动重发', async ({ page }) => {
  await open(page, 'conflict'); await page.getByRole('button', { name: '查看 PD0002' }).click();
  await page.getByRole('button', { name: '编辑草稿' }).click();
  await page.getByLabel('盘点原因').fill('冲突前输入'); await save(page);
  await expect(detail(page)).toContainText('版本 2');
  await page.getByRole('button', { name: '恢复未保存编辑' }).click();
  await expect(page.getByText('单据身份、状态或版本已变化，不能恢复到新版本；原输入仍保留')).toBeVisible();
  expect(await writes(page)).toHaveLength(1);
  await page.getByRole('button', { name: '放弃恢复' }).click();
  await page.getByRole('button', { name: '放弃修改' }).click();
  await expect(page.getByRole('button', { name: '编辑草稿' })).toBeEnabled();
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
