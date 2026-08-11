import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { FastifyRequest } from 'fastify';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const TRIAL_ID = '11111111-1111-4111-8111-111111111111';
const IDEMPOTENCY_KEY = '22222222-2222-4222-8222-222222222222';
const authContext = { tenantId: 'tenant-1', employeeId: 'employee-1' };
const serviceMethods = {
  listTrials: mock(async () => ({ list: [], pagination: {} })),
  getCurrentTrial: mock(async () => ({ trial: null })),
  getTrial: mock(async () => ({ trial: { id: TRIAL_ID } })),
  apply: mock(async () => ({ trial: { id: TRIAL_ID }, idempotent: false })),
  withdraw: mock(async () => ({
    trial: { id: TRIAL_ID, status: 'withdrawn' },
    idempotent: false,
  })),
};

type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<{ data: unknown; message: string }>;

type RegisteredRoute = {
  method: string;
  path: string;
  tenantServiceAccess: unknown;
  handler: RouteHandler;
};

async function loadController() {
  const modulePath = `./${'index'}`;
  return (await import(modulePath)).default;
}

function registeredRoutes(controller: {
  registerExtraRoutes(fastify: unknown): void;
}): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  const register = (method: string) => (
    path: string,
    options: { config?: { tenantServiceAccess?: unknown } },
    handler: RouteHandler,
  ) => routes.push({
    method,
    path,
    tenantServiceAccess: options.config?.tenantServiceAccess,
    handler,
  });
  controller.registerExtraRoutes({
    get: register('GET'),
    post: register('POST'),
  });
  return routes;
}

function requiredHandler(routes: RegisteredRoute[], route: string) {
  const found = routes.find(({ method, path }) => `${method} ${path}` === route);
  if (!found) throw new TypeError(`missing route handler: ${route}`);
  return found.handler;
}

function replaceMethod(target: object, method: string, value: unknown) {
  Reflect.set(target, method, value);
}

beforeEach(() => {
  for (const method of Object.values(serviceMethods)) method.mockClear();
});

