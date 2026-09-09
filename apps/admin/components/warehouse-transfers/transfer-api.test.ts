import { afterEach, expect, test } from 'bun:test';
import type { WarehouseTransferSummary } from '@gooes/domain';

import { loadCompleteTransferItems, loadTransferFilterWarehouses, sendTransfer } from './transfer-api';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const order = {
  id: '88abcdef-0000-4000-8000-000000000101',
  source_warehouse_id: '88abcdef-0000-4000-8000-000000000102',
  destination_warehouse_id: '88abcdef-0000-4000-8000-000000000103',
  item_count: 2,
} as WarehouseTransferSummary;

test('编辑草稿要求完整明细、唯一ID和SKU及一致的单据和仓库身份', async () => {
  let items = [
    { id: 'a', supplier_sku_id: 'sku-a', transfer_order_id: order.id,
      source_warehouse_id: order.source_warehouse_id, destination_warehouse_id: order.destination_warehouse_id },
    { id: 'b', supplier_sku_id: 'sku-b', transfer_order_id: order.id,
      source_warehouse_id: order.source_warehouse_id, destination_warehouse_id: order.destination_warehouse_id },
  ];
  let total = 2;
  globalThis.fetch = Object.assign(async () => Response.json({
    data: { list: items, pagination: { page: 1, pageSize: 100, total, totalPages: 1 } },
  }), { preconnect: originalFetch.preconnect });
  expect((await loadCompleteTransferItems(order)).items).toHaveLength(2);
  items = [{ ...items[0] }, { ...items[1], supplier_sku_id: 'SKU-A' }];
  expect((await loadCompleteTransferItems(order)).items).toBeNull();
  items = [{ ...items[0] }, { ...items[1], id: 'a' }];
  expect((await loadCompleteTransferItems(order)).items).toBeNull();
  items = [{ ...items[0] }, { ...items[1], transfer_order_id: 'other' }];
  expect((await loadCompleteTransferItems(order)).items).toBeNull();
  total = 101;
  expect((await loadCompleteTransferItems(order)).items).toBeNull();
});

test('命令验证动作、状态、身份和精确的下一版本', async () => {
  const body = '{"expected_version":1}';
  globalThis.fetch = Object.assign(async () => Response.json({ data: {
    status: 'completed', order: { id: order.id, status: 'completed', version: 2 },
  } }), { preconnect: originalFetch.preconnect });
  await expect(sendTransfer(`/warehouse-transfers/${order.id}/complete`, body, 'same-key')).resolves.toBeUndefined();
  globalThis.fetch = Object.assign(async () => Response.json({ data: {
    status: 'completed', order: { id: order.id, status: 'completed', version: 3 },
  } }), { preconnect: originalFetch.preconnect });
  await expect(sendTransfer(`/warehouse-transfers/${order.id}/complete`, body, 'same-key'))
    .rejects.toMatchObject({ status: 502, code: 'WAREHOUSE_TRANSFER_RESPONSE_INVALID' });
});

test('冻结命令保留原始body、path和幂等键', async () => {
  let requested = '';
  let observed: RequestInit | undefined;
  globalThis.fetch = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
    requested = String(input); observed = init;
    return Response.json({ data: { status: 'saved', order: { id: order.id, status: 'draft', version: 1 } } });
  }, { preconnect: originalFetch.preconnect });
  const body = `{"expected_version":0,"reason":"精确调拨","source_warehouse_id":"${order.source_warehouse_id}","destination_warehouse_id":"${order.destination_warehouse_id}","items":[{"supplier_sku_id":"sku","quantity":"99999999999999.9999"}]}`;
  await sendTransfer(`/warehouse-transfers/${order.id}/save-draft`, body, 'frozen-key');
  expect(requested).toBe(`/api/backend/warehouse-transfers/${order.id}/save-draft`);
  expect(observed?.body).toBe(body);
  expect(observed?.headers).toMatchObject({ 'Idempotency-Key': 'frozen-key' });
});

test('历史调拨筛选加载全部仓库而非仅启用仓库', async () => {
  let requested = '';
  globalThis.fetch = Object.assign(async (input: string | URL | Request) => {
    requested = String(input);
    return Response.json({ data: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } });
  }, { preconnect: originalFetch.preconnect });
  await loadTransferFilterWarehouses(1, '旧仓');
  expect(requested).toBe('/api/backend/warehouses?page=1&pageSize=20&keyword=%E6%97%A7%E4%BB%93');
  expect(requested).not.toContain('status=active');
});
