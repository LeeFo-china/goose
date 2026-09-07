import { expect, test, type Page } from '@playwright/test';

const backend = 'http://127.0.0.1:4007';
async function openInventory(page: Page, persona = 'all', scenario = 'normal') {
  expect(
    (
      await page.request.post(`${backend}/__test/reset`, { data: { scenario } })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { phone: persona, code: '' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/inventory');
  await expect(
    page.getByRole('tab', { name: '库存余额', exact: true }),
  ).toBeVisible();
}
const table = (page: Page) => page.getByRole('table');
const next = (page: Page) =>
  page.getByRole('button', { name: '下一页', exact: true });

test('375宽屏空结果及错误操作无需横向滚动即可到达', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openInventory(page, 'stock');
  await expect(table(page).getByRole('row')).toHaveCount(21);
  await search(page, '不存在的商品');
  await expect(table(page)).toContainText('暂无符合条件的库存余额');
  await page.screenshot({
    path: testInfo.outputPath('inventory-mobile-empty.png'),
    fullPage: true,
  });
  const clear = table(page).getByRole('button', { name: '清除筛选' });
  const clearBox = await clear.boundingBox();
  expect(clearBox?.x).toBeGreaterThanOrEqual(0);
  expect(clearBox && clearBox.x + clearBox.width).toBeLessThanOrEqual(375);
  await clear.click();
  await expect(table(page).getByRole('row')).toHaveCount(21);
  await openInventory(page, 'stock', 'error-once');
  await expect(table(page).getByRole('alert')).toContainText(
    '库存验收暂时不可用',
  );
  await page.screenshot({
    path: testInfo.outputPath('inventory-mobile-error.png'),
    fullPage: true,
  });
  const retry = table(page).getByRole('button', { name: '重试' });
  const retryBox = await retry.boundingBox();
  expect(retryBox?.x).toBeGreaterThanOrEqual(0);
  expect(retryBox && retryBox.x + retryBox.width).toBeLessThanOrEqual(375);
  const alertBox = await table(page).getByRole('alert').boundingBox();
  expect(alertBox && alertBox.x + alertBox.width).toBeLessThanOrEqual(375);
  await retry.click();
  await expect(table(page).getByRole('row')).toHaveCount(21);
});
async function search(page: Page, keyword: string) {
  await page.getByLabel('商品 / SKU', { exact: true }).fill(keyword);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
}
async function journal(page: Page) {
  return (await (
    await page.request.get(`${backend}/__test/requests`)
  ).json()) as Array<{ path: string; completed: boolean }>;
}

test('有采购单查看但无仓库查看时保留来源单号、不提供详情链接', async ({
  page,
}) => {
  await openInventory(page, 'stock-order');
  await page.getByRole('tab', { name: '库存流水' }).click();
  await expect(table(page)).toContainText('采购单 CG0001');
  await expect(table(page).getByRole('link')).toHaveCount(0);
  expect(
    (await journal(page)).filter(({ path }) => path.startsWith('/warehouses')),
  ).toHaveLength(0);
});

test('余额分页、搜索、仓库与 SKU 下钻及流水类型使用真实控件', async ({
  page,
}, testInfo) => {
  await openInventory(page);
  await expect(table(page).getByRole('row')).toHaveCount(21);
  await page.screenshot({
    path: testInfo.outputPath('inventory-desktop.png'),
    fullPage: true,
  });
  await next(page).click();
  await expect(
    table(page).getByText('节能灯21', { exact: true }),
  ).toBeVisible();
  await search(page, '节能灯01');
  await expect(table(page).getByRole('row')).toHaveCount(2);
  await table(page)
    .getByRole('button', { name: '仓库01', exact: true })
    .click();
  await expect(
    page.getByLabel('仓库', { exact: true }),
  ).toContainText('仓库01');
  await table(page)
    .getByRole('button', { name: '查看 节能灯01 在 仓库01 的流水' })
    .click();
  await expect(page.getByRole('tab', { name: '库存流水' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(table(page).getByRole('row')).toHaveCount(3);
  await page.getByRole('combobox', { name: '流水类型' }).click();
  await page.getByRole('option', { name: '库存调减', exact: true }).click();
  await expect(table(page).getByRole('row')).toHaveCount(2);
  await expect(table(page)).toContainText('-2');
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(table(page).getByRole('row')).toHaveCount(21);
  await page.getByRole('combobox', { name: '每页条数' }).click();
  await page.getByRole('option', { name: '100', exact: true }).click();
  await expect(table(page).getByRole('row')).toHaveCount(47);
});

test('来源单号与链接权限，以及仅 stock 用户不请求仓库目录', async ({
  page,
}) => {
  await openInventory(page, 'stock');
  await expect(
    table(page).getByText('节能灯01', { exact: true }),
  ).toBeVisible();
  await table(page)
    .getByRole('button', { name: '仓库01', exact: true })
    .first()
    .click();
  await expect(table(page).getByRole('row')).toHaveCount(3);
  await page.getByRole('tab', { name: '库存流水' }).click();
  await expect(table(page)).toContainText('收货单 RK0001');
  await expect(table(page)).toContainText('采购单 CG0001');
  await expect(table(page).getByRole('link')).toHaveCount(0);
  expect(
    (await journal(page)).filter(({ path }) => path.startsWith('/warehouses')),
  ).toHaveLength(0);
  await openInventory(page);
  await page.getByRole('tab', { name: '库存流水' }).click();
  await expect(
    table(page).getByRole('link', { name: '采购单 CG0001', exact: true }),
  ).toHaveAttribute('href', /supplier-purchase-orders\?purchase_order_id=/);
  await expect(table(page)).toContainText('来源单据不可用');
});

test('仓库分页收进面板且跨页保留选择、键盘可操作', async ({ page }, testInfo) => {
  await openInventory(page);
  await expect(page.getByRole('heading', { name: '仓库库存', exact: true })).toHaveCount(0);
  await expect(page.getByText('查看仓库库存余额与出入库记录。')).toHaveCount(0);
  await expect(page.getByPlaceholder('搜索仓库名称')).toHaveCount(0);
  await expect(page.getByText(/页仓库选项/)).toHaveCount(0);
  const warehouse = page.getByLabel('仓库', { exact: true });
  await warehouse.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu', { name: '仓库选项' });
  await expect(menu).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: '下一页仓库选项' }),
  ).toBeEnabled();
  await page.getByRole('menuitem', { name: '下一页仓库选项' }).click();
  await expect(page.getByText('第 2 / 2 页仓库选项')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('inventory-warehouse-menu.png'), fullPage: true });
  await page
    .getByRole('menuitemradio', { name: '仓库25（已停用）', exact: true })
    .click();
  await expect(menu).toHaveCount(0);
  await expect(warehouse).toBeFocused();
  await expect(
    table(page).getByText('节能灯25', { exact: true }),
  ).toBeVisible();
  await warehouse.click();
  await page.getByRole('menuitem', { name: '上一页仓库选项' }).click();
  await expect(page.getByText('第 1 / 2 页仓库选项')).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: '仓库25', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(warehouse).toBeFocused();
  await expect(warehouse).toContainText('仓库25');
  await warehouse.press('ArrowDown');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(warehouse).toContainText('全部仓库');
  await expect(table(page).getByRole('row')).toHaveCount(21);
  const requests = (await journal(page)).filter(({ path }) => path.startsWith('/warehouses'));
  expect(requests.length).toBeGreaterThan(1);
  for (const { path } of requests) {
    const params = new URL(path, backend).searchParams;
    expect(params.get('pageSize')).toBe('20');
    expect(params.has('keyword')).toBe(false);
  }
});

test('单页仓库不展示分页，空目录及失败重试仍可操作', async ({ page }) => {
  await openInventory(page, 'all', 'warehouse-single');
  await page.getByLabel('仓库', { exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: '仓库01', exact: true })).toBeVisible();
  await expect(page.getByText(/页仓库选项/)).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /页仓库选项/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await openInventory(page, 'all', 'warehouse-empty');
  await page.getByLabel('仓库', { exact: true }).click();
  await expect(page.getByRole('status')).toContainText('暂无仓库选项');
  await page.getByRole('menuitemradio', { name: '全部仓库' }).click();
  await openInventory(page, 'all', 'warehouse-error-once');
  await page.getByLabel('仓库', { exact: true }).click();
  await expect(page.getByRole('menu').getByRole('alert')).toContainText('仓库选项验收暂时不可用');
  await page.getByRole('menuitem', { name: '重试', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: '仓库01', exact: true })).toBeVisible();
});

