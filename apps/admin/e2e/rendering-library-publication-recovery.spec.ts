import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const backend = 'http://127.0.0.1:3988';
const errors = new WeakMap<Page, string[]>();
type Event = { method: string; path: string; input: { expected_version?: number; idempotency_key?: string } | null };

async function events(request: APIRequestContext): Promise<Event[]> {
  return (await (await request.get(`${backend}/__test/events`)).json()).data as Event[];
}
async function options(request: APIRequestContext, value: Record<string, boolean>): Promise<void> {
  expect((await request.post(`${backend}/__test/options`, { data: value })).ok()).toBe(true);
}
async function openPublish(page: Page) {
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await page.getByRole('article').filter({ hasText: '测试素材 01' }).getByRole('button', { name: '发布', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: '发布素材' });
  await dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ }).check();
  return dialog;
}
function publications(items: Event[]): Event[] {
  return items.filter((event) => event.method === 'POST' && event.path.endsWith('/publish'));
}

test.beforeEach(async ({ page, request }) => {
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await request.post(`${backend}/__test/reset`);
  await page.context().addCookies([{ name: 'gooes_admin_token', value: 'rendering-test-manager', url: 'http://127.0.0.1:3038' }]);
  const image = await readFile('public/partner-hero-renovation.png');
  await page.route('https://rendering-preview.example.test/**', (route) => route.fulfill({ contentType: 'image/png', body: image }));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('complete 阶段已登记旧键后发生版本冲突，新版本使用新键并重新确认', async ({ page, request }) => {
  const dialog = await openPublish(page);
  await options(request, { complete_conflict_next: true });
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog.getByRole('button', { name: '加载最新资料' })).toBeVisible();
  await dialog.getByRole('button', { name: '加载最新资料' }).click();
  await expect(dialog.getByText('其他员工已修改的素材', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ })).not.toBeChecked();
  await expect(dialog.getByRole('button', { name: '发布素材' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ }).check();
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog).toBeHidden();
  const writes = publications(await events(request));
  expect(writes.map((event) => event.input?.expected_version)).toEqual([1, 2]);
  expect(writes[0]?.input?.idempotency_key).not.toBe(writes[1]?.input?.idempotency_key);
});

test('409 后加载内容和版本均未变化时仍用原键', async ({ page, request }) => {
  const dialog = await openPublish(page);
  await options(request, { version_conflict_same_version_next: true });
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await dialog.getByRole('button', { name: '加载最新资料' }).click();
  await expect(dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ })).toBeChecked();
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog).toBeHidden();
  const writes = publications(await events(request));
  expect(writes.map((event) => event.input?.expected_version)).toEqual([1, 1]);
  expect(writes[0]?.input?.idempotency_key).toBe(writes[1]?.input?.idempotency_key);
});

test('发布仍在进行时提示同请求重试，不显示加载最新', async ({ page, request }) => {
  const dialog = await openPublish(page);
  await options(request, { publish_in_progress_next: true });
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog.getByText(/正在发布.*当前弹窗重试同一请求/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: '加载最新资料' })).toHaveCount(0);
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog.getByText(/正在发布.*当前弹窗重试同一请求/)).toBeVisible();
  const inProgress = publications(await events(request));
  expect(inProgress).toHaveLength(2);
  expect(inProgress[0]?.input?.idempotency_key).toBe(inProgress[1]?.input?.idempotency_key);
  expect((await request.post(`${backend}/__test/expire-publish-lease`, {
    data: { idempotency_key: inProgress[0]?.input?.idempotency_key },
  })).ok()).toBe(true);
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog).toBeHidden();
  const writes = publications(await events(request));
  expect(writes).toHaveLength(3);
  expect(writes[0]?.input?.idempotency_key).toBe(writes[2]?.input?.idempotency_key);
});

test('数据库已提交但首次响应丢失时同键重放且不生成第二个快照', async ({ page, request }) => {
  const dialog = await openPublish(page);
  await options(request, { commit_lost_response_next: true });
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog.getByText(/发布素材失败/)).toBeVisible();
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog).toBeHidden();
  const writes = publications(await events(request));
  expect(writes[0]?.input?.idempotency_key).toBe(writes[1]?.input?.idempotency_key);
  const snapshots = (await (await request.get(`${backend}/__test/snapshots`)).json()).data;
  expect(Object.values(snapshots)).toHaveLength(1);
  expect(Object.values(snapshots)[0]).toMatchObject({ version: 2 });
});

