import { expect, test } from 'bun:test';
import type { EmployeePermissionContextRecord } from '@/repositories/permissions';
import { STOCKTAKE_EMPLOYEE_ID, STOCKTAKE_ID, STOCKTAKE_TENANT_ID,
  STOCKTAKE_USER_ID } from '@/repositories/warehouse-stocktake-test-fixtures';

test('derived system-admin permissions reach stocktake RPC but SQL denial remains authoritative', async () => {
  const { buildAuthContext } = await import('./legacy/context-builder');
  const { WarehouseStocktakesRepository } = await import('@/repositories/warehouse-stocktakes');
  const { WarehouseStocktakesService } = await import('../warehouse-stocktakes');
  const context: EmployeePermissionContextRecord = {
    employee: { id: STOCKTAKE_EMPLOYEE_ID, user_id: STOCKTAKE_USER_ID, tenant_id: STOCKTAKE_TENANT_ID, status: 'active',
      tenant_department_id: null, post_id: null, name: '管理员', phone: null, avatar: null,
      tenant_department: null, post: null, tenant: { id: STOCKTAKE_TENANT_ID, name: '租户', slug: 'tenant', status: 'active' } },
    roles: [{ id: STOCKTAKE_ID, tenant_id: STOCKTAKE_TENANT_ID, code: 'system_admin', name: '系统管理员',
      description: null, status: 'active', created_at: 'now', updated_at: 'now' }],
    rolePermissions: [], overrides: [],
  };
  const auth = buildAuthContext(context, STOCKTAKE_USER_ID);
  expect(auth.permissions).toContainEqual({ code: 'inventory.stocktake.manage', scope: 'all' });
  expect(auth.permissions).toContainEqual({ code: 'inventory.stocktake.approve', scope: 'all' });
  let calls = 0;
  const repository = new WarehouseStocktakesRepository({ rpc: async (_name, params) => {
    calls += 1;
    expect(params).toMatchObject({ p_tenant_id: STOCKTAKE_TENANT_ID, p_actor_user_id: STOCKTAKE_USER_ID,
      p_actor_employee_id: STOCKTAKE_EMPLOYEE_ID });
    return { data: null, error: { message: 'WAREHOUSE_STOCKTAKE_FORBIDDEN' } };
  } });
  await expect(new WarehouseStocktakesService({ repository }).command(auth, STOCKTAKE_ID, 'start',
    { expected_version: 1 }, 'key')).rejects.toMatchObject({ statusCode: 403, code: 'WAREHOUSE_STOCKTAKE_FORBIDDEN' });
  expect(calls).toBe(1);
});