test('375宽屏长仓库名称、展开滚动和选中态不溢出', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openInventory(page, 'all', 'warehouse-long-name');
  const warehouse = page.getByLabel('仓库', { exact: true });
  await warehouse.click();
  const menu = page.getByRole('menu', { name: '仓库选项' });
  const longName = '固始晴天装饰工程有限公司华东区域材料集中配送及售后备件周转仓库';
  await expect(page.getByRole('menuitemradio', { name: longName })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('inventory-mobile-open-long-name.png'), fullPage: true });
  expect(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const bounds = await menu.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 375).toBe(true);
  await page.getByRole('menuitem', { name: '下一页仓库选项' }).click();
  await expect(page.getByRole('menuitemradio', { name: '仓库25（已停用）' })).toBeVisible();
  await page.getByRole('menuitem', { name: '上一页仓库选项' }).click();
  await page.getByRole('menuitemradio', { name: longName }).click();
  await expect(warehouse).toContainText(longName);
  await expect(table(page).getByRole('row')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await warehouse.click();
  await expect(page.getByRole('menuitemradio', { name: longName })).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: testInfo.outputPath('inventory-mobile-open-selected.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(warehouse).toBeFocused();
});

test('空结果、接口错误重试以及无权限状态', async ({ page }) => {
  await openInventory(page, 'all', 'error-once');
  await expect(table(page).getByRole('alert')).toContainText(
    '库存验收暂时不可用',
  );
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(
    table(page).getByText('节能灯01', { exact: true }),
  ).toBeVisible();
  await search(page, '不存在的商品');
  await expect(table(page)).toContainText('暂无符合条件的库存余额');
  await table(page).getByRole('button', { name: '清除筛选' }).click();
  await expect(table(page).getByRole('row')).toHaveCount(21);
  expect(
    (
      await page.request.post('/api/auth/login', { data: { phone: 'denied' } })
    ).ok(),
  ).toBe(true);
  await page.goto('/inventory');
  await expect(
    page.getByRole('alert').filter({ hasText: '暂无库存查看权限' }),
  ).toBeVisible();
  await expect(page.getByRole('tablist')).toHaveCount(0);
});

