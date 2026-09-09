import { expect, spyOn, test } from 'bun:test';
import Fastify from 'fastify';
import type { InjectOptions } from 'fastify';
import { resolveTenantServiceRouteCapability } from '@/services/tenant-service-capability-map';
import { getTenantServiceAuthOptions } from '@/services/tenant-service-route-access';
import { STOCKTAKE_COUNTS, STOCKTAKE_DRAFT, STOCKTAKE_ID, STOCKTAKE_ITEM, STOCKTAKE_ORDER,
  STOCKTAKE_SUMMARY, stocktakeAuth } from '@/repositories/warehouse-stocktake-test-fixtures';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

test('stocktake controller registers exactly ten explicit read/write routes and no CRUD', async () => {
  const { default: controller } = await import('./warehouse-stocktakes');
  const app = Fastify();
  const routes: string[] = [];
  app.addHook('onRoute', (route) => {
    if (route.method !== 'HEAD') routes.push(`${route.method} ${route.url} ${route.config?.tenantServiceAccess}`);
  });
  controller.registerExtraRoutes(app);
  try {
    await app.ready();
    expect(routes.sort()).toEqual([
      'GET /warehouse-stocktakes read', 'GET /warehouse-stocktakes/settings read',
      'GET /warehouse-stocktakes/:id read', 'GET /warehouse-stocktakes/:id/items read',
      ...['save-draft', 'start', 'record-counts', 'submit', 'complete', 'cancel']
        .map((action) => `POST /warehouse-stocktakes/:id/${action} write`),
    ].sort());
    for (const value of routes) {
      const [method, url, access] = value.split(' ') as [string, string, 'read' | 'write'];
      expect(resolveTenantServiceRouteCapability({ method, url, access })).toEqual({ kind: 'excluded', reason: 'not_trial_capability' });
      expect(getTenantServiceAuthOptions({ method, routeOptions: { url, config: { tenantServiceAccess: access } } }))
        .toEqual({ tenantServiceAccess: access, requiredCapability: null });
    }
    expect((await app.inject({ method: 'PATCH', url: '/warehouse-stocktakes/10000000-0000-4000-8000-000000000001' })).statusCode).toBe(404);
  } finally { await app.close(); }
});

