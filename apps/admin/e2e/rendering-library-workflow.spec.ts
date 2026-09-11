import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const backend = 'http://127.0.0.1:3988';
const runtimeErrors = new WeakMap<Page, string[]>();
async function identity(page: Page, role = 'manager') {
  await page.context().addCookies([{ name: 'gooes_admin_token', value: `rendering-test-${role}`, url: 'http://127.0.0.1:3038' }]);
}
async function events(request: APIRequestContext) {
  const response = await request.get(`${backend}/__test/events`);
  return (await response.json()).data as Array<{ method: string; path: string; query: string; input: Record<string, unknown> | null }>;
}
async function options(request: APIRequestContext, value: Record<string, unknown>) {
  expect((await request.post(`${backend}/__test/options`, { data: value })).ok()).toBe(true);
}

test.beforeEach(async ({ page, request }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await request.post(`${backend}/__test/reset`);
  await identity(page);
  // Only a committed public brand image is used as the test image, never customer photos.
  const bytes = await readFile('public/partner-hero-renovation.png');
  await page.route('https://rendering-preview.example.test/**', (route) => route.fulfill({ contentType: 'image/png', body: bytes }));
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

test('分页和筛选使用有界列表及每页一次批量预览', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: '装修效果库', exact: true })).toBeVisible();
  await expect(page.getByText('测试素材 01', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '上传素材', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '发布', exact: true })).toHaveCount(0);
  const first = await events(request);
  expect(first.filter((event) => event.path.endsWith('/files/previews'))).toHaveLength(1);
  expect(first.filter((event) => /\/files\/[^/]+\/preview$/.test(event.path))).toHaveLength(0);
  const list = first.find((event) => event.path.endsWith('/styles'));
  expect(new URLSearchParams(list?.query).get('pageSize')).toBe('20');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('gallery-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByText('测试素材 21', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '空间' }).click();
  await page.getByRole('option', { name: '卧室', exact: true }).click();
  await expect(page.getByText('测试素材 02', { exact: true })).toBeVisible();
  await expect(page.getByText('测试素材 21', { exact: true })).toHaveCount(0);
});

test('只读与无权限身份不出现写入操作', async ({ page, request }) => {
  await identity(page, 'viewer');
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await expect(page.getByText('测试素材 01', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '上传素材', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0);
  await request.post(`${backend}/__test/reset`);
  await identity(page, 'denied');
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await expect(page.getByText(/无权|没有.*权限/).first()).toBeVisible();
  expect(await events(request)).toHaveLength(0);
});

test('窄屏、预览失败与恢复保留素材内容', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await options(request, { preview_failure: true });
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await expect(page.getByText('测试素材 01', { exact: true })).toBeVisible();
  await expect(page.getByText(/预览.*不可用|预览.*失败/).first()).toBeVisible();
  await options(request, { preview_failure: false });
  await page.getByRole('button', { name: '刷新预览', exact: true }).click();
  await expect(page.getByRole('img', { name: '测试素材 01', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '测试素材 01', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('gallery-mobile.png'), fullPage: true });
});

test('资料失败重试不重复上传图片', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await options(request, { fail_create_title: '第二张' });
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '上传素材', exact: true }).click();
  const bytes = await readFile('public/partner-hero-renovation.png');
  await page.locator('input[type=file]').setInputFiles([
    { name: '第一张.png', mimeType: 'image/png', buffer: bytes },
    { name: '第二张.png', mimeType: 'image/png', buffer: bytes },
  ]);
  await page.getByRole('checkbox', { name: /授权|使用权/ }).check();
  await page.getByRole('button', { name: '开始上传', exact: true }).click();
  await expect(page.getByText('保存素材资料失败', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('upload-partial-failure.png'), fullPage: true });
  await page.getByRole('button', { name: '重试保存资料', exact: true }).click();
  await expect.poll(async () => (await events(request)).filter((event) => event.path.endsWith('/styles') && event.method === 'POST').length).toBe(3);
  expect((await events(request)).filter((event) => event.path.endsWith('/files') && event.method === 'POST')).toHaveLength(2);
});

