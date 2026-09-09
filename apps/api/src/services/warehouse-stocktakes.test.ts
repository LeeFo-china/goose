import { expect, test } from 'bun:test';
import { STOCKTAKE_ACTOR, STOCKTAKE_COUNTS, STOCKTAKE_DRAFT, STOCKTAKE_ID, STOCKTAKE_ORDER, stocktakeAuth } from '@/repositories/warehouse-stocktake-test-fixtures';
import { WarehouseStocktakesService } from './warehouse-stocktakes';
import { AppError } from '@/errors/app-error';
import { withWarehouseStocktakeErrors } from './warehouse-stocktake-errors';
import { WarehouseStocktakesRepository } from '@/repositories/warehouse-stocktakes';
import type { AuthContext } from './authorization';

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

test('stocktake service drives all commands and reads through one RPC each with independent permissions', async () => {
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const repository = new WarehouseStocktakesRepository({ rpc: async (name, params) => {
    calls.push({ name, params });
    if (name === 'get_warehouse_stocktake_settings') return { data: { warehouse_stocktakes_enabled: true }, error: null };
    if (name === 'list_warehouse_stocktake_orders') return { data: { items: [], total: 0, page: params.p_page, pageSize: params.p_page_size }, error: null };
    if (name === 'get_warehouse_stocktake_order') return { data: { ...STOCKTAKE_ORDER, warehouse_name: '主仓', item_count: 0, counted_count: 0, difference_count: 0, gain_amount: null, loss_amount: null }, error: null };
    if (name === 'list_warehouse_stocktake_order_items') return { data: { items: [], total: 0, page: params.p_page, pageSize: params.p_page_size }, error: null };
    const command = params.p_command as string;
    const order = command === 'start' ? { ...STOCKTAKE_ORDER, status: 'counting', started_at: 'now' }
      : command === 'submit' ? { ...STOCKTAKE_ORDER, status: 'submitted', started_at: 'now', submitted_at: 'now' }
      : command === 'complete' ? { ...STOCKTAKE_ORDER, status: 'completed', started_at: 'now', submitted_at: 'now', completed_at: 'now' }
      : command === 'cancel' ? { ...STOCKTAKE_ORDER, status: 'cancelled', cancelled_at: 'now' } : STOCKTAKE_ORDER;
    return { data: { status: command === 'start' || command === 'record_counts' ? 'counting'
      : command === 'save_draft' ? 'saved' : command === 'submit' ? 'submitted'
        : command === 'complete' ? 'completed' : 'cancelled', order }, error: null };
  } });
  const service = new WarehouseStocktakesService({ repository });
  const manage = stocktakeAuth(['inventory.stocktake.manage']);
  for (const command of ['save_draft', 'start', 'record_counts', 'submit', 'cancel'] as const) {
    const input = command === 'save_draft' ? STOCKTAKE_DRAFT : command === 'record_counts' ? STOCKTAKE_COUNTS : { expected_version: 1 };
    const before = calls.length;
    await service.command(manage, STOCKTAKE_ID, command, input, command);
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)?.name).toBe('command_warehouse_stocktake_order');
  }
  await expect(service.command(manage, STOCKTAKE_ID, 'complete', { expected_version: 1 }, 'complete')).rejects.toMatchObject({ statusCode: 403 });
  const approve = stocktakeAuth(['inventory.stocktake.approve']);
  await service.command(approve, STOCKTAKE_ID, 'complete', { expected_version: 1 }, 'complete');
  await expect(service.command(approve, STOCKTAKE_ID, 'start', { expected_version: 1 }, 'start')).rejects.toMatchObject({ statusCode: 403 });
  const view = stocktakeAuth(['inventory.stock.view']);
  await service.list(view, { page: 1, pageSize: 20 }); await service.get(view, STOCKTAKE_ID);
  await service.listItems(view, STOCKTAKE_ID, { page: 1, pageSize: 20 }); await service.getSettings(view);
  await expect(service.command(view, STOCKTAKE_ID, 'start', { expected_version: 1 }, 'view')).rejects.toMatchObject({ statusCode: 403 });
  for (const permission of ['inventory.stock.view', 'inventory.stocktake.manage', 'inventory.stocktake.approve']) {
    await service.getSettings(stocktakeAuth([permission]));
  }
  await expect(service.getSettings(stocktakeAuth([]))).rejects.toMatchObject({ statusCode: 403 });
});

test('stocktake errors travel through actual service and repository boundaries', async () => {
  const statuses: Record<string, number> = { ACTOR_INVALID: 403, BALANCE_INVALID: 409, COST_BASIS_REQUIRED: 409,
    COUNTS_REQUIRED: 409, DIFFERENCE_REASON_REQUIRED: 400, FORBIDDEN: 403, IDEMPOTENCY_CONFLICT: 409,
    IMMUTABLE: 409, INVALID: 400, ITEMS_INVALID: 400, NOT_ENABLED: 403, NOT_FOUND: 404, SKU_INVALID: 400,
    SNAPSHOT_CONFLICT: 409, SNAPSHOT_IMMUTABLE: 409, SOURCE_CONFLICT: 409, STATE_CONFLICT: 409,
    VERSION_CONFLICT: 409, WAREHOUSE_INACTIVE: 409, WAREHOUSE_INVALID: 400 };
  for (const [suffix, statusCode] of Object.entries(statuses)) {
    const repository = new WarehouseStocktakesRepository({ rpc: async () => ({ data: null, error: { message: `WAREHOUSE_STOCKTAKE_${suffix}` } }) });
    const service = new WarehouseStocktakesService({ repository });
    await expect(service.command(stocktakeAuth(['inventory.stocktake.manage']), STOCKTAKE_ID, 'start', { expected_version: 1 }, suffix))
      .rejects.toMatchObject({ code: `WAREHOUSE_STOCKTAKE_${suffix}`, statusCode });
  }
  const repository = new WarehouseStocktakesRepository({ rpc: async () => ({ data: null, error: { message: 'connection lost' } }) });
  await expect(new WarehouseStocktakesService({ repository }).getSettings(stocktakeAuth(['inventory.stock.view'])))
    .rejects.toMatchObject({ code: 'DB_ERROR' });
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
  const valid = stocktakeAuth(['inventory.stocktake.manage']);
  const invalidActors = [{ ...valid, tenantId: null }, { ...valid, authUserId: null }, { ...valid, employeeId: null },
    { ...valid, employeeStatus: 'inactive' }];
  for (const auth of invalidActors as unknown as AuthContext[]) {
    await expect(service.command(auth, STOCKTAKE_ID, 'start', { expected_version: 1 }, 'key')).rejects.toMatchObject({ statusCode: 403 });
  }
  await expect(service.command(stocktakeAuth(['inventory.stocktake.manage']), STOCKTAKE_ID, 'start', { expected_version: 1 }, ' ')).rejects.toMatchObject({ statusCode: 400 });
  await expect(service.command(valid, STOCKTAKE_ID, 'start', { expected_version: 1, actor_user_id: STOCKTAKE_ID }, 'key'))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(called).toBe(false);
});
