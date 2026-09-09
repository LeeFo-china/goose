import { expect, test } from 'bun:test';
import { AppError } from '@/errors/app-error';
import { STOCKTAKE_ACTOR, STOCKTAKE_ITEM, STOCKTAKE_ORDER, STOCKTAKE_SUMMARY } from './warehouse-stocktake-test-fixtures';
import { WarehouseStocktakesRepository } from './warehouse-stocktakes';
import { WarehouseStocktakeOrderSchema } from './warehouse-stocktake-records';

test('stocktake repository sends exact RPC envelopes and parses reads and commands', async () => {
  const calls: [string, Record<string, unknown>][] = [];
  const values = [{ warehouse_stocktakes_enabled: true }, { items: [STOCKTAKE_SUMMARY], total: 1, page: 1, pageSize: 20 },
    STOCKTAKE_SUMMARY, { items: [STOCKTAKE_ITEM], total: 1, page: 1, pageSize: 20 },
    { status: 'saved', order: STOCKTAKE_ORDER }];
  const repository = new WarehouseStocktakesRepository({ rpc(name, params) { calls.push([name, params]); return Promise.resolve({ data: values.shift(), error: null }); } });
  await repository.getSettings(STOCKTAKE_ACTOR);
  await repository.list({ ...STOCKTAKE_ACTOR, page: 1, pageSize: 20 });
  await repository.get({ ...STOCKTAKE_ACTOR, order_id: STOCKTAKE_ID });
  await repository.listItems({ ...STOCKTAKE_ACTOR, order_id: STOCKTAKE_ID, page: 1, pageSize: 20 });
  await repository.command({ ...STOCKTAKE_ACTOR, order_id: STOCKTAKE_ID, command: 'save_draft', expected_version: 0,
    payload: { items: [] }, idempotency_key: 'key' });
  expect(calls.map(([name]) => name)).toEqual(['get_warehouse_stocktake_settings', 'list_warehouse_stocktake_orders',
    'get_warehouse_stocktake_order', 'list_warehouse_stocktake_order_items', 'command_warehouse_stocktake_order']);
  expect(calls[1]?.[1]).toMatchObject({ p_page: 1, p_page_size: 20, p_warehouse_id: null, p_status: null, p_keyword: null });
  expect(calls[4]?.[1]).toMatchObject({ p_command: 'save_draft', p_expected_version: 0, p_payload: { items: [] }, p_idempotency_key: 'key' });
});

test('stocktake repository rejects malformed RPC responses as DB_ERROR', async () => {
  const repository = new WarehouseStocktakesRepository({ rpc() { return Promise.resolve({ data: { items: [], total: -1, page: 1, pageSize: 20 }, error: null }); } });
  await expect(repository.list({ ...STOCKTAKE_ACTOR, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'DB_ERROR' } satisfies Partial<AppError>);
});

const STOCKTAKE_ID = STOCKTAKE_ACTOR.tenant_id;

test('stocktake receipt rejects status and audit timestamp mismatches', () => {
  expect(WarehouseStocktakeOrderSchema.safeParse({ ...STOCKTAKE_ORDER, status: 'completed', completed_at: null }).success).toBe(false);
  expect(WarehouseStocktakeOrderSchema.safeParse({ ...STOCKTAKE_ORDER, status: 'draft', completed_at: '2026-09-09T01:00:00Z' }).success).toBe(false);
});