test('上传数量和授权前置校验不发送写入请求', async ({ page, request }) => {
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '上传素材', exact: true }).click();
  const rights = page.getByRole('checkbox', { name: /授权|使用权/ });
  await expect(rights).not.toBeChecked();
  const bytes = await readFile('public/partner-hero-renovation.png');
  // This batch must be rejected by count before any preview/decode or upload.
  await page.locator('input[type=file]').setInputFiles(Array.from({ length: 21 }, (_, index) => ({
    name: `数量校验-${index}.png`, mimeType: 'image/png', buffer: Buffer.from('count-limit-test'),
  })));
  await expect(page.getByText(/最多.*20|1-20/).last()).toBeVisible();
  await expect(page.getByRole('button', { name: '开始上传', exact: true })).toBeDisabled();
  await page.locator('input[type=file]').setInputFiles({ name: '待授权.png', mimeType: 'image/png', buffer: bytes });
  await page.getByRole('button', { name: '开始上传', exact: true }).click();
  await expect(page.getByText('请确认已取得图片使用授权', { exact: true })).toBeVisible();
  expect((await events(request)).filter((event) => event.method === 'POST' && !event.path.endsWith('/files/previews'))).toHaveLength(0);
});

test('编辑冲突保留输入，显式加载最新后才能保存', async ({ page, request }) => {
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  const card = page.getByRole('article').filter({ hasText: '测试素材 01' });
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑素材' });
  await editor.getByLabel('标题', { exact: true }).fill('我本地的修改');
  await options(request, { conflict_next: true });
  await editor.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(editor.getByLabel('标题', { exact: true })).toHaveValue('我本地的修改');
  await expect(editor.getByRole('button', { name: '保存资料', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: '加载最新资料', exact: true }).click();
  await expect(editor.getByLabel('标题', { exact: true })).toHaveValue('其他员工已修改的素材');
  await editor.getByLabel('标题', { exact: true }).fill('核对后的素材');
  await editor.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByText('核对后的素材', { exact: true })).toBeVisible();
});

test('编辑时素材已删除会保留输入并阻止重复保存', async ({ page, request }) => {
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await page.getByRole('article').filter({ hasText: '测试素材 01' }).getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑素材' });
  await editor.getByLabel('标题', { exact: true }).fill('尚未保存的标题');
  await options(request, { delete_next: true });
  await editor.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(editor.getByText(/素材.*已删除|素材.*不存在|素材.*不可用/).first()).toBeVisible();
  await expect(editor.getByLabel('标题', { exact: true })).toHaveValue('尚未保存的标题');
  await expect(editor.getByRole('button', { name: '保存资料', exact: true })).toBeDisabled();
});

test('空库和列表失败可恢复，仍保留筛选及分页结构', async ({ page, request }, testInfo) => {
  await options(request, { empty: true });
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await expect(page.getByText(/还没有.*素材|暂无.*素材/).first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: '空间' })).toBeVisible();
  expect((await events(request)).filter((event) => event.path.endsWith('/files/previews'))).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('gallery-empty.png'), fullPage: true });
  await options(request, { empty: false, list_failure: true });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText(/素材列表暂不可用|素材列表加载失败|读取素材列表失败/).first()).toBeVisible();
  await options(request, { list_failure: false });
  await page.getByRole('button', { name: /重试|重新加载/ }).first().click();
  await expect(page.getByText('测试素材 01', { exact: true })).toBeVisible();
});

