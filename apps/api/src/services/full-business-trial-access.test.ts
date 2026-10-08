import 'reflect-metadata';
import { expect, test } from 'bun:test';
import Fastify from 'fastify';
import { PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES, PlatformServiceTrialScopeSchema } from '@gooes/domain';
import { getTenantServiceAuthOptions } from './tenant-service-route-access';


process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';


const examples = [
  ['/employee/marketing-center/campaigns', 'business.marketing'],
  ['/marketing-pages', 'business.marketing'], ['/marketing-leads', 'business.marketing'],
  ['/projects/:id/cost-budgets', 'business.finance'],
  ['/projects/:id/finance-summary', 'business.finance'],
  ['/finance/summary', 'business.finance'], ['/expense-requests', 'business.finance'],
  ['/supplier-payment-requests', 'business.finance'], ['/supplier-products', 'business.procurement'],
  ['/supplier-purchase-orders', 'business.procurement'], ['/catalog/units', 'business.procurement'],
  ['/warehouse-stocktakes', 'business.inventory'], ['/inventory/balances', 'business.inventory'],
  ['/social-video/transcriptions', 'business.content'], ['/tenant/douyin-material-notes', 'business.content'],
  ['/ai/decoration-qa', 'business.ai'], ['/ocr/recognitions', 'business.ai'],
  ['/tenant/system-settings', 'business.settings'], ['/usage/overview', 'business.settings'],
  ['/tenant-devices', 'core.projects'], ['/posts', 'core.employees'],
] as const;

test.each(examples)('full trial enables %s, custom scope and grace still restrict it', async (url, capability) => {
  const { resolveTenantServiceRouteDecision } = await import('./tenant-service-access');
  for (const [method, access] of [['GET','read'],['POST','write']] as const) {
    const options = getTenantServiceAuthOptions({method, routeOptions:{url,config:{tenantServiceAccess:access}}});
    expect(options.requiredCapability).toBe(capability);
    const decide = (mode: 'trial'|'grace'|'service_blocked'|'hard_blocked', capabilities: readonly typeof PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES[number][]) => resolveTenantServiceRouteDecision({mode, routeAccess:access,requiredCapability:options.requiredCapability,capabilities,startsAt:null,endsAt:null});
    expect(decide('trial',PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES).allowed).toBe(true);
    expect(decide('trial',[]).errorCode).toBe('TENANT_SERVICE_CAPABILITY_NOT_INCLUDED');
    expect(decide('grace',PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES).allowed).toBe(access==='read');
    expect(decide('service_blocked',PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES).allowed).toBe(false);
    expect(decide('hard_blocked',PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES).allowed).toBe(false);
  }
});

test('full scope contains explicit modules, never a wildcard or arbitrary API access', () => {
  expect(PLATFORM_SERVICE_TRIAL_CAPABILITY_VALUES).toHaveLength(13);
  expect(PlatformServiceTrialScopeSchema.safeParse({version:1,capabilities:['*']}).success).toBe(false);
  for (const url of ['/platform/tenants','/admin/system-settings','/internal/jobs','/tenant/unregistered-feature']) {
    expect(getTenantServiceAuthOptions({method:'POST',routeOptions:{url}}).requiredCapability).toBeNull();
  }
});

test('every registered tenant business route has a usable full-trial module', async () => {
  const {default:registerRoutes}=await import('@/routes');
  const app=Fastify(); const excluded:string[]=[];
  app.addHook('onRoute',r=>{
    const access=r.config?.tenantServiceAccess;
    if(access!=='read'&&access!=='write')return;
    // These surfaces use dedicated platform, partner, visitor, callback or onboarding authorization.
    if(/^\/(?:admin|auth|internal|platform|partner|partner-onboarding|public|visitor|wechat|tenant-onboarding)(?:\/|$)/.test(r.url))return;
    if(/^\/customer\/wechat-pay\/smoke-test-orders(?:\/|$)/.test(r.url))return;
    const method=Array.isArray(r.method)?r.method[0]!:r.method;
    if(!getTenantServiceAuthOptions({method,routeOptions:{url:r.url,config:r.config}}).requiredCapability)excluded.push(`${method} ${r.url}`);
  });
  try {await app.register(registerRoutes);await app.ready();expect(excluded).toEqual([]);} finally {await app.close();}
});


test('project scope alone cannot authorize project financial operations', () => {
  for (const url of ['/projects/:id/cost-budgets', '/projects/:id/finance-summary']) {
    expect(getTenantServiceAuthOptions({ method: 'GET', routeOptions: { url } }).requiredCapability).toBe('business.finance');
  }
  expect(getTenantServiceAuthOptions({ method: 'GET', routeOptions: { url: '/projects/:id' } }).requiredCapability).toBe('core.projects');
});