test('延迟的旧搜索响应不能覆盖新搜索或已切换标签页', async ({ page }) => {
  await openInventory(page);
  await expect(table(page).getByRole('row')).toHaveCount(21);
  await search(page, '慢响应');
  await expect(table(page)).toHaveAttribute('aria-busy', 'true');
  await expect
    .poll(async () =>
      (await journal(page)).some(({ path }) =>
        path.includes(encodeURIComponent('慢响应')),
      ),
    )
    .toBe(true);
  await search(page, '节能灯02');
  await expect(
    table(page).getByText('节能灯02', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await journal(page)).some(
        ({ path, completed }) =>
          path.includes(encodeURIComponent('慢响应')) && completed,
      ),
    )
    .toBe(true);
  await expect(
    table(page).getByText('节能灯02', { exact: true }),
  ).toBeVisible();
  await search(page, '慢响应切换');
  await expect
    .poll(async () =>
      (await journal(page)).some(({ path }) =>
        path.includes(encodeURIComponent('慢响应切换')),
      ),
    )
    .toBe(true);
  await page.getByRole('tab', { name: '库存流水' }).click();
  await expect(table(page)).toContainText('采购入库');
  await expect
    .poll(async () =>
      (await journal(page)).some(
        ({ path, completed }) =>
          path.includes(encodeURIComponent('慢响应切换')) && completed,
      ),
    )
    .toBe(true);
  await expect(table(page)).toHaveAttribute('aria-label', '库存流水');
  await expect(table(page)).not.toContainText('慢响应商品');
});

test('375宽屏和键盘导航保留可见分页且文档不横向溢出', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openInventory(page, 'stock');
  await expect(table(page).getByRole('row')).toHaveCount(21);
  await page.getByRole('tab', { name: '库存余额' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '库存流水' })).toBeFocused();
  await expect(table(page)).toContainText('采购入库');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    'BODY',
  );
  await expect(next(page)).toBeVisible();
  const box = await next(page).boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(812);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('inventory-mobile.png'),
    fullPage: true,
  });
  await openInventory(page);
  await expect(table(page).getByRole('row')).toHaveCount(21);
  await expect(next(page)).toBeVisible();
  const fullBox = await next(page).boundingBox();
  expect(fullBox && fullBox.y + fullBox.height).toBeLessThanOrEqual(812);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('inventory-mobile-warehouse-options.png'),
    fullPage: true,
  });
});
