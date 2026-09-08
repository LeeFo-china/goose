import { afterEach, expect, test } from 'bun:test';
import type { WarehouseMaterialOrder } from '@gooes/domain';
import { loadCompleteItems, sendMaterial } from './material-api';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const order = { id: 'order', item_count: 25 } as WarehouseMaterialOrder;
test('编辑草稿只接受完整有界明细，并核对summary总数', async () => {
  let requested = '';
  let total = 25;
  let count = 20;
  globalThis.fetch = (async (input) => {
    requested = String(input);
    return Response.json({
      data: {
        list: Array.from({ length: count }, (_, i) => ({ id: String(i) })),
        pagination: { page: 1, pageSize: 100, total, totalPages: 1 },
      },
    });
  }) as typeof fetch;
  expect((await loadCompleteItems('issue', order)).items).toBeNull();
  expect(requested).toBe(
    '/api/backend/warehouse-issues/order/items?page=1&pageSize=100',
  );
  count = 25;
  expect((await loadCompleteItems('issue', order)).items).toHaveLength(25);
  total = 101;
  expect((await loadCompleteItems('issue', order)).items).toBeNull();
  total = 24;
  count = 24;
  expect((await loadCompleteItems('issue', order)).items).toBeNull();
});
test('命令保持冻结的body、path、key并设置超时', async () => {
  let observed: RequestInit | undefined;
  let requested = '';
  globalThis.fetch = (async (input, init) => {
    requested = String(input);
    observed = init;
    return Response.json({
      data: {
        status: 'saved',
        order: { id: 'id', status: 'draft', version: 1 },
      },
    });
  }) as typeof fetch;
  const body =
    '{"expected_version":0,"items":[{"quantity":"99999999999999.9999"}]}';
  await sendMaterial('/warehouse-issues/id/save-draft', body, 'key');
  expect(requested).toBe('/api/backend/warehouse-issues/id/save-draft');
  expect(observed?.body).toBe(body);
  expect(observed?.headers).toMatchObject({ 'Idempotency-Key': 'key' });
  expect(observed?.signal).toBeInstanceOf(AbortSignal);
});

test('200缺失或不匹配的命令回执必须作为未知结果保留', async () => {
  for (const data of [
    undefined,
    null,
    'not-a-receipt',
    {},
    { status: 'saved' },
    { status: 'saved', order: { id: 'other', status: 'draft', version: 1 } },
    { status: 'completed', order: { id: 'id', status: 'draft', version: 1 } },
    { status: 'saved', order: { id: 'id', status: 'draft' } },
    { status: 'saved', order: { id: 'id', status: 'draft', version: 2 } },
    { status: 'saved', order: { id: 'id', status: 'submitted', version: 1 } },
  ]) {
    globalThis.fetch = Object.assign(async () => Response.json({ data }), {
      preconnect: originalFetch.preconnect,
    });
    await expect(
      sendMaterial(
        '/warehouse-issues/id/save-draft',
        '{"expected_version":0}',
        'same-key',
      ),
    ).rejects.toMatchObject({ code: 'WAREHOUSE_MATERIAL_RESPONSE_INVALID' });
  }
});

test('合法大写UUID命令允许小写UUID回执，保留发送path', async () => {
  const id = '88abcdef-0000-4000-8000-000000000101';
  let observed = '';
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request) => {
      observed = String(input);
      return Response.json({
        data: {
          status: 'submitted',
          order: { id, status: 'submitted', version: 2 },
        },
      });
    },
    { preconnect: originalFetch.preconnect },
  );
  await expect(
    sendMaterial(
      `/warehouse-issues/${id.toUpperCase()}/submit`,
      '{"expected_version":1}',
      'same-key',
    ),
  ).resolves.toBeUndefined();
  expect(observed).toContain(id.toUpperCase());
});
