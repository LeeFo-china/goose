import { expect, test, type Page } from '@playwright/test';
const backend = 'http://127.0.0.1:3997';
async function open(page: Page, scenario = 'normal', persona = 'all') {
  await page.request.post(`${backend}/__test/reset`, { data: { scenario } });
  await page.request.post('/api/auth/login', { data: { phone: persona } });
  await page.goto('/warehouse-issues');
}
async function writes(page: Page) {
  return (
    (await (await page.request.get(`${backend}/__test/requests`)).json()) as {
      path: string;
      method: string;
      key: string;
      body: unknown;
      completed: boolean;
    }[]
  ).filter((row) => row.method === 'POST');
}
async function create(page: Page, screenshotPath?: string) {
  await page.getByRole('button', { name: '新建领料', exact: true }).click();
  await expect(page.getByLabel('启用仓库', { exact: true })).toContainText(
    '仓库01',
  );
  await page.getByLabel('领料项目', { exact: true }).click();
  await page.getByRole('option', { name: '项目1', exact: true }).click();
  await page.getByLabel('库存材料', { exact: true }).click();
  await page.getByRole('option', { name: /节能灯01/ }).click();
  await page.getByLabel(/^数量 /).fill('2.0001');
  if (screenshotPath)
    await page.screenshot({ path: screenshotPath, fullPage: true });
  if (screenshotPath) {
    const save = page.getByRole('button', { name: '保存草稿', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeVisible();
    const box = await save.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    await page.screenshot({
      path: screenshotPath.replace('.png', '-actions.png'),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
}
async function action(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: '确认执行', exact: true }).click();
}
test('桌面和375屏完成新建、提交、确认及部分退料', async ({ page }, info) => {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await create(page, info.outputPath(`material-draft-${width}.png`));
    await expect(page.getByRole('heading', { name: 'LLNEW' })).toBeVisible();
    await action(page, '提交领料');
    await expect(page.getByLabel('单据详情')).toContainText('待出库');
    await action(page, '确认出库');
    await expect(page.getByLabel('单据详情')).toContainText('已领料');
    await page.getByRole('button', { name: '发起退料' }).click();
    await expect(page.getByLabel('材料草稿')).toContainText('可退');
    await page.getByLabel(/^数量 /).fill('1');
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'TLNEW' })).toBeVisible();
    await expect(page.getByRole('button', { name: '提交领料' })).toHaveCount(0);
    await action(page, '确认退料');
    await expect(page.getByLabel('单据详情')).toContainText('已退料');
    await expect(page.getByLabel('单据详情')).toContainText('成本金额 8');
    const returnCells = page
      .getByRole('table', { name: '材料明细' })
      .getByRole('row')
      .nth(1)
      .getByRole('cell');
    await expect(returnCells.nth(3)).toHaveText('8');
    await expect(returnCells.nth(6)).toHaveText('1.0000');
    await expect(returnCells.nth(7)).toHaveText('1.0001');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`material-return-${width}.png`),
      fullPage: true,
    });
    const requests = await writes(page);
    expect(requests).toHaveLength(5);
    expect(requests[0].body).toMatchObject({ items: [{ quantity: '2.0001' }] });
    await page
      .getByRole('link', { name: '原领料单 LLNEW', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'LLNEW', exact: true }),
    ).toBeVisible();
  }
});
test('分页历史、详情分页和完整25行草稿保存', async ({ page }) => {
  await open(page);
  const list = page.getByLabel('单据列表');
  await expect(
    page.getByRole('table', { name: '领退料单据' }).getByRole('row'),
  ).toHaveCount(21);
  await list
    .getByRole('button', { name: '下一页', exact: true })
    .last()
    .click();
  await expect(list).toContainText('LL0021');
  await list
    .getByRole('button', { name: '上一页', exact: true })
    .last()
    .click();
  await page.getByRole('button', { name: '查看 LL0002', exact: true }).click();
  await expect(
    page.getByRole('table', { name: '材料明细' }).getByRole('row'),
  ).toHaveCount(21);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(
    page.getByRole('table', { name: '材料明细' }).getByRole('row'),
  ).toHaveCount(6);
  await page.getByRole('button', { name: '编辑草稿' }).click();
  await expect(page.getByLabel(/^数量 /)).toHaveCount(25);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect.poll(async () => (await writes(page)).length).toBe(1);
  expect((await writes(page))[0].body).toMatchObject({
    items: expect.arrayContaining([
      { supplier_sku_id: expect.any(String), quantity: '10' },
    ]),
  });
  expect(
    ((await writes(page))[0].body as { items: unknown[] }).items,
  ).toHaveLength(25);
});
for (const scenario of [
  'unknown',
  'rate-limit',
  'retry-denied',
  'invalid-success',
])
  test(`${scenario}冻结并重试原请求，刷新后保留`, async ({ page }) => {
    await open(page, scenario);
    await create(page);
    await expect(page.getByText('上次请求结果尚未确认')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '保存草稿', exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(
      page.getByRole('button', { name: '重试原请求' }),
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: '新建领料', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: '重试原请求' }).click();
    if (scenario === 'retry-denied')
      await expect(page.getByText('上次请求结果尚未确认')).toBeVisible();
    else
      await expect(page.getByRole('heading', { name: 'LLNEW' })).toBeVisible();
    const requests = await writes(page);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      path: requests[0].path,
      key: requests[0].key,
      body: requests[0].body,
    });
  });
