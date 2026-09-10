import { afterEach, expect, test } from 'bun:test';
import { recoverStocktakeEditor } from './stocktake-editor-recovery';
import type { StocktakeCountsEdit, StocktakeDraftEdit } from './stocktake-editor-storage';
import { STOCKTAKE_TEST_ID as id, STOCKTAKE_TEST_ORDER as order, STOCKTAKE_TEST_ITEM as item } from './stocktake-test-fixtures';
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const draft: StocktakeDraftEdit = { kind: 'draft', orderId: id, version: 0, warehouse: null, reason: '未保存', lines: [] };
const counts: StocktakeCountsEdit = { kind: 'counts', orderId: id, version: order.version, lines: [{ skuId: item.supplier_sku_id, counted: '0', reason: '原输入' }] };
const signal = () => new AbortController().signal;
function respond(summary: unknown = { ...order, item_count: 1 }, items: unknown[] = [item]) {
  const calls: string[] = [];
  globalThis.fetch = Object.assign(async (input: string | URL | Request) => {
    const path = String(input); calls.push(path);
    return Response.json({ data: path.includes('/items?') ? { list: items, pagination: { total: 1 } } : summary });
  }, { preconnect: original.preconnect });
  return calls;
}
test('新草稿直接恢复原ID与输入，不读写服务器', async () => {
  const calls = respond();
  expect((await recoverStocktakeEditor(draft, order.tenant_id, signal())).draft?.recovery).toEqual(draft);
  expect(calls).toHaveLength(0);
});
test('实盘恢复先读原版本与完整明细，不更换预期版本或转数值', async () => {
  const calls = respond();
  const result = await recoverStocktakeEditor(counts, order.tenant_id, signal());
  expect(result.counts?.recovery).toEqual(counts);
  expect(result.counts?.order.version).toBe(order.version);
  expect(calls).toHaveLength(2); expect(calls[1]).toContain('page=1&pageSize=100');
});
test('身份版本状态变化不恢复，不读取无关明细', async () => {
  for (const change of [{ id: 'other' }, { tenant_id: 'other' }, { status: 'completed' }, { version: order.version + 1 }]) {
    const calls = respond({ ...order, ...change });
    expect((await recoverStocktakeEditor(counts, order.tenant_id, signal())).error).toBeTruthy();
    expect(calls).toHaveLength(1);
  }
});
test('拒绝截断或改变材料集合，保存过的草稿不更换仓库', async () => {
  respond(undefined, []);
  expect((await recoverStocktakeEditor(counts, order.tenant_id, signal())).error).toBeTruthy();
  respond();
  expect((await recoverStocktakeEditor({ ...counts, lines: [] }, order.tenant_id, signal())).error).toBeTruthy();
  respond({ ...order, status: 'draft', item_count: 1 });
  expect((await recoverStocktakeEditor({ ...draft, version: order.version }, order.tenant_id, signal())).error).toBeTruthy();
  expect((await recoverStocktakeEditor({ ...draft, version: order.version, warehouse: { id: order.warehouse_id, name: order.warehouse_name } }, order.tenant_id, signal())).draft?.recovery.reason).toBe('未保存');
});