test('stocktake HTTP validates and forwards all four reads and six commands', async () => {
  const { default: controller } = await import('./warehouse-stocktakes');
  const { warehouseStocktakesService } = await import('@/services/warehouse-stocktakes');
  const { authorizationService } = await import('@/services/authorization');
  const context = stocktakeAuth(['inventory.stock.view', 'inventory.stocktake.manage', 'inventory.stocktake.approve']);
  const authSpy = spyOn(authorizationService, 'getRequiredAuthContext').mockResolvedValue(context);
  const receipt = { status: 'saved' as const, order: STOCKTAKE_ORDER };
  const commandSpy = spyOn(warehouseStocktakesService, 'command').mockResolvedValue(receipt);
  const settingsSpy = spyOn(warehouseStocktakesService, 'getSettings').mockResolvedValue({ warehouse_stocktakes_enabled: true });
  const pagination = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
  const listSpy = spyOn(warehouseStocktakesService, 'list').mockResolvedValue({ list: [STOCKTAKE_SUMMARY], pagination });
  const getSpy = spyOn(warehouseStocktakesService, 'get').mockResolvedValue(STOCKTAKE_SUMMARY);
  const itemsSpy = spyOn(warehouseStocktakesService, 'listItems').mockResolvedValue({ list: [STOCKTAKE_ITEM], pagination });
  const app = Fastify(); controller.registerExtraRoutes(app);
  try {
    for (const url of ['/warehouse-stocktakes', `/warehouse-stocktakes/${STOCKTAKE_ID}`,
      `/warehouse-stocktakes/${STOCKTAKE_ID}/items`, '/warehouse-stocktakes/settings']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200);
    }
    expect(listSpy).toHaveBeenCalledWith(context, { page: 1, pageSize: 20 });
    expect(getSpy).toHaveBeenCalledWith(context, STOCKTAKE_ID);
    expect(itemsSpy).toHaveBeenCalledWith(context, STOCKTAKE_ID, { page: 1, pageSize: 20 });
    expect(settingsSpy).toHaveBeenCalledWith(context);
    for (const [path, command] of [['save-draft', 'save_draft'], ['start', 'start'], ['record-counts', 'record_counts'],
      ['submit', 'submit'], ['complete', 'complete'], ['cancel', 'cancel']] as const) {
      const payload = command === 'save_draft' ? STOCKTAKE_DRAFT : command === 'record_counts' ? STOCKTAKE_COUNTS : { expected_version: 1 };
      const response = await app.inject({ method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/${path}`,
        headers: { 'idempotency-key': ' key ' }, payload });
      expect(response.statusCode).toBe(200);
      expect(commandSpy).toHaveBeenLastCalledWith(context, STOCKTAKE_ID, command, payload, 'key');
    }
    const validCommandCallCount = commandSpy.mock.calls.length;
    for (const path of ['save-draft', 'start', 'record-counts', 'submit', 'complete', 'cancel']) {
      const payload = path === 'save-draft' ? STOCKTAKE_DRAFT : path === 'record-counts' ? STOCKTAKE_COUNTS : { expected_version: 1 };
      for (const query of ['force=true', `actor_user_id=${STOCKTAKE_ID}`]) {
        expect((await app.inject({ method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/${path}?${query}`,
          headers: { 'idempotency-key': 'key' }, payload })).statusCode).toBe(400);
      }
    }
    expect(commandSpy).toHaveBeenCalledTimes(validCommandCallCount);
    const invalid: InjectOptions[] = [
      { method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/start`, payload: { expected_version: 1 } },
      { method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/start`, headers: { 'idempotency-key': 'x'.repeat(121) }, payload: { expected_version: 1 } },
      { method: 'POST', url: '/warehouse-stocktakes/bad/start', headers: { 'idempotency-key': 'x' }, payload: { expected_version: 1 } },
      { method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/start`, headers: { 'idempotency-key': 'x' }, payload: { expected_version: 0 } },
      { method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/start`, headers: { 'idempotency-key': 'x' }, payload: { expected_version: 1, actor_user_id: STOCKTAKE_ID } },
      { method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/save-draft`, headers: { 'idempotency-key': 'x' }, payload: { ...STOCKTAKE_DRAFT, cost: '1' } },
      { method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/complete`, headers: { 'idempotency-key': 'x' }, payload: { expected_version: 1, force: true } },
      { method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/record-counts`, headers: { 'idempotency-key': 'x' }, payload: { expected_version: 1, items: [{ supplier_sku_id: STOCKTAKE_ID }] } },
    ];
    for (const request of invalid) expect((await app.inject(request)).statusCode).toBe(400);
    const zero = await app.inject({ method: 'POST', url: `/warehouse-stocktakes/${STOCKTAKE_ID}/record-counts`,
      headers: { 'idempotency-key': 'zero' }, payload: STOCKTAKE_COUNTS });
    expect(zero.statusCode).toBe(200);
    for (const url of ['/warehouse-stocktakes?pageSize=101', '/warehouse-stocktakes?page=0',
      `/warehouse-stocktakes?tenant_id=${STOCKTAKE_ID}`, `/warehouse-stocktakes/${STOCKTAKE_ID}?force=true`,
      `/warehouse-stocktakes/${STOCKTAKE_ID}/items?actor=${STOCKTAKE_ID}`, '/warehouse-stocktakes/settings?x=1']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'DELETE', url: `/warehouse-stocktakes/${STOCKTAKE_ID}` })).statusCode).toBe(404);
  } finally {
    for (const spy of [authSpy, commandSpy, settingsSpy, listSpy, getSpy, itemsSpy]) spy.mockRestore();
    await app.close();
  }
});
