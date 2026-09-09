import { expect, test } from 'bun:test';
import { TRANSFER_ACTOR as actor, TRANSFER_ID as id, DESTINATION_ID, TRANSFER_ORDER as order,
  TRANSFER_SUMMARY as summary, TRANSFER_ITEM as item } from './warehouse-transfer-test-fixtures';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

test('transfer RPC reads preserve exact decimals, actor, filters and bounded paging', async () => {
  const { WarehouseTransfersRepository } = await import('./warehouse-transfers');
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const repository = new WarehouseTransfersRepository({ rpc: async (name, params) => {
    calls.push({ name, params });
    return { error: null, data: name === 'get_warehouse_transfer_settings' ? { warehouse_transfers_enabled: false }
      : name === 'get_warehouse_transfer_order' ? summary : { items: name === 'list_warehouse_transfer_orders' ? [summary] : [item], total: 21, page: 2, pageSize: 20 } };
  } });
  expect((await repository.list({ ...actor, page: 2, pageSize: 20, source_warehouse_id: id, destination_warehouse_id: DESTINATION_ID, status: 'draft', keyword: ' WT ' })).list).toEqual([summary]);
  expect(calls[0]).toEqual({ name: 'list_warehouse_transfer_orders', params: { p_tenant_id: id, p_actor_user_id: id, p_actor_employee_id: id,
    p_source_warehouse_id: id, p_destination_warehouse_id: DESTINATION_ID, p_status: 'draft', p_keyword: 'WT', p_page: 2, p_page_size: 20 } });
  expect(await repository.get({ ...actor, order_id: id })).toEqual(summary);
  const result = await repository.listItems({ ...actor, order_id: id, page: 2, pageSize: 20 });
  expect(result).toEqual({ list: [item], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } });
  expect(calls[2]?.params).toEqual({ p_tenant_id: id, p_actor_user_id: id, p_actor_employee_id: id, p_order_id: id, p_page: 2, p_page_size: 20 });
  expect(await repository.getSettings(actor)).toEqual({ warehouse_transfers_enabled: false });
  for (const pageSize of [0, 101, NaN]) {
    await expect(repository.list({ ...actor, page: 1, pageSize })).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(calls).toHaveLength(4);
});

test('command sends exact envelope and parses immutable raw order receipt', async () => {
  const { WarehouseTransfersRepository } = await import('./warehouse-transfers');
  const payload = { source_warehouse_id: id, destination_warehouse_id: DESTINATION_ID, reason: '补料', items: [{ supplier_sku_id: id, quantity: '0.0001' }] };
  const repository = new WarehouseTransfersRepository({ rpc: async (name, params) => {
    expect(name).toBe('command_warehouse_transfer_order');
    expect(params).toEqual({ p_tenant_id: id, p_actor_user_id: id, p_actor_employee_id: id, p_order_id: id,
      p_command: 'save_draft', p_expected_version: 0, p_payload: payload, p_idempotency_key: 'key' });
    return { error: null, data: { status: 'saved', order } };
  } });
  expect(await repository.command({ ...actor, order_id: id, command: 'save_draft', expected_version: 0, payload, idempotency_key: 'key' })).toEqual({ status: 'saved', order });
});

test('malformed RPC contracts fail closed without converting amounts', async () => {
  const { WarehouseTransfersRepository } = await import('./warehouse-transfers');
  for (const data of [{ ...summary, total_amount: 12 }, { ...summary, unknown: false }, { ...summary, status: 'done' }]) {
    const repository = new WarehouseTransfersRepository({ rpc: async () => ({ data, error: null }) });
    await expect(repository.get({ ...actor, order_id: id })).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
  for (const data of [{ items: [{ ...item, quantity: 1 }], total: 1, page: 1, pageSize: 20 },
    { items: [], total: 0, page: 1, pageSize: 101 }, { items: [], total: -1, page: 1, pageSize: 20 }]) {
    const repository = new WarehouseTransfersRepository({ rpc: async () => ({ data, error: null }) });
    await expect(repository.listItems({ ...actor, order_id: id, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'DB_ERROR' });
  }
});
