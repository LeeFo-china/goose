import { expect, test } from 'bun:test';
import type { AuthContext } from './authorization';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
const ID = '10000000-0000-4000-8000-000000000001';
const USER = '20000000-0000-4000-8000-000000000001';
const EMPLOYEE = '30000000-0000-4000-8000-000000000001';
const draft = { expected_version: 0, warehouse_id: ID, project_id: ID, items: [{ supplier_sku_id: ID, quantity: '1.0000' }] };
const order = { id: ID, tenant_id: ID, warehouse_id: ID, project_id: ID, order_no: 'WI-001', status: 'draft', version: 1,
  reason: null, created_by_employee_id: EMPLOYEE, updated_by_employee_id: EMPLOYEE,
  created_at: '2026-09-08', updated_at: '2026-09-08', submitted_at: null, completed_at: null, cancelled_at: null };
function auth(permissions: string[]): AuthContext {
  return { authUserId: USER, employeeId: EMPLOYEE, tenantId: ID, tenantName: null, tenantSlug: null,
    tenantStatus: 'active', isPlatformAdmin: false, employeeName: '管理员', employeeStatus: 'active',
    departmentId: null, tenantDepartmentId: null, departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null, roleCodes: [], roles: [],
    permissions: permissions.map((code) => ({ code, scope: 'self' as const })) };
}
async function setup(response: { data: unknown; error: unknown } = { data: { status: 'saved', order }, error: null }) {
  const { WarehouseMaterialsService } = await import('./warehouse-materials');
  const { WarehouseMaterialCommandsRepository } = await import('../repositories/warehouse-material-commands');
  const { WarehouseMaterialReadsRepository } = await import('../repositories/warehouse-material-reads');
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const client = { rpc: async (name: string, params: Record<string, unknown>) => { calls.push({ name, params }); return response; } };
  return { calls, service: new WarehouseMaterialsService({
    commands: new WarehouseMaterialCommandsRepository(client), reads: new WarehouseMaterialReadsRepository(client),
  }) };
}

test('manage-only draft writes forward authenticated actor and rely on SQL project scope, replay and rollout', async () => {
  const { service, calls } = await setup();
  const actor = auth(['inventory.issue.manage', 'project.read']);
  expect(await service.command(actor, 'issue', ID, 'save_draft', draft, 'saved-key')).toMatchObject({ status: 'saved' });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.name).toBe('command_warehouse_material_order');
  expect(calls[0]?.params).toMatchObject({ p_actor_user_id: USER, p_actor_employee_id: EMPLOYEE,
    p_tenant_id: ID, p_expected_version: 0, p_idempotency_key: 'saved-key' });
  expect(calls[0]?.params.p_payload).not.toHaveProperty('expected_version');
  // Replaying a receipt must not read mutable settings, warehouse status or current version first.
  await service.command(actor, 'issue', ID, 'save_draft', draft, 'saved-key');
  expect(calls.map((call) => call.name)).toEqual(Array(2).fill('command_warehouse_material_order'));
});

test('complete needs approval, management needs manage, all commands require project read and employee context', async () => {
  const { service, calls } = await setup({ data: { status: 'completed', order: { ...order, status: 'completed', completed_at: '2026-09-08' } }, error: null });
  const approver = auth(['inventory.issue.approve', 'project.read']);
  await service.command(approver, 'issue', ID, 'complete', { expected_version: 2 }, 'complete-key');
  expect(calls[0]?.params).toMatchObject({ p_command: 'complete', p_payload: {} });
  for (const actor of [auth(['inventory.issue.manage', 'project.read']), auth(['inventory.issue.approve']),
    { ...approver, employeeId: null }, { ...approver, tenantId: null }, { ...approver, employeeStatus: 'inactive' }]) {
    await expect(service.command(actor, 'issue', ID, 'complete', { expected_version: 2 }, 'key')).rejects.toMatchObject({ statusCode: 403 });
  }
  await expect(service.command(approver, 'issue', ID, 'save_draft', draft, 'key')).rejects.toMatchObject({ statusCode: 403 });
  expect(calls).toHaveLength(1);
});

test('stock permission is confined to monetary reads and project options accept either issue role', async () => {
  const { service, calls } = await setup({ data: { items: [], total: 0, page: 1, pageSize: 20 }, error: null });
  const query = { page: 1, pageSize: 20 };
  for (const permission of ['inventory.issue.manage', 'inventory.issue.approve']) {
    await service.listProjects(auth([permission, 'project.read']), query);
  }
  await expect(service.list(auth(['inventory.issue.manage', 'project.read']), 'issue', query)).rejects.toMatchObject({ statusCode: 403 });
  await service.list(auth(['inventory.stock.view', 'project.read']), 'issue', { ...query, projectId: ID, warehouseId: ID });
  expect(calls[2]?.params).toMatchObject({ p_project_id: ID, p_warehouse_id: ID, p_actor_employee_id: EMPLOYEE });
  await expect(service.listProjects(auth(['inventory.stock.view', 'project.read']), query)).rejects.toMatchObject({ statusCode: 403 });
});

test('commands reject forged identity, cost input, missing keys, invalid versions and return submit before RPC', async () => {
  const { service, calls } = await setup();
  const actor = auth(['inventory.issue.manage', 'project.read']);
  for (const input of [{ ...draft, actor_user_id: ID }, { ...draft, amount: '3' }, { ...draft, expected_version: -1 }]) {
    await expect(service.command(actor, 'issue', ID, 'save_draft', input, 'key')).rejects.toMatchObject({ statusCode: 400 });
  }
  await expect(service.command(actor, 'issue', ID, 'save_draft', draft, '')).rejects.toMatchObject({ statusCode: 400 });
  await expect(service.command(actor, 'return', ID, 'submit', { expected_version: 1 }, 'key')).rejects.toMatchObject({ statusCode: 400 });
  expect(calls).toHaveLength(0);
});

test.each([
  ['FORBIDDEN', 403], ['ACTOR_INVALID', 403], ['NOT_FOUND', 404], ['INVALID', 400], ['ITEMS_INVALID', 400],
  ['SOURCE_CONFLICT', 409], ['VERSION_CONFLICT', 409], ['STATE_CONFLICT', 409], ['IDEMPOTENCY_CONFLICT', 409],
  ['NOT_ENABLED', 403], ['WAREHOUSE_INVALID', 400], ['WAREHOUSE_INACTIVE', 409], ['SKU_INVALID', 400],
  ['RETURN_QUANTITY_EXCEEDED', 409], ['COST_CATEGORY_REQUIRED', 409], ['INSUFFICIENT_STOCK', 409], ['IMMUTABLE', 409],
] as const)('maps SQL %s while preserving stable error identity', async (suffix, statusCode) => {
  const code = `WAREHOUSE_MATERIAL_${suffix}`;
  const { service, calls } = await setup({ data: null, error: { message: code, code: 'P0001' } });
  await expect(service.command(auth(['inventory.issue.manage', 'project.read']), 'issue', ID, 'save_draft', draft, 'key'))
    .rejects.toMatchObject({ code, statusCode });
  expect(calls).toHaveLength(1);
});

test('project-scope read failures from SQL are forbidden and unrelated errors stay database errors', async () => {
  for (const message of ['WAREHOUSE_MATERIAL_FORBIDDEN', 'connection failed']) {
    const { service } = await setup({ data: null, error: { message } });
    await expect(service.get(auth(['inventory.stock.view', 'project.read']), 'return', ID))
      .rejects.toMatchObject({ code: message.startsWith('WAREHOUSE_') ? message : 'DB_ERROR' });
  }
});
