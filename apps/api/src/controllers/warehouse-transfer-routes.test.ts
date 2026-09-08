import { expect, spyOn, test } from 'bun:test';
import Fastify from 'fastify';
import { resolveTenantServiceRouteCapability } from '@/services/tenant-service-capability-map';
import { getTenantServiceAuthOptions } from '@/services/tenant-service-route-access';
import { TRANSFER_ID as id, TRANSFER_ORDER as order, TRANSFER_SUMMARY as summary,
  TRANSFER_ITEM as item, TRANSFER_DRAFT as draft, transferAuth } from '@/repositories/warehouse-transfer-test-fixtures';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

test('registers exactly eight explicit routes with read/write capability metadata; no generic CRUD', async () => {
  const { default: controller } = await import('./warehouse-transfers');
  const app = Fastify();
  const routes: { method: string; url: string; access: 'read' | 'write' }[] = [];
  app.addHook('onRoute', (route) => {
    const access = route.config?.tenantServiceAccess;
    expect(access === 'read' || access === 'write').toBe(true);
    if (access !== 'read' && access !== 'write') return;
    for (const method of Array.isArray(route.method) ? route.method : [route.method]) routes.push({ method, url: route.url, access });
  });
  controller.registerExtraRoutes(app);
  try {
    await app.ready();
    expect(routes.filter((route) => route.method !== 'HEAD').map((route) => `${route.method} ${route.url}`).sort()).toEqual([
      'GET /warehouse-transfers', 'GET /warehouse-transfers/settings', 'GET /warehouse-transfers/:id', 'GET /warehouse-transfers/:id/items',
      ...['save-draft', 'submit', 'complete', 'cancel'].map((action) => `POST /warehouse-transfers/:id/${action}`),
    ].sort());
    for (const route of routes) {
      expect(resolveTenantServiceRouteCapability(route)).toEqual({ kind: 'excluded', reason: 'not_trial_capability' });
      expect(getTenantServiceAuthOptions({ method: route.method, routeOptions: { url: route.url, config: { tenantServiceAccess: route.access } } }))
        .toEqual({ tenantServiceAccess: route.method === 'POST' ? 'write' : 'read', requiredCapability: null });
    }
  } finally { await app.close(); }
});

test('HTTP forwards authenticated context, all commands and paged reads with strict validation', async () => {
  const { default: controller } = await import('./warehouse-transfers');
  const { warehouseTransfersService } = await import('@/services/warehouse-transfers');
  const { authorizationService } = await import('@/services/authorization');
  const context = transferAuth(['inventory.transfer.manage', 'inventory.transfer.approve', 'inventory.stock.view']);
  const authSpy = spyOn(authorizationService, 'getRequiredAuthContext').mockResolvedValue(context);
  const receipt = { status: 'saved' as const, order };
  const commandSpy = spyOn(warehouseTransfersService, 'command').mockResolvedValue(receipt);
  const settingsSpy = spyOn(warehouseTransfersService, 'getSettings').mockResolvedValue({ warehouse_transfers_enabled: false });
  const pagination = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
  const listSpy = spyOn(warehouseTransfersService, 'list').mockResolvedValue({ list: [summary], pagination });
  const getSpy = spyOn(warehouseTransfersService, 'get').mockResolvedValue(summary);
  const itemsSpy = spyOn(warehouseTransfersService, 'listItems').mockResolvedValue({ list: [item], pagination });
  const app = Fastify();
  controller.registerExtraRoutes(app);
  try {
    for (const request of [
      { url: `/warehouse-transfers/${id}/cancel`, payload: { expected_version: 1 } },
      { url: `/warehouse-transfers/${id}/cancel`, headers: { 'idempotency-key': 'key' }, payload: { expected_version: 0 } },
      { url: `/warehouse-transfers/${id}/cancel`, headers: { 'idempotency-key': 'key' }, payload: { expected_version: 1, tenant_id: id } },
      { url: '/warehouse-transfers/not-uuid/submit', headers: { 'idempotency-key': 'key' }, payload: { expected_version: 1 } },
      { url: `/warehouse-transfers/${id}/save-draft`, headers: { 'idempotency-key': 'key' }, payload: { ...draft, amount: '1.00' } },
    ]) expect((await app.inject({ method: 'POST', ...request })).statusCode).toBe(400);
    expect(commandSpy).not.toHaveBeenCalled();
    for (const [path, command] of [['save-draft', 'save_draft'], ['submit', 'submit'], ['complete', 'complete'], ['cancel', 'cancel']] as const) {
      const payload = command === 'save_draft' ? draft : { expected_version: 1 };
      const response = await app.inject({ method: 'POST', url: `/warehouse-transfers/${id}/${path}`, headers: { 'idempotency-key': ' key ' }, payload });
      expect(response.statusCode).toBe(200);
      expect(response.json<unknown>()).toEqual({ data: receipt, message: 'success' });
      expect(commandSpy).toHaveBeenLastCalledWith(context, id, command, payload, 'key');
    }
    for (const url of ['/warehouse-transfers?pageSize=101', `/warehouse-transfers?tenant_id=${id}`,
      `/warehouse-transfers/${id}/items?page=0`, `/warehouse-transfers/${id}?tenant_id=${id}`, `/warehouse-transfers/settings?tenant_id=${id}`]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(400);
    }
    expect(listSpy).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
    expect(itemsSpy).not.toHaveBeenCalled();
    expect(settingsSpy).not.toHaveBeenCalled();
    for (const url of ['/warehouse-transfers', `/warehouse-transfers/${id}`, `/warehouse-transfers/${id}/items`, '/warehouse-transfers/settings']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
    expect(listSpy).toHaveBeenCalledWith(context, { page: 1, pageSize: 20 });
    expect(itemsSpy).toHaveBeenCalledWith(context, id, { page: 1, pageSize: 20 });
    expect(settingsSpy).toHaveBeenCalledWith(context);
    expect((await app.inject({ method: 'PATCH', url: `/warehouse-transfers/${id}`, payload: draft })).statusCode).toBe(404);
  } finally {
    for (const spy of [authSpy, commandSpy, settingsSpy, listSpy, getSpy, itemsSpy]) spy.mockRestore();
    await app.close();
  }
});
