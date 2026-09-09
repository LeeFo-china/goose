import { expect, test } from 'bun:test';
import Fastify from 'fastify';

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
    expect((await app.inject({ method: 'PATCH', url: '/warehouse-stocktakes/10000000-0000-4000-8000-000000000001' })).statusCode).toBe(404);
  } finally { await app.close(); }
});
