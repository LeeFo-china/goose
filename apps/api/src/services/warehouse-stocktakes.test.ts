import { expect, test } from 'bun:test';
import { STOCKTAKE_ACTOR, STOCKTAKE_COUNTS, STOCKTAKE_DRAFT, STOCKTAKE_ID, STOCKTAKE_ORDER, stocktakeAuth } from '@/repositories/warehouse-stocktake-test-fixtures';
import { WarehouseStocktakesService } from './warehouse-stocktakes';
import { AppError } from '@/errors/app-error';
import { withWarehouseStocktakeErrors } from './warehouse-stocktake-errors';

test('stocktake service applies command permissions and preserves command payload strings/nulls', async () => {
  const calls: unknown[] = [];
  const repository = { getSettings: async () => ({ warehouse_stocktakes_enabled: true }), list: async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
    get: async () => ({ ...STOCKTAKE_ORDER, warehouse_name: '主仓', item_count: 0, counted_count: 0, difference_count: 0, gain_amount: null, loss_amount: null }),
    listItems: async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
    command: async (input: unknown) => { calls.push(input); return { status: 'saved' as const, order: STOCKTAKE_ORDER }; } };
  const service = new WarehouseStocktakesService({ repository });
  await service.command(stocktakeAuth(['inventory.stocktake.manage']), STOCKTAKE_ID, 'save_draft', STOCKTAKE_DRAFT, ' key ');
  await service.command(stocktakeAuth(['inventory.stocktake.manage']), STOCKTAKE_ID, 'record_counts', STOCKTAKE_COUNTS, 'count');
  expect(calls[0]).toEqual({ ...STOCKTAKE_ACTOR, order_id: STOCKTAKE_ID, command: 'save_draft', expected_version: 0,
    payload: { warehouse_id: STOCKTAKE_ID, reason: '月末盘点', items: [{ supplier_sku_id: STOCKTAKE_ID }] }, idempotency_key: 'key' });
  expect(calls[1]).toMatchObject({ command: 'record_counts', payload: { items: [{ counted_quantity: '0', difference_reason: null }] } });
  await expect(service.command(stocktakeAuth(['inventory.stocktake.manage']), STOCKTAKE_ID, 'complete', { expected_version: 1 }, 'x'))
    .rejects.toMatchObject({ statusCode: 403 });
});

test('stocktake SQL errors map all stable suffixes and preserve unknown database errors', async () => {
  const suffixes = ['ACTOR_INVALID', 'BALANCE_INVALID', 'COST_BASIS_REQUIRED', 'COUNTS_REQUIRED',
    'DIFFERENCE_REASON_REQUIRED', 'FORBIDDEN', 'IDEMPOTENCY_CONFLICT', 'IMMUTABLE', 'INVALID', 'ITEMS_INVALID',
    'NOT_ENABLED', 'NOT_FOUND', 'SKU_INVALID', 'SNAPSHOT_CONFLICT', 'SNAPSHOT_IMMUTABLE', 'SOURCE_CONFLICT',
    'STATE_CONFLICT', 'VERSION_CONFLICT', 'WAREHOUSE_INACTIVE', 'WAREHOUSE_INVALID'];
  for (const suffix of suffixes) {
    await expect(withWarehouseStocktakeErrors(async () => { throw new AppError(500, 'db', 'DB_ERROR', { message: `WAREHOUSE_STOCKTAKE_${suffix}` }); }))
      .rejects.toMatchObject({ code: `WAREHOUSE_STOCKTAKE_${suffix}` });
  }
  const unknown = new AppError(500, 'db', 'DB_ERROR', { message: 'WAREHOUSE_STOCKTAKE_UNKNOWN' });
  await expect(withWarehouseStocktakeErrors(async () => { throw unknown; })).rejects.toBe(unknown);
});

test('stocktake service rejects bad actors and idempotency before RPC', async () => {
  let called = false;
  const service = new WarehouseStocktakesService({ repository: {
    command: async () => { called = true; return { status: 'saved', order: STOCKTAKE_ORDER }; },
    getSettings: async () => ({ warehouse_stocktakes_enabled: true }),
    list: async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
    get: async () => ({ ...STOCKTAKE_ORDER, warehouse_name: '主仓', item_count: 0, counted_count: 0, difference_count: 0, gain_amount: null, loss_amount: null }),
    listItems: async () => ({ list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
  } });
  const auth = { ...stocktakeAuth(['inventory.stocktake.manage']), employeeId: null };
  await expect(service.command(auth, STOCKTAKE_ID, 'start', { expected_version: 1 }, 'key')).rejects.toMatchObject({ code: 'WAREHOUSE_STOCKTAKE_ACTOR_INVALID' });
  await expect(service.command(stocktakeAuth(['inventory.stocktake.manage']), STOCKTAKE_ID, 'start', { expected_version: 1 }, ' ')).rejects.toMatchObject({ statusCode: 400 });
  expect(called).toBe(false);
});
