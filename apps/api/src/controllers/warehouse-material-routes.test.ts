import { expect, spyOn, test } from 'bun:test';
import Fastify from 'fastify';
import { resolveTenantServiceRouteCapability } from '@/services/tenant-service-capability-map';
import { getTenantServiceAuthOptions } from '@/services/tenant-service-route-access';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

test('material controllers register only explicit paged reads and command writes with independent capability classification', async () => {
  const { default: issues } = await import('./warehouse-issues');
  const { default: returns } = await import('./warehouse-returns');
  const app = Fastify();
  const routes: { method: string; url: string; access: 'read' | 'write' }[] = [];
  app.addHook('onRoute', (route) => {
    for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
      const access = route.config?.tenantServiceAccess;
      expect(access === 'read' || access === 'write').toBe(true);
      if (access === 'read' || access === 'write') routes.push({ method, url: route.url, access });
    }
  });
  issues.registerExtraRoutes(app);
  returns.registerExtraRoutes(app);
  try {
    await app.ready();
    const expected = [
      'GET /warehouse-issues', 'GET /warehouse-issues/project-options', 'GET /warehouse-issues/:id', 'GET /warehouse-issues/:id/items',
      'GET /warehouse-returns', 'GET /warehouse-returns/:id', 'GET /warehouse-returns/:id/items',
      ...['save-draft', 'submit', 'complete', 'cancel'].map((action) => `POST /warehouse-issues/:id/${action}`),
      ...['save-draft', 'complete', 'cancel'].map((action) => `POST /warehouse-returns/:id/${action}`),
    ];
    expect(routes.filter((route) => route.method !== 'HEAD').map((route) => `${route.method} ${route.url}`).sort()).toEqual(expected.sort());
    for (const route of routes) {
      expect(resolveTenantServiceRouteCapability(route)).toEqual({ kind: 'excluded', reason: 'not_trial_capability' });
      expect(getTenantServiceAuthOptions({ method: route.method, routeOptions: {
        url: route.url, config: { tenantServiceAccess: route.access },
      } })).toEqual({ tenantServiceAccess: route.method === 'POST' ? 'write' : 'read', requiredCapability: null });
    }
  } finally { await app.close(); }
});

test('HTTP boundary rejects malformed commands and forwards valid authenticated requests with success envelope', async () => {
  const { default: issues } = await import('./warehouse-issues');
  const { default: returns } = await import('./warehouse-returns');
  const { authorizationService } = await import('@/services/authorization');
  const { warehouseMaterialsService } = await import('@/services/warehouse-materials');
  const id = '10000000-0000-4000-8000-000000000001';
  const context = {
    authUserId: id, employeeId: id, tenantId: id, tenantName: null, tenantSlug: null,
    tenantStatus: 'active' as const, isPlatformAdmin: false, employeeName: '仓管员', employeeStatus: 'active',
    departmentId: null, tenantDepartmentId: null, departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null, roleCodes: [], roles: [], permissions: [],
  };
  const authSpy = spyOn(authorizationService, 'getRequiredAuthContext').mockResolvedValue(context);
  const receipt = { status: 'cancelled' as const, order: {
    id, tenant_id: id, warehouse_id: id, project_id: id, order_no: 'WI-001', status: 'cancelled' as const, version: 2,
    reason: null, created_by_employee_id: id, updated_by_employee_id: id,
    created_at: '2026-09-08', updated_at: '2026-09-08', submitted_at: null, completed_at: null, cancelled_at: '2026-09-08',
  } };
  const commandSpy = spyOn(warehouseMaterialsService, 'command').mockResolvedValue(receipt);
  const app = Fastify();
  issues.registerExtraRoutes(app);
  returns.registerExtraRoutes(app);
  try {
    const url = `/warehouse-issues/${id}/cancel`;
    for (const request of [
      { url, payload: { expected_version: 1 } },
      { url, headers: { 'idempotency-key': 'key' }, payload: { expected_version: 0 } },
      { url, headers: { 'idempotency-key': 'key' }, payload: { expected_version: 1, actor_user_id: id } },
      { url: '/warehouse-issues/not-uuid/cancel', headers: { 'idempotency-key': 'key' }, payload: { expected_version: 1 } },
    ]) {
      expect((await app.inject({ method: 'POST', ...request })).statusCode).toBe(400);
    }
    expect(commandSpy).not.toHaveBeenCalled();
    const response = await app.inject({ method: 'POST', url, headers: { 'idempotency-key': ' key ' }, payload: { expected_version: 1 } });
    expect(response.statusCode).toBe(200);
    expect(response.json<unknown>()).toEqual({ data: receipt, message: 'success' });
    expect(commandSpy).toHaveBeenCalledWith(context, 'issue', id, 'cancel', { expected_version: 1 }, 'key');
    expect((await app.inject({ method: 'POST', url: `/warehouse-returns/${id}/submit`, payload: { expected_version: 1 } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/warehouse-issues?pageSize=101' })).statusCode).toBe(400);
  } finally {
    authSpy.mockRestore();
    commandSpy.mockRestore();
    await app.close();
  }
});
