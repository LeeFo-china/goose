import { STOCKTAKE_TEST_ORDER, STOCKTAKE_TEST_ITEM, STOCKTAKE_TEST_ID } from './stocktake-test-fixtures';
import { afterEach, expect, test } from 'bun:test';
import {
  loadCompleteStocktakeItems,
  loadStocktakeFilterWarehouses,
  loadStocktakeStock,
  sendStocktake,
} from './stocktake-api';
const fetchBefore = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchBefore;
});
const id = STOCKTAKE_TEST_ID;
const order = { ...STOCKTAKE_TEST_ORDER, item_count: 2 };
function respond(data: unknown) {
  globalThis.fetch = Object.assign(async () => Response.json({ data }), {
    preconnect: fetchBefore.preconnect,
  });
}
const a = STOCKTAKE_TEST_ITEM;
const b = {
  ...a,
  id: '88abcdef-0000-4000-8000-000000000106',
  supplier_sku_id: '88abcdef-0000-4000-8000-000000000107',
};
test('完整明细拒绝畸形总数、重复和跨租户/单据/仓库', async () => {
  const response = (list: unknown[], total: unknown = 2) => ({
    list,
    pagination: { page: 1, pageSize: 100, total, totalPages: 1 },
  });
  respond(response([a, b]));
  expect((await loadCompleteStocktakeItems(order)).items).toHaveLength(2);
  for (const total of [101, 1, -1, null, '2', 2.5]) {
    respond(response([a, b], total));
    expect((await loadCompleteStocktakeItems(order)).items).toBeNull();
  }
  for (const change of [
    { id: a.id.toUpperCase() },
    { supplier_sku_id: a.supplier_sku_id.toUpperCase() },
    { tenant_id: 'other' },
    { stocktake_order_id: 'other' },
    { warehouse_id: 'other' },
  ]) {
    respond(response([a, { ...b, ...change }]));
    expect((await loadCompleteStocktakeItems(order)).items).toBeNull();
  }
});
test('全部六种命令验证回执动作、单据、目标状态和精确下一版本', async () => {
  for (const [action, status, state] of [
    ['save-draft', 'saved', 'draft'],
    ['start', 'counting', 'counting'],
    ['record-counts', 'counting', 'counting'],
    ['submit', 'submitted', 'submitted'],
    ['complete', 'completed', 'completed'],
    ['cancel', 'cancelled', 'cancelled'],
  ]) {
    const receipt = { status, order: { ...STOCKTAKE_TEST_ORDER, id, status: state, version: 2 } };
    respond(receipt);
    await expect(
      sendStocktake('/warehouse-stocktakes/' + id + '/' + action, '{"expected_version":1}', 'key'),
    ).resolves.toBeUndefined();
    for (const bad of [
      null,
      {},
      { ...receipt, status: 'wrong' },
      { ...receipt, order: { ...receipt.order, id: 'other' } },
      { ...receipt, order: { ...receipt.order, status: 'wrong' } },
      { ...receipt, order: { ...receipt.order, version: 3 } },
    ]) {
      respond(bad);
      await expect(
        sendStocktake('/warehouse-stocktakes/' + id + '/' + action, '{"expected_version":1}', 'key'),
      ).rejects.toMatchObject({ status: 502 });
    }
  }
});
test('冻结原始请求字节与幂等键，库存选择保留零库存，历史仓库含停用', async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ path: String(input), init });
      return Response.json({
        data: String(input).endsWith('/save-draft')
            ? { status: 'saved', order: { ...STOCKTAKE_TEST_ORDER, id, status: 'draft', version: 1 } }
          : { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      });
    },
    { preconnect: fetchBefore.preconnect },
  );
  const body = '{"expected_version":0, "reason":"原始空格"}';
  await sendStocktake('/warehouse-stocktakes/' + id + '/save-draft', body, 'same-key');
  expect(calls[0].init?.body).toBe(body);
  expect(calls[0].init?.headers).toMatchObject({ 'Idempotency-Key': 'same-key' });
  await loadStocktakeFilterWarehouses(1, '旧仓');
  expect(calls[1].path).not.toContain('status=active');
  await loadStocktakeStock(id, 1, '');
  expect(calls[2].path).not.toContain('positive');
  expect(calls[2].path).toContain('pageSize=20');
});
