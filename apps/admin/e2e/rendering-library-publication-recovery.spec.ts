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
