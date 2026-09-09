import { expect, test } from 'bun:test';
import { AppError } from '@/errors/app-error';
import { STOCKTAKE_ACTOR, STOCKTAKE_ITEM, STOCKTAKE_ORDER, STOCKTAKE_SUMMARY } from './warehouse-stocktake-test-fixtures';
import { WarehouseStocktakesRepository } from './warehouse-stocktakes';
import { WarehouseStocktakeOrderSchema } from './warehouse-stocktake-records';
import { WarehouseStocktakeCommandResultSchema, WarehouseStocktakeItemSchema, WarehouseStocktakeSummarySchema,
  parseStocktakePage, parseStocktakeRecord } from './warehouse-stocktake-records';

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

test('stocktake repository uses actor/filter/default/max pagination wire and rejects invalid pagination before RPC', async () => {
  const calls: [string, Record<string, unknown>][] = [];
  const repository = new WarehouseStocktakesRepository({ rpc(name, params) { calls.push([name, params]);
    return Promise.resolve({ data: { items: [], total: 0, page: params.p_page, pageSize: params.p_page_size }, error: null }); } });
  expect((await repository.list({ ...STOCKTAKE_ACTOR, page: 1, pageSize: 20, warehouse_id: STOCKTAKE_ID,
    status: 'counting', keyword: ' key ' })).pagination.totalPages).toBe(0);
  await repository.listItems({ ...STOCKTAKE_ACTOR, order_id: STOCKTAKE_ID, page: 1, pageSize: 100 });
  expect(calls[0]?.[1]).toEqual({ p_tenant_id: STOCKTAKE_ID, p_actor_user_id: STOCKTAKE_ID,
    p_actor_employee_id: STOCKTAKE_ID, p_page: 1, p_page_size: 20, p_warehouse_id: STOCKTAKE_ID,
    p_status: 'counting', p_keyword: 'key' });
  expect(calls[1]?.[1]).toEqual({ p_tenant_id: STOCKTAKE_ID, p_actor_user_id: STOCKTAKE_ID,
    p_actor_employee_id: STOCKTAKE_ID, p_page: 1, p_page_size: 100, p_order_id: STOCKTAKE_ID });
  for (const page of [0, Number.NaN]) await expect(repository.list({ ...STOCKTAKE_ACTOR, page, pageSize: 20 })).rejects.toMatchObject({ statusCode: 400 });
  await expect(repository.list({ ...STOCKTAKE_ACTOR, page: 1, pageSize: 101 })).rejects.toMatchObject({ statusCode: 400 });
  expect(calls).toHaveLength(2);
});

test('stocktake record parsers preserve nullable numeric strings and reject malformed representations', () => {
  expect(parseStocktakeRecord(WarehouseStocktakeItemSchema, STOCKTAKE_ITEM)).toEqual(STOCKTAKE_ITEM);
  const signed = { ...STOCKTAKE_ITEM, snapshot_at: 'now', book_quantity: '10.0000', book_value: '20.00',
    book_unit_cost: '2.0000', counted_quantity: '9.9999', difference_reason: '损耗',
    difference_quantity: '-0.0001', unit_cost: '2.0000', amount: '0.01' };
  expect(parseStocktakeRecord(WarehouseStocktakeItemSchema, signed).difference_quantity).toBe('-0.0001');
  for (const value of [1, '1e2', '100000000000000.0000', Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(WarehouseStocktakeItemSchema.safeParse({ ...signed, book_quantity: value }).success).toBe(false);
  }
  expect(WarehouseStocktakeItemSchema.safeParse({ ...signed, injected: true }).success).toBe(false);
  expect(() => parseStocktakePage(WarehouseStocktakeItemSchema, { items: Array(101).fill(STOCKTAKE_ITEM), total: 101, page: 1, pageSize: 100 })).toThrow();
  expect(() => parseStocktakePage(WarehouseStocktakeItemSchema, { items: [], total: 0, page: 0, pageSize: 20 })).toThrow();
});

test('stocktake command receipts accept every result status with raw orders only', () => {
  const cases = [
    ['saved', STOCKTAKE_ORDER], ['counting', { ...STOCKTAKE_ORDER, status: 'counting', started_at: 'now' }],
    ['submitted', { ...STOCKTAKE_ORDER, status: 'submitted', started_at: 'now', submitted_at: 'now' }],
    ['completed', { ...STOCKTAKE_ORDER, status: 'completed', started_at: 'now', submitted_at: 'now', completed_at: 'now' }],
    ['cancelled', { ...STOCKTAKE_ORDER, status: 'cancelled', cancelled_at: 'now' }],
  ];
  for (const [status, order] of cases) expect(WarehouseStocktakeCommandResultSchema.safeParse({ status, order }).success).toBe(true);
  expect(WarehouseStocktakeCommandResultSchema.safeParse({ status: 'saved', order: STOCKTAKE_SUMMARY }).success).toBe(false);
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

test('stocktake summaries expose amounts only for completed orders', () => {
  for (const status of ['draft', 'counting', 'submitted', 'cancelled'] as const) {
    const timestamps = status === 'counting' ? { started_at: 'now' }
      : status === 'submitted' ? { started_at: 'now', submitted_at: 'now' }
        : status === 'cancelled' ? { cancelled_at: 'now' } : {};
    const summary = { ...STOCKTAKE_SUMMARY, status, ...timestamps };
    expect(WarehouseStocktakeSummarySchema.safeParse(summary).success).toBe(true);
    expect(WarehouseStocktakeSummarySchema.safeParse({ ...summary, gain_amount: '100.00' }).success).toBe(false);
    expect(WarehouseStocktakeSummarySchema.safeParse({ ...summary, loss_amount: '0.00' }).success).toBe(false);
  }
  const completed = { ...STOCKTAKE_SUMMARY, status: 'completed', started_at: 'now', submitted_at: 'now',
    completed_at: 'now', gain_amount: '100.00', loss_amount: '0.00' };
  expect(WarehouseStocktakeSummarySchema.safeParse(completed).success).toBe(true);
  expect(WarehouseStocktakeSummarySchema.safeParse({ ...completed, gain_amount: null }).success).toBe(false);
  expect(WarehouseStocktakeSummarySchema.safeParse({ ...completed, loss_amount: null }).success).toBe(false);
});