test('隐藏与删除需要确认且携带当前版本', async ({ page, request }) => {
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  const card = page.getByRole('article').filter({ hasText: '测试素材 01' });
  await card.getByRole('button', { name: '隐藏', exact: true }).click();
  let confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  expect((await events(request)).filter((event) => event.path.endsWith('/hide'))).toHaveLength(0);
  await confirmation.getByRole('button', { name: /隐藏素材|确认隐藏/ }).click();
  await expect(confirmation).toBeHidden();
  await expect(card.getByText('已隐藏', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '删除', exact: true }).click();
  confirmation = page.getByRole('alertdialog');
  await expect(confirmation.getByText(/原图|文件/)).toBeVisible();
  await confirmation.getByRole('button', { name: /删除素材|确认删除/ }).click();
  await expect(confirmation).toBeHidden();
  await expect(page.getByText('测试素材 02', { exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);
  const writes = (await events(request)).filter((event) => event.path.endsWith('/hide') || event.method === 'DELETE');
  expect(writes.map((event) => event.input?.expected_version)).toEqual([1, 2]);
});

test('删除末页唯一素材后回到有效分页，键盘可打开筛选', async ({ page }) => {
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  const space = page.getByRole('combobox', { name: '空间', exact: true });
  await space.focus();
  await expect(space).toBeFocused();
  await space.press('Enter');
  await expect(page.getByRole('option', { name: '卧室', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(space).toBeFocused();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  const card = page.getByRole('article').filter({ hasText: '测试素材 21' });
  await card.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '删除素材', exact: true }).click();
  await expect(page.getByText('测试素材 01', { exact: true })).toBeVisible();
  await expect(page.getByText('测试素材 21', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
});

test('隐藏冲突必须显式核对新版本后重新确认', async ({ page, request }) => {
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await page.getByRole('article').filter({ hasText: '测试素材 01' }).getByRole('button', { name: '隐藏', exact: true }).click();
  const confirmation = page.getByRole('alertdialog');
  await options(request, { conflict_next: true });
  await confirmation.getByRole('button', { name: '隐藏素材', exact: true }).click();
  await expect(confirmation.getByRole('button', { name: '隐藏素材', exact: true })).toBeDisabled();
  await confirmation.getByRole('button', { name: '加载最新资料', exact: true }).click();
  await expect(confirmation.getByText(/其他员工已修改的素材/).first()).toBeVisible();
  await confirmation.getByRole('button', { name: '隐藏素材', exact: true }).click();
  await expect(confirmation).toBeHidden();
  const writes = (await events(request)).filter((event) => event.path.endsWith('/hide'));
  expect(writes.map((event) => event.input?.expected_version)).toEqual([1, 2]);
});

test('浏览器后退确认保留队列，显式放弃后继续原历史导航', async ({ page }, testInfo) => {
  await page.goto('/customers', { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: '装修效果库', exact: true }).click();
  await page.getByRole('button', { name: '上传素材', exact: true }).click();
  const bytes = await readFile('public/partner-hero-renovation.png');
  await page.locator('input[type=file]').setInputFiles({ name: '后退待确认.png', mimeType: 'image/png', buffer: bytes });
  // page.goBack waits for load, which correctly never happens when navigation is
  // canceled. Send the same Chromium history action without assuming it commits.
  const cdp = await page.context().newCDPSession(page);
  try {
    const history = await cdp.send('Page.getNavigationHistory');
    const previous = history.entries[history.currentIndex - 1];
    if (!previous) throw new Error('测试前置条件：缺少上一历史条目');
    // The customer page may add its responsive pageSize query. Preserve the
    // actual previous entry rather than replacing it with a hardcoded URL.
    expect(new URL(previous.url).pathname).toBe('/customers');
    await cdp.send('Page.navigateToHistoryEntry', { entryId: previous.id });
    const confirmation = page.getByRole('alertdialog');
    await expect(confirmation).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('upload-leave-confirmation.png'), fullPage: true });
    await confirmation.getByRole('button', { name: '继续整理', exact: true }).click();
    await expect(page.getByLabel('素材标题', { exact: true })).toHaveValue('后退待确认');
    expect(await cdp.send('Page.getNavigationHistory')).toEqual(history);
    await cdp.send('Page.navigateToHistoryEntry', { entryId: previous.id });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: '放弃并继续', exact: true }).click();
    await expect(page).toHaveURL(previous.url);
  } finally { await cdp.detach(); }
});

test('取消旧预览后列表失败不会残留加载状态', async ({ page, request }) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/backend/tenant/rendering-library/files/previews', async (route) => {
    await pending;
    await route.abort('aborted');
  });
  try {
    await page.goto('/rendering-library', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('正在加载本页预览', { exact: true })).toBeVisible();
    await options(request, { list_failure: true });
    await page.getByRole('combobox', { name: '空间', exact: true }).click();
    await page.getByRole('option', { name: '卧室', exact: true }).click();
    await expect(page.getByText('读取素材列表失败', { exact: true })).toBeVisible();
    await expect(page.getByText('正在加载本页预览', { exact: true })).toHaveCount(0);
  } finally { release(); }
});

test('窄屏编辑最大长度标题后卡片文字不横向溢出', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 400, height: 1000 });
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await page.getByRole('article').filter({ hasText: '测试素材 01' }).getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑素材' });
  const title = 'LongMaterialName'.repeat(6).slice(0, 80);
  await editor.getByLabel('标题', { exact: true }).fill(title);
  await editor.getByLabel('颜色说明', { exact: true }).fill('暖白墙面与原木色家具搭配。'.repeat(20));
  await editor.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(editor).toBeHidden();
  const heading = page.getByRole('heading', { name: title, exact: true });
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toBeInViewport();
  expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('gallery-long-title.png'), fullPage: true });
});