describe('BillingServiceTrialsController routes', () => {
  test('registers the five tenant routes with exact access metadata', async () => {
    const routes = registeredRoutes(await loadController());

    expect(routes.map(({ method, path, tenantServiceAccess }) => ({
      method,
      path,
      tenantServiceAccess,
    }))).toEqual([
      { method: 'GET', path: '/billing/service-trials', tenantServiceAccess: 'read' },
      { method: 'GET', path: '/billing/service-trials/current', tenantServiceAccess: 'read' },
      { method: 'GET', path: '/billing/service-trials/applications/:id', tenantServiceAccess: 'read' },
      { method: 'POST', path: '/billing/service-trials/applications', tenantServiceAccess: 'recovery' },
      { method: 'POST', path: '/billing/service-trials/applications/:id/withdraw', tenantServiceAccess: 'recovery' },
    ]);
  });

  test('parses requests, propagates tenant context, delegates, and wraps responses', async () => {
    const [{ tenantServiceTrialService }, controller] = await Promise.all([
      import('@/services/tenant-service-trials'),
      loadController(),
    ]);
    const originals = Object.fromEntries(Object.keys(serviceMethods).map(
      (name) => [name, Reflect.get(tenantServiceTrialService, name)],
    ));
    const originalAuth = Reflect.get(controller, 'getRequiredTenantContext');
    const requireContext = mock(async () => authContext);
    replaceMethod(controller, 'getRequiredTenantContext', requireContext);
    for (const [name, method] of Object.entries(serviceMethods)) {
      replaceMethod(tenantServiceTrialService, name, method);
    }
    const routes = registeredRoutes(controller);
    const requests = [
      { query: { page: '2', pageSize: '10', status: 'pending_review' } },
      {},
      { params: { id: TRIAL_ID } },
      {
        body: {
          application_reason: '评估协作能力',
          expected_user_count: 8,
          expected_project_count: 3,
          contact_name: '张经理',
          contact_phone: '13800138000',
          idempotency_key: IDEMPOTENCY_KEY,
        },
      },
      {
        params: { id: TRIAL_ID },
        body: {
          expected_version: 1,
          reason: '申请信息需要修改',
          idempotency_key: IDEMPOTENCY_KEY,
        },
      },
    ] as const;

    try {
      const responses = await Promise.all([
        requiredHandler(routes, 'GET /billing/service-trials')(requests[0] as FastifyRequest, {}),
        requiredHandler(routes, 'GET /billing/service-trials/current')(requests[1] as FastifyRequest, {}),
        requiredHandler(routes, 'GET /billing/service-trials/applications/:id')(requests[2] as FastifyRequest, {}),
        requiredHandler(routes, 'POST /billing/service-trials/applications')(requests[3] as FastifyRequest, {}),
        requiredHandler(routes, 'POST /billing/service-trials/applications/:id/withdraw')(requests[4] as FastifyRequest, {}),
      ]);

      expect(serviceMethods.listTrials).toHaveBeenCalledWith(authContext, {
        page: 2,
        pageSize: 10,
        status: 'pending_review',
      });
      expect(serviceMethods.getCurrentTrial).toHaveBeenCalledWith(authContext);
      expect(serviceMethods.getTrial).toHaveBeenCalledWith(authContext, TRIAL_ID);
      expect(serviceMethods.apply).toHaveBeenCalledWith(authContext, requests[3].body);
      expect(serviceMethods.withdraw).toHaveBeenCalledWith(
        authContext,
        TRIAL_ID,
        requests[4].body,
      );
      expect(requireContext).toHaveBeenCalledTimes(5);
      requests.forEach((request, index) => {
        expect(requireContext).toHaveBeenNthCalledWith(index + 1, request);
      });
      expect(responses).toEqual([
        { data: { list: [], pagination: {} }, message: 'success' },
        { data: { trial: null }, message: 'success' },
        { data: { trial: { id: TRIAL_ID } }, message: 'success' },
        { data: { trial: { id: TRIAL_ID }, idempotent: false }, message: 'success' },
        {
          data: {
            trial: { id: TRIAL_ID, status: 'withdrawn' },
            idempotent: false,
          },
          message: 'success',
        },
      ]);
    } finally {
      replaceMethod(controller, 'getRequiredTenantContext', originalAuth);
      for (const [name, method] of Object.entries(originals)) {
        replaceMethod(tenantServiceTrialService, name, method);
      }
    }
  });

  test('rejects invalid query, params, and bodies before service delegation', async () => {
    const [{ tenantServiceTrialService }, controller] = await Promise.all([
      import('@/services/tenant-service-trials'),
      loadController(),
    ]);
    const originals = Object.fromEntries(Object.keys(serviceMethods).map(
      (name) => [name, Reflect.get(tenantServiceTrialService, name)],
    ));
    const originalAuth = Reflect.get(controller, 'getRequiredTenantContext');
    replaceMethod(controller, 'getRequiredTenantContext', mock(async () => authContext));
    for (const [name, method] of Object.entries(serviceMethods)) {
      replaceMethod(tenantServiceTrialService, name, method);
    }
    const routes = registeredRoutes(controller);
    const invalidRequests = [
      ['GET /billing/service-trials', { query: { pageSize: '101' } }],
      ['GET /billing/service-trials/applications/:id', { params: { id: 'bad-id' } }],
      ['POST /billing/service-trials/applications', {
        body: {
          application_reason: '评估',
          expected_user_count: 8,
          expected_project_count: 3,
          contact_name: '张经理',
          contact_phone: 'invalid',
          idempotency_key: IDEMPOTENCY_KEY,
        },
      }],
      ['POST /billing/service-trials/applications/:id/withdraw', {
        params: { id: TRIAL_ID },
        body: {
          expected_version: 0,
          reason: '修改',
          idempotency_key: IDEMPOTENCY_KEY,
        },
      }],
      ['POST /billing/service-trials/applications/:id/withdraw', {
        params: { id: 'bad-id' },
        body: {
          expected_version: 1,
          reason: '修改',
          idempotency_key: IDEMPOTENCY_KEY,
        },
      }],
    ] as const;

    try {
      for (const [route, request] of invalidRequests) {
        await expect(requiredHandler(routes, route)(
          request as unknown as FastifyRequest,
          {},
        )).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
      }
      for (const method of Object.values(serviceMethods)) {
        expect(method).not.toHaveBeenCalled();
      }
    } finally {
      replaceMethod(controller, 'getRequiredTenantContext', originalAuth);
      for (const [name, method] of Object.entries(originals)) {
        replaceMethod(tenantServiceTrialService, name, method);
      }
    }
  });

  test('registers once and keeps controller inside its HTTP boundary', async () => {
    const [routeIndex, source] = await Promise.all([
      Bun.file(new URL('../../routes/index.ts', import.meta.url)).text(),
      Bun.file(new URL('./index.ts', import.meta.url)).text(),
    ]);

    expect(routeIndex.match(/import BillingServiceTrialsController /g)).toHaveLength(1);
    expect(routeIndex.match(/BillingServiceTrialsController\.registerExtraRoutes\(app\)/g)).toHaveLength(1);
    expect(source).toContain('extends TenantBaseController');
    expect(source.match(/ResponseHandler\.success/g)).toHaveLength(5);
    expect(source).not.toContain('throw new Error');
    expect(source).not.toContain('.from(');
    expect(source).not.toContain('.rpc(');
  });
});