test('明确 502 失败后同版本重试仍保持原键', async ({ page, request }) => {
  const dialog = await openPublish(page);
  await options(request, { public_copy_failed_next: true });
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog.getByText(/发布素材失败/)).toBeVisible();
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog).toBeHidden();
  const writes = publications(await events(request));
  expect(writes[0]?.input?.idempotency_key).toBe(writes[1]?.input?.idempotency_key);
});

test('网络中断后当前弹窗重试保持原键', async ({ page, request }) => {
  let firstKey: string | undefined;
  await page.route('**/api/backend/tenant/rendering-library/styles/*/publish', async (route) => {
    if (!firstKey) {
      firstKey = (route.request().postDataJSON() as { idempotency_key: string }).idempotency_key;
      await route.abort('failed');
    } else await route.continue();
  });
  const dialog = await openPublish(page);
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog.getByText(/发布素材失败/)).toBeVisible();
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog).toBeHidden();
  expect(publications(await events(request))[0]?.input?.idempotency_key).toBe(firstKey);
});

test('批量预览缺失时自动读取私有预览；读取失败只能手动重试，不能无图发布', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 400, height: 860 });
  await options(request, { preview_failure: true });
  let failSinglePreview = true;
  await page.route('**/api/backend/tenant/rendering-library/files/*/preview', (route) => failSinglePreview
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false,
      code: 'RENDERING_STORAGE_UNAVAILABLE', message: '私有预览暂不可用' }) }) : route.continue());
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await page.getByRole('article').filter({ hasText: '测试素材 01' }).getByRole('button', { name: '发布', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: '发布素材' });
  const responsibility = dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ });
  await expect(dialog.getByText(/私有预览暂不可用|图片预览.*失败/)).toBeVisible();
  await expect(responsibility).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '发布素材' })).toBeDisabled();
  expect(publications(await events(request))).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('publish-preview-failed-mobile.png'), fullPage: true });
  failSinglePreview = false;
  await dialog.getByRole('button', { name: '重试图片预览' }).click();
  await expect(dialog.getByRole('img', { name: '测试素材 01' })).toBeVisible();
  await expect(responsibility).toBeEnabled();
  await responsibility.check();
  expect((await events(request)).some((event) => /\/files\/[^/]+\/preview$/.test(event.path))).toBe(true);
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog).toBeHidden();
  expect(publications(await events(request))).toHaveLength(1);
});

test('过期批量预览自动刷新且加载中不可确认或提交', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await options(request, { expired_batch_previews: true });
  let releasePreview!: () => void;
  const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
  let requested = false;
  await page.route('**/api/backend/tenant/rendering-library/files/*/preview', async (route) => {
    requested = true; await previewGate; await route.continue();
  });
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  await page.getByRole('article').filter({ hasText: '测试素材 01' }).getByRole('button', { name: '发布', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: '发布素材' });
  await expect.poll(() => requested).toBe(true);
  const responsibility = dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ });
  await expect(responsibility).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '发布素材' })).toBeDisabled();
  releasePreview();
  await expect(dialog.getByRole('img', { name: '测试素材 01' })).toBeVisible();
  await expect(responsibility).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('publish-preview-refreshed-desktop.png'), fullPage: true });
  expect(publications(await events(request))).toHaveLength(0);
});

test('版本冲突换图后旧图不可确认，等待新私有图并重新勾责任', async ({ page, request }) => {
  const dialog = await openPublish(page);
  await options(request, { conflict_new_file_next: true });
  await dialog.getByRole('button', { name: '发布素材' }).click();
  let releasePreview!: () => void;
  const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
  let requestedPath = '';
  await page.route('**/api/backend/tenant/rendering-library/files/*/preview', async (route) => {
    requestedPath = new URL(route.request().url()).pathname; await previewGate; await route.continue();
  });
  await dialog.getByRole('button', { name: '加载最新资料' }).click();
  await expect(dialog.getByText('其他员工已更换图片的素材', { exact: true })).toBeVisible();
  await expect.poll(() => requestedPath).toContain('30000000-0000-4000-8000-000000000999');
  await expect(dialog.getByRole('img', { name: '测试素材 01' })).toHaveCount(0);
  const responsibility = dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ });
  await expect(responsibility).not.toBeChecked();
  await expect(responsibility).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '发布素材' })).toBeDisabled();
  releasePreview();
  await expect(dialog.getByRole('img', { name: '其他员工已更换图片的素材' })).toBeVisible();
  await expect(responsibility).toBeEnabled();
  await expect(responsibility).not.toBeChecked();
  await responsibility.check();
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog).toBeHidden();
  const writes = publications(await events(request));
  expect(writes.map((event) => event.input?.expected_version)).toEqual([1, 2]);
  expect(writes[0]?.input?.idempotency_key).not.toBe(writes[1]?.input?.idempotency_key);
});