test('版本冲突刷新后由用户重新确认', async ({ page }) => {
  await open(page, 'conflict');
  await page.getByRole('button', { name: '查看 LL0002', exact: true }).click();
  await action(page, '提交领料');
  await expect(page.getByLabel('单据详情')).toContainText('版本 2');
  expect(await writes(page)).toHaveLength(1);
  await action(page, '提交领料');
  await expect(page.getByLabel('单据详情')).toContainText('待出库');
  const requests = await writes(page);
  expect(requests[1].key).not.toBe(requests[0].key);
  expect(requests[1].body).toEqual({ expected_version: 2 });
});
test('操作成功后读取失败仅重读', async ({ page }) => {
  await open(page, 'refresh-error');
  await create(page);
  await expect(page.getByText('单据读取失败', { exact: true })).toBeVisible();
  await page.request.post(`${backend}/__test/recover-reads`);
  await page.getByRole('button', { name: '重新读取单据' }).click();
  await expect(page.getByRole('heading', { name: 'LLNEW' })).toBeVisible();
  expect(await writes(page)).toHaveLength(1);
});
test('关闭、无效和读取失败的配置保持只读历史', async ({ page }) => {
  for (const scenario of ['off', 'settings-error', 'settings-invalid']) {
    await open(page, scenario);
    await expect(
      page.getByRole('button', { name: '新建领料', exact: true }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: '查看 LL0001', exact: true })
      .click();
    await expect(page.getByLabel('单据详情')).toContainText('80');
    await expect(page.getByRole('button', { name: '发起退料' })).toBeDisabled();
    expect(await writes(page)).toHaveLength(0);
  }
});
test('读和管理权限分离，库存来源不要求采购权限', async ({ page }) => {
  await open(page, 'normal', 'read');
  await expect(
    page.getByRole('button', { name: '新建领料', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '查看 LL0002', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑草稿' })).toHaveCount(0);
  await page.goto('/inventory');
  await page.getByRole('tab', { name: '库存流水' }).click();
  await page.getByRole('link', { name: '领料单 LL0001', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'LL0001' })).toBeVisible();
  await open(page, 'normal', 'manage');
  await page.getByRole('button', { name: '查看 LL0002', exact: true }).click();
  await action(page, '提交领料');
  await expect(page.getByLabel('单据详情')).toContainText('待出库');
  await expect(page.getByRole('button', { name: '确认出库' })).toHaveCount(0);
  await open(page, 'normal', 'denied');
  await expect(page.getByText('暂无领退料查看权限')).toBeVisible();
});
test('旧搜索响应不覆盖新筛选', async ({ page }) => {
  await open(page);
  const search = page.getByLabel('搜索单号 / 原因');
  await search.fill('慢响应');
  await search.press('Enter');
  await expect
    .poll(async () =>
      (
        (await (
          await page.request.get(`${backend}/__test/requests`)
        ).json()) as { path: string }[]
      ).some((row) => row.path.includes(encodeURIComponent('慢响应'))),
    )
    .toBe(true);
  await search.fill('LL0003');
  await search.press('Enter');
  await expect(page.getByRole('table', { name: '领退料单据' })).toContainText(
    'LL0003',
  );
  await expect
    .poll(async () =>
      (
        (await (
          await page.request.get(`${backend}/__test/requests`)
        ).json()) as { path: string; completed: boolean }[]
      ).some(
        (row) =>
          row.path.includes(encodeURIComponent('慢响应')) && row.completed,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole('table', { name: '领退料单据' }).getByRole('row'),
  ).toHaveCount(2);
});

test('库存与项目选择支持分页，数量校验与取消草稿', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '新建领料', exact: true }).click();
  await expect(page.getByLabel('启用仓库', { exact: true })).toContainText(
    '仓库01',
  );
  const projectField = page
    .getByLabel('领料项目', { exact: true })
    .locator('..');
  await projectField
    .getByRole('button', { name: '下一页', exact: true })
    .click();
  await page.getByLabel('领料项目', { exact: true }).click();
  await page.getByRole('option', { name: '项目21', exact: true }).click();
  const stockField = page.getByLabel('库存材料', { exact: true }).locator('..');
  await stockField.getByRole('button', { name: '下一页', exact: true }).click();
  await page.getByLabel('库存材料', { exact: true }).click();
  await page.getByRole('option', { name: /节能灯21/ }).click();
  await page.getByLabel(/^数量 /).fill('0');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByLabel('材料草稿').getByRole('alert')).toContainText(
    '数量必须大于 0',
  );
  expect(await writes(page)).toHaveLength(0);
  await page.getByLabel(/^数量 /).fill('1');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'LLNEW' })).toBeVisible();
  await page.getByRole('button', { name: '编辑草稿' }).click();
  await expect(page.getByLabel('启用仓库', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('领料项目', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭编辑' }).click();
  await action(page, '取消单据');
  await expect(page.getByLabel('单据详情')).toContainText('已取消');
});

test('网络中断保留原请求，跨用户会话不能恢复其他用户请求', async ({ page }) => {
  await open(page);
  let first = true;
  await page.route(
    '**/api/backend/warehouse-issues/*/save-draft',
    async (route) => {
      const response = await route.fetch();
      if (!first) return route.fulfill({ response });
      first = false;
      await route.abort('timedout');
    },
  );
  await create(page);
  await expect(page.getByText('上次请求结果尚未确认')).toBeVisible();
  await page.getByRole('button', { name: '重试原请求' }).click();
  await expect(page.getByRole('heading', { name: 'LLNEW' })).toBeVisible();
  const requests = await writes(page);
  expect(requests[1]).toMatchObject({
    key: requests[0].key,
    body: requests[0].body,
  });
  await page.unrouteAll({ behavior: 'wait' });
  await open(page, 'unknown');
  await create(page);
  await expect(page.getByText('上次请求结果尚未确认')).toBeVisible();
  await page.request.post('/api/auth/login', { data: { phone: 'other' } });
  await page.goto('/warehouse-issues');
  await expect(page.getByRole('table', { name: '领退料单据' })).toBeVisible();
  await expect(page.getByText('上次请求结果尚未确认')).toHaveCount(0);
});

test('大写UUID来源详情的未知命令刷新后保持原path并接受规范回执', async ({
  page,
}) => {
  await open(page, 'unknown');
  const id = '88ABCDEF-0000-4000-8000-000000000101';
  await page.goto(`/warehouse-issues?order_id=${id}`);
  await expect(
    page.getByRole('heading', { name: 'LL0002', exact: true }),
  ).toBeVisible();
  await action(page, '提交领料');
  await expect(page.getByText('上次请求结果尚未确认')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '重试原请求' }).click();
  await expect(page.getByText('上次请求结果尚未确认')).toHaveCount(0);
  await expect(page.getByLabel('单据详情')).toContainText('待出库');
  const requests = await writes(page);
  expect(requests).toHaveLength(2);
  expect(requests[0].path).toContain(id);
  expect(requests[1]).toMatchObject({
    path: requests[0].path,
    key: requests[0].key,
    body: requests[0].body,
  });
});
