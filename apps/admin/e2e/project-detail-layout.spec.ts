import { expect, test } from '@playwright/test';
const projectId = '50000000-0000-4000-8000-000000000001';
test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{ name: 'gooes_admin_token', value: 'layout-fixture', url: 'http://127.0.0.1:3046' }]);
});
for (const width of [1920, 1440, 1280, 720, 390]) {
  test(`长地址总览在 ${width}px 不溢出且状态可读`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/projects/${projectId}?tab=overview`);
    const panel = page.getByTestId('project-detail-overview-workbench');
    await expect(panel.getByText('58.8%', { exact: true })).toBeVisible();
    const scroll = page.getByTestId('project-detail-scroll-region');
    expect(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(panel.getByText('流程运行中', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('未定位当前节点', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('合同未收金额', { exact: true })).toBeVisible();
    await expect(panel.getByText('¥56,000.00', { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`overview-${width}.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('页签导航、明细展开和刷新保留可用性', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/projects/${projectId}?tab=overview`);
  await expect(page.getByText('58.8%', { exact: true })).toBeVisible();
  for (const label of ['成本预算', '应收计划']) {
    const toggle = page.getByTestId('project-overview-secondary-actions').getByRole('button', { name: label, exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#project-finance-detail')).toBeVisible();
    expect(await page.getByTestId('project-detail-scroll-region').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`${label}.png`), fullPage: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  const nav = page.getByRole('navigation', { name: '项目详情导航' });
  for (const [label, tab] of [['施工日志', 'logs'], ['成员/状态', 'members'], ['工序验收', 'acceptances'], ['总览', 'overview']]) {
    await nav.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
    await expect(nav.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  const calls = new Set<string>();
  page.on('response', response => { if (response.ok()) calls.add(new URL(response.url()).pathname); });
  await page.getByTestId('project-detail-header').getByRole('button', { name: '刷新', exact: true }).click();
  await expect.poll(() => calls.has(`/api/backend/projects/${projectId}/finance-summary`)).toBe(true);
  await expect.poll(() => calls.has(`/api/backend/workflow-subjects/project/${projectId}/state`)).toBe(true);
  await expect.poll(() => calls.has(`/api/backend/projects/${projectId}/employee-detail-bootstrap`)).toBe(true);
  expect(errors).toEqual([]);
});

test('流程加载错误可重试，运行中未定位节点不会被隐藏', async ({ page }) => {
  let fail = true;
  await page.route('**/api/backend/workflow-subjects/project/*/state', route => route.fulfill({
    status: fail ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(fail ? { success: false, message: '流程暂不可用' } : { success: true, data: {
      workflow_state: { instance_status: 'running', current_node_title: '水电', current_node_key: 'water', actions: [], timeline_nodes: [] },
    } }),
  }));
  await page.goto(`/projects/${projectId}?tab=overview`);
  await expect(page.getByText('流程暂不可用', { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: '刷新项目流程', exact: true }).click();
  await expect(page.getByText('未定位当前节点', { exact: true })).toBeVisible();
  await expect(page.getByText('流程已结束', { exact: true })).toHaveCount(0);
});

test('窄视口与200%文本放大后仍可访问明细', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 700 });
  await page.goto(`/projects/${projectId}?tab=overview`);
  await expect(page.getByText('58.8%', { exact: true })).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const scroll = page.getByTestId('project-detail-scroll-region');
  expect(await scroll.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '应收计划', exact: true }).click();
  await expect(page.locator('#project-finance-detail')).toBeVisible();
});


test('超宽屏财务两列充分利用宽度', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/projects/${projectId}?tab=overview`);
  const finance = page.getByTestId('project-finance-operating-summary');
  await expect(finance.getByText('58.8%', { exact: true })).toBeVisible();
  const panelWidth = (await finance.boundingBox())!.width;
  const chartWidth = (await page.getByTestId('project-finance-flow-analysis').boundingBox())!.width;
  expect(chartWidth / panelWidth).toBeGreaterThan(0.44);
});

test('极长摘要在矮屏保留正文空间及项目地址', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/projects/50000000-0000-4000-8000-000000000002?tab=overview');
  const scroll = page.getByTestId('project-detail-scroll-region');
  await expect(scroll).toBeVisible();
  expect((await scroll.boundingBox())!.height).toBeGreaterThan(150);
  await expect(page.getByTestId('project-detail-header')).toContainText('未关联房产的项目地址：中牟县测试路88号');
  await page.getByRole('button', { name: '应收计划', exact: true }).click();
  await expect(page.locator('#project-finance-detail')).toBeVisible();
});
