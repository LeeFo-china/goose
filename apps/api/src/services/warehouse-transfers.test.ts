import { expect, test } from 'bun:test';
import { TRANSFER_ID as id, TRANSFER_ORDER as order, TRANSFER_DRAFT as draft, transferAuth as auth } from '../repositories/warehouse-transfer-test-fixtures';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
async function setup(response: { data: unknown; error: unknown } = { data: { status: 'saved', order }, error: null }) {
  const { WarehouseTransfersService } = await import('./warehouse-transfers');
  const { WarehouseTransfersRepository } = await import('../repositories/warehouse-transfers');
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  return { calls, service: new WarehouseTransfersService({ repository: new WarehouseTransfersRepository({ rpc: async (name, params) => {
    calls.push({ name, params }); return response;
  } }) }) };
}

test('manage commands need no project or stock permission and replay performs only command RPC', async () => {
  const { service, calls } = await setup();
  for (let n = 0; n < 2; n++) expect(await service.command(auth(['inventory.transfer.manage']), id, 'save_draft', draft, ' key ')).toEqual({ status: 'saved', order });
  expect(calls.map((call) => call.name)).toEqual(Array(2).fill('command_warehouse_transfer_order'));
  expect(calls[0]?.params).toMatchObject({ p_tenant_id: id, p_actor_user_id: id, p_actor_employee_id: id, p_idempotency_key: 'key', p_expected_version: 0 });
  expect(calls[0]?.params.p_payload).not.toHaveProperty('expected_version');
});

test('approval, management and stock read remain independent and identity is required', async () => {
  const { service, calls } = await setup({ data: { status: 'completed', order: { ...order, status: 'completed', submitted_at: '2026-09-09', completed_at: '2026-09-09' } }, error: null });
  const approver = auth(['inventory.transfer.approve']);
  await service.command(approver, id, 'complete', { expected_version: 2 }, 'key');
  expect(calls[0]?.params).toMatchObject({ p_payload: {}, p_command: 'complete' });
  for (const actor of [auth(['inventory.transfer.manage']), auth(['inventory.stock.view']), { ...approver, tenantId: null },
    { ...approver, authUserId: '' }, { ...approver, employeeId: null }, { ...approver, employeeStatus: 'inactive' }]) {
    await expect(service.command(actor, id, 'complete', { expected_version: 2 }, 'key')).rejects.toMatchObject({ statusCode: 403 });
  }
  await expect(service.command(approver, id, 'save_draft', draft, 'key')).rejects.toMatchObject({ statusCode: 403 });
  for (const actor of [approver, auth(['inventory.transfer.manage'])]) {
    await expect(service.list(actor, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.get(actor, id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.listItems(actor, id, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(calls).toHaveLength(1);
});

test('all inventory transfer roles may read disabled settings; only stock may read pages', async () => {
  for (const code of ['inventory.stock.view', 'inventory.transfer.manage', 'inventory.transfer.approve']) {
    const { service } = await setup({ data: { warehouse_transfers_enabled: false }, error: null });
    expect(await service.getSettings(auth([code]))).toEqual({ warehouse_transfers_enabled: false });
    await expect(service.getSettings(auth(['project.read']))).rejects.toMatchObject({ statusCode: 403 });
  }
  const { service, calls } = await setup({ data: { items: [], total: 0, page: 1, pageSize: 20 }, error: null });
  expect((await service.list(auth(['inventory.stock.view']), { page: 1, pageSize: 20, sourceWarehouseId: id })).list).toEqual([]);
  expect(calls[0]?.params).toMatchObject({ p_source_warehouse_id: id, p_destination_warehouse_id: null });
});

test('forged fields, costs, bad versions and missing idempotency keys are rejected before RPC', async () => {
  const { service, calls } = await setup();
  for (const input of [{ ...draft, actor_user_id: id }, { ...draft, amount: '3' }, { ...draft, expected_version: -1 }]) {
    await expect(service.command(auth(['inventory.transfer.manage']), id, 'save_draft', input, 'key')).rejects.toMatchObject({ statusCode: 400 });
  }
  for (const key of ['', ' ', 'k'.repeat(121)]) {
    await expect(service.command(auth(['inventory.transfer.manage']), id, 'save_draft', draft, key)).rejects.toMatchObject({ statusCode: 400 });
  }
  expect(calls).toHaveLength(0);
});

test.each([
  ['INVALID', 400], ['ITEMS_INVALID', 400], ['FORBIDDEN', 403], ['ACTOR_INVALID', 403], ['NOT_FOUND', 404],
  ['SOURCE_CONFLICT', 409], ['VERSION_CONFLICT', 409], ['STATE_CONFLICT', 409], ['IDEMPOTENCY_CONFLICT', 409],
  ['NOT_ENABLED', 403], ['WAREHOUSE_INVALID', 400], ['WAREHOUSE_INACTIVE', 409], ['SKU_INVALID', 400],
  ['INSUFFICIENT_STOCK', 409], ['BALANCE_INVALID', 409], ['IMMUTABLE', 409],
] as const)('maps database %s to stable business error', async (suffix, statusCode) => {
  const code = `WAREHOUSE_TRANSFER_${suffix}`;
  const { service } = await setup({ data: null, error: { message: code, code: 'P0001' } });
  await expect(service.command(auth(['inventory.transfer.manage']), id, 'save_draft', draft, 'key')).rejects.toMatchObject({ code, statusCode });
});

test('unknown database failures are not swallowed or disguised', async () => {
  const { service } = await setup({ data: null, error: { message: 'connection failed' } });
  await expect(service.get(auth(['inventory.stock.view']), id)).rejects.toMatchObject({ code: 'DB_ERROR', statusCode: 500 });
});