test('弹窗打开后预览到期自动换取私有 URL，换图前禁用并重新确认', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 400, height: 860 });
  const clockStart = Date.now();
  await page.clock.install({ time: clockStart });
  const dialog = await openPublish(page);
  await expect(dialog.getByRole('button', { name: '发布素材' })).toBeEnabled();
  let releasePreview!: () => void;
  const previewGate = new Promise<void>((resolve) => { releasePreview = resolve; });
  let previewRequests = 0;
  await page.route('**/api/backend/tenant/rendering-library/files/*/preview', async (route) => {
    previewRequests += 1;
    await previewGate;
    const file = new URL(route.request().url()).pathname.split('/').at(-2);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: {
      file_id: file, url: `https://rendering-preview.example.test/${file}.webp?v=renewed`,
      expires_at: new Date(clockStart + 240000).toISOString(),
    } }) });
  });
  try {
    await page.clock.fastForward(120500);
    await expect.poll(() => previewRequests).toBe(1);
    await expect(dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ })).toBeDisabled();
    await expect(dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ })).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: '发布素材' })).toBeDisabled();
    expect(publications(await events(request))).toHaveLength(0);
  } finally { releasePreview(); }
  await expect(dialog.getByRole('img', { name: '测试素材 01' })).toBeVisible();
  const responsibility = dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ });
  await expect(responsibility).toBeEnabled();
  await expect(responsibility).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('publish-preview-auto-renew-mobile.png'), fullPage: true });
  await responsibility.check();
  await dialog.getByRole('button', { name: '发布素材' }).click();
  await expect(dialog).toBeHidden();
});

test('服务端持续返回过期 URL 时自动请求有界，手动重试仍可用', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const clockStart = Date.now();
  await page.clock.install({ time: clockStart });
  const dialog = await openPublish(page);
  let previewRequests = 0;
  await page.route('**/api/backend/tenant/rendering-library/files/*/preview', async (route) => {
    previewRequests += 1;
    const file = new URL(route.request().url()).pathname.split('/').at(-2);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: {
      file_id: file, url: `https://rendering-preview.example.test/${file}.webp?v=expired-${previewRequests}`,
      expires_at: new Date(clockStart - 1000).toISOString(),
    } }) });
  });
  await page.clock.fastForward(120500);
  await expect.poll(() => previewRequests).toBe(1);
  await page.clock.fastForward(10000);
  expect(previewRequests).toBe(1);
  await expect(dialog.getByRole('checkbox', { name: /本公司承担内容及版权责任/ })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '发布素材' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '重试图片预览' })).toBeVisible();
  expect(publications(await events(request))).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('publish-preview-expired-desktop.png'), fullPage: true });
});

test('隐藏和删除确认不读取私有图片预览', async ({ page, request }) => {
  await options(request, { preview_failure: true });
  await page.goto('/rendering-library', { waitUntil: 'networkidle' });
  const card = page.getByRole('article').filter({ hasText: '测试素材 01' });
  await card.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: '删除素材' })).toBeVisible();
  await page.getByRole('alertdialog', { name: '删除素材' }).getByRole('button', { name: '取消' }).click();
  await options(request, { preview_failure: false });
  await page.reload({ waitUntil: 'networkidle' });
  await card.getByRole('button', { name: '发布', exact: true }).click();
  const publish = page.getByRole('alertdialog', { name: '发布素材' });
  await publish.getByRole('checkbox', { name: /本公司承担内容及版权责任/ }).check();
  await publish.getByRole('button', { name: '发布素材' }).click();
  await expect(publish).toBeHidden();
  await options(request, { preview_failure: true });
  await page.reload({ waitUntil: 'networkidle' });
  await card.getByRole('button', { name: '隐藏', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: '隐藏素材' })).toBeVisible();
  expect((await events(request)).filter((event) => /\/files\/[^/]+\/preview$/.test(event.path))).toHaveLength(0);
});
