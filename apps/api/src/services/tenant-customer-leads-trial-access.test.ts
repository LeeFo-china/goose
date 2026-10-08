import 'reflect-metadata';
import { expect, test } from 'bun:test';
import Fastify from 'fastify';
import { getTenantServiceAuthOptions } from './tenant-service-route-access';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';

test('all registered customer lead routes respect customer trial scope and the read-only grace period', async () => {
  const { resolveTenantServiceRouteDecision } = await import('./tenant-service-access');
  const { TenantCustomerLeadsController } = await import('@/controllers/tenant-customer-leads');
  const app = Fastify();
  const routes: Array<{ method: string; url: string; config: { tenantServiceAccess?: unknown } }> = [];
  app.addHook('onRoute', route => {
    for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
      routes.push({ method, url: route.url, config: route.config ?? {} });
    }
  });
  try {
    new TenantCustomerLeadsController().registerExtraRoutes(app);
    await app.ready();
    expect(routes.filter(r => r.method !== 'HEAD')).toHaveLength(10);
    for (const route of routes) {
      const options = getTenantServiceAuthOptions({ method: route.method, routeOptions: route });
      expect(options.requiredCapability).toBe('core.customers');
      const read = ['GET', 'HEAD'].includes(route.method);
      expect(options.tenantServiceAccess).toBe(read ? 'read' : 'write');
      const decide = (mode: 'trial' | 'grace' | 'service_blocked', included = true) => resolveTenantServiceRouteDecision({
        mode, routeAccess: options.tenantServiceAccess, requiredCapability: options.requiredCapability,
        capabilities: included ? ['core.customers'] : ['core.projects'], startsAt: null, endsAt: null,
      });
      expect(decide('trial').allowed).toBe(true);
      expect(decide('trial', false).errorCode).toBe('TENANT_SERVICE_CAPABILITY_NOT_INCLUDED');
      expect(decide('grace')).toMatchObject({ allowed: read, accessLevel: 'read_only',
        errorCode: read ? null : 'TENANT_SERVICE_READ_ONLY' });
      expect(decide('service_blocked').errorCode).toBe('TENANT_SERVICE_ACCESS_EXPIRED');
    }
  } finally { await app.close(); }
});

test('mapping does not expand unrelated tenant modules or similarly named routes', () => {
  for (const url of ['/tenant/douyin-leads',
    '/tenant/customer-leads-export', '/tenant/customer-leadss']) {
    expect(getTenantServiceAuthOptions({ method: 'GET', routeOptions: { url } }).requiredCapability).toBeNull();
  }
});
