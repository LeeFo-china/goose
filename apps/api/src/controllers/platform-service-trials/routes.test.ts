import { beforeEach, describe, expect, mock, test } from 'bun:test';
import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const TRIAL_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = '33333333-3333-4333-8333-333333333333';
const authContext = { tenantId: null, employeeId: 'platform-employee-1' };
const serviceMethods = {
  listTrials: mock(async () => ({ list: [], pagination: {} })),
  getSummary: mock(async () => ({ pending_review_count: 1 })),
  listAssigneeCandidates: mock(async () => ({
    list: [], pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
  })),
  getTrial: mock(async () => ({ trial: { id: TRIAL_ID } })),
  grant: mock(async () => ({ trial: { id: TRIAL_ID }, idempotent: false })),
  review: mock(async () => ({ trial: { id: TRIAL_ID, status: 'active' } })),
  extend: mock(async () => ({ trial: { id: TRIAL_ID, version: 2 } })),
  revoke: mock(async () => ({ trial: { id: TRIAL_ID, status: 'revoked' } })),
  assign: mock(async () => ({ trial: { id: TRIAL_ID } })),
  listFollowUps: mock(async () => ({
    list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  createFollowUp: mock(async () => ({ id: IDEMPOTENCY_KEY, trial_id: TRIAL_ID })),
  cancelFollowUp: mock(async () => ({
    id: IDEMPOTENCY_KEY, trial_id: TRIAL_ID, status: 'canceled',
  })),
  getPolicy: mock(async () => ({ policy: { version: 1 } })),
  updatePolicy: mock(async () => ({ policy: { version: 2 } })),
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
    put: register('PUT'),
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

describe('PlatformServiceTrialsController routes', () => {
  test('registers the fourteen platform routes with explicit metadata', async () => {
    const routes = registeredRoutes(await loadController());

    expect(routes.map(({ method, path, tenantServiceAccess }) => ({
      method,
      path,
      tenantServiceAccess,
    }))).toEqual([
      { method: 'GET', path: '/platform/billing/service-trials', tenantServiceAccess: 'read' },
      { method: 'GET', path: '/platform/billing/service-trials/summary', tenantServiceAccess: 'read' },
      { method: 'GET', path: '/platform/billing/service-trials/assignee-candidates', tenantServiceAccess: 'read' },
      { method: 'GET', path: '/platform/billing/service-trials/:id', tenantServiceAccess: 'read' },
      { method: 'POST', path: '/platform/billing/service-trials', tenantServiceAccess: 'write' },
      { method: 'POST', path: '/platform/billing/service-trials/:id/review', tenantServiceAccess: 'write' },
      { method: 'POST', path: '/platform/billing/service-trials/:id/extend', tenantServiceAccess: 'write' },
      { method: 'POST', path: '/platform/billing/service-trials/:id/revoke', tenantServiceAccess: 'write' },
      { method: 'POST', path: '/platform/billing/service-trials/:id/assign', tenantServiceAccess: 'write' },
      { method: 'GET', path: '/platform/billing/service-trials/:id/follow-ups', tenantServiceAccess: 'read' },
      { method: 'POST', path: '/platform/billing/service-trials/:id/follow-ups', tenantServiceAccess: 'write' },
      { method: 'POST', path: '/platform/billing/service-trials/:id/follow-ups/:followUpId/cancel', tenantServiceAccess: 'write' },
      { method: 'GET', path: '/platform/billing/service-trial-policy', tenantServiceAccess: 'read' },
      { method: 'PUT', path: '/platform/billing/service-trial-policy', tenantServiceAccess: 'write' },
    ]);
  });

  test('uses request-aware staff context, parses every route, delegates, and wraps', async () => {
    const [{ platformServiceTrialService }, controller] = await Promise.all([
      import('@/services/platform-service-trials'),
      loadController(),
    ]);
    const originals = Object.fromEntries(Object.keys(serviceMethods).map(
      (name) => [name, Reflect.get(platformServiceTrialService, name)],
    ));
    const originalAuth = Reflect.get(controller, 'getRequiredPlatformStaffContext');
    const requireContext = mock(async () => authContext);
    replaceMethod(controller, 'getRequiredPlatformStaffContext', requireContext);
    for (const [name, method] of Object.entries(serviceMethods)) {
      replaceMethod(platformServiceTrialService, name, method);
    }
    const routes = registeredRoutes(controller);
    const grantBody = {
      tenant_id: TENANT_ID,
      trial_type: 'standard',
      reason: '目标客户评估',
      idempotency_key: IDEMPOTENCY_KEY,
    };
    const reviewBody = {
      decision: 'rejected',
      expected_version: 1,
      reason: '暂不符合条件',
      idempotency_key: IDEMPOTENCY_KEY,
    };
    const extendBody = {
      extension_days: 7,
      expected_version: 1,
      reason: '延长评估',
      idempotency_key: IDEMPOTENCY_KEY,
    };
    const revokeBody = {
      expected_version: 1,
      reason: '提前终止',
      idempotency_key: IDEMPOTENCY_KEY,
    };
    const assignBody = {
      assignee_employee_id: null,
      expected_version: 1,
      idempotency_key: IDEMPOTENCY_KEY,
    };
    const followUpBody = {
      follow_up_type: 'phone', status: 'pending', summary: '电话沟通',
      result: '客户将在内部确认', next_follow_up_at: '2026-08-18T02:00:00.000Z',
      idempotency_key: IDEMPOTENCY_KEY,
    };
    const policyBody = {
      default_trial_days: 30,
      default_grace_days: 7,
      max_trial_days: 60,
      max_grace_days: 14,
      max_schedule_ahead_days: 30,
      max_extension_count: 1,
      max_extension_days: 30,
      reminder_days: [7, 3, 1],
      reapply_cooldown_days: 30,
      allow_repeat_application: false,
      standard_scope: { version: 1, capabilities: ['core.projects'] },
      guided_scope: { version: 1, capabilities: ['core.projects'] },
      expected_version: 1,
      idempotency_key: IDEMPOTENCY_KEY,
      reason: '更新规则',
    };
    const calls = [
      ['GET /platform/billing/service-trials', { query: { page: '2', pageSize: '10', trialType: 'guided' } }],
      ['GET /platform/billing/service-trials/summary', {}],
      ['GET /platform/billing/service-trials/assignee-candidates', {
        query: { page: '2', pageSize: '10', keyword: '运营', includeEmployeeId: TRIAL_ID },
      }],
      ['GET /platform/billing/service-trials/:id', { params: { id: TRIAL_ID } }],
      ['POST /platform/billing/service-trials', { body: grantBody }],
      ['POST /platform/billing/service-trials/:id/review', { params: { id: TRIAL_ID }, body: reviewBody }],
      ['POST /platform/billing/service-trials/:id/extend', { params: { id: TRIAL_ID }, body: extendBody }],
      ['POST /platform/billing/service-trials/:id/revoke', { params: { id: TRIAL_ID }, body: revokeBody }],
      ['POST /platform/billing/service-trials/:id/assign', { params: { id: TRIAL_ID }, body: assignBody }],
      ['GET /platform/billing/service-trials/:id/follow-ups', {
        params: { id: TRIAL_ID }, query: { page: '2', pageSize: '10', status: 'pending' },
      }],
      ['POST /platform/billing/service-trials/:id/follow-ups', {
        params: { id: TRIAL_ID }, body: followUpBody,
      }],
      ['POST /platform/billing/service-trials/:id/follow-ups/:followUpId/cancel', {
        params: { id: TRIAL_ID, followUpId: IDEMPOTENCY_KEY },
        body: { status: 'canceled', idempotency_key: IDEMPOTENCY_KEY },
      }],
      ['GET /platform/billing/service-trial-policy', {}],
      ['PUT /platform/billing/service-trial-policy', { body: policyBody }],
    ] as const;

    try {
      const responses = [];
      for (const [route, request] of calls) {
        responses.push(await requiredHandler(routes, route)(
          request as unknown as FastifyRequest,
          {},
        ));
      }

      expect(serviceMethods.listTrials).toHaveBeenCalledWith(authContext, {
        page: 2,
        pageSize: 10,
        trialType: 'guided',
      });
      expect(serviceMethods.getSummary).toHaveBeenCalledWith(authContext);
      expect(serviceMethods.listAssigneeCandidates).toHaveBeenCalledWith(authContext, {
        page: 2, pageSize: 10, keyword: '运营', includeEmployeeId: TRIAL_ID,
      });
      expect(serviceMethods.getTrial).toHaveBeenCalledWith(authContext, TRIAL_ID);
      expect(serviceMethods.grant).toHaveBeenCalledWith(authContext, grantBody);
      expect(serviceMethods.review).toHaveBeenCalledWith(authContext, TRIAL_ID, reviewBody);
      expect(serviceMethods.extend).toHaveBeenCalledWith(authContext, TRIAL_ID, extendBody);
      expect(serviceMethods.revoke).toHaveBeenCalledWith(authContext, TRIAL_ID, revokeBody);
      expect(serviceMethods.assign).toHaveBeenCalledWith(authContext, TRIAL_ID, assignBody);
      expect(serviceMethods.listFollowUps).toHaveBeenCalledWith(authContext, TRIAL_ID, {
        page: 2, pageSize: 10, status: 'pending',
      });
      expect(serviceMethods.createFollowUp).toHaveBeenCalledWith(
        authContext, TRIAL_ID, followUpBody,
      );
      expect(serviceMethods.cancelFollowUp).toHaveBeenCalledWith(
        authContext, TRIAL_ID, IDEMPOTENCY_KEY,
        { status: 'canceled', idempotency_key: IDEMPOTENCY_KEY },
      );
      expect(serviceMethods.getPolicy).toHaveBeenCalledWith(authContext);
      expect(serviceMethods.updatePolicy).toHaveBeenCalledWith(authContext, policyBody);
      expect(requireContext).toHaveBeenCalledTimes(14);
      calls.forEach(([, request], index) => {
        expect(requireContext).toHaveBeenNthCalledWith(index + 1, request);
      });
      expect(responses.every((response) => response.message === 'success')).toBe(true);
      expect(responses.map((response) => response.data)).toEqual([
        { list: [], pagination: {} },
        { pending_review_count: 1 },
        { list: [], pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 } },
        { trial: { id: TRIAL_ID } },
        { trial: { id: TRIAL_ID }, idempotent: false },
        { trial: { id: TRIAL_ID, status: 'active' } },
        { trial: { id: TRIAL_ID, version: 2 } },
        { trial: { id: TRIAL_ID, status: 'revoked' } },
        { trial: { id: TRIAL_ID } },
        { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
        { id: IDEMPOTENCY_KEY, trial_id: TRIAL_ID },
        { id: IDEMPOTENCY_KEY, trial_id: TRIAL_ID, status: 'canceled' },
        { policy: { version: 1 } },
        { policy: { version: 2 } },
      ]);
    } finally {
      replaceMethod(controller, 'getRequiredPlatformStaffContext', originalAuth);
      for (const [name, method] of Object.entries(originals)) {
        replaceMethod(platformServiceTrialService, name, method);
      }
    }
  });

  test('dispatches static reads, detail, and policy routes through real Fastify', async () => {
    const [{ platformServiceTrialService }, controller] = await Promise.all([
      import('@/services/platform-service-trials'),
      loadController(),
    ]);
    const originals = Object.fromEntries(Object.keys(serviceMethods).map(
      (name) => [name, Reflect.get(platformServiceTrialService, name)],
    ));
    const originalAuth = Reflect.get(controller, 'getRequiredPlatformStaffContext');
    replaceMethod(
      controller,
      'getRequiredPlatformStaffContext',
      mock(async () => authContext),
    );
    for (const [name, method] of Object.entries(serviceMethods)) {
      replaceMethod(platformServiceTrialService, name, method);
    }
    const app = Fastify();
    controller.registerExtraRoutes(app);
    const policyBody = {
      default_trial_days: 30,
      default_grace_days: 7,
      max_trial_days: 60,
      max_grace_days: 14,
      max_schedule_ahead_days: 30,
      max_extension_count: 1,
      max_extension_days: 30,
      reminder_days: [7, 3, 1],
      reapply_cooldown_days: 30,
      allow_repeat_application: false,
      standard_scope: { version: 1, capabilities: ['core.projects'] },
      guided_scope: { version: 1, capabilities: ['core.projects'] },
      expected_version: 1,
      idempotency_key: IDEMPOTENCY_KEY,
      reason: '更新规则',
    };

    try {
      const summary = await app.inject({
        method: 'GET',
        url: '/platform/billing/service-trials/summary',
      });
      const candidates = await app.inject({
        method: 'GET',
        url: `/platform/billing/service-trials/assignee-candidates?page=2&pageSize=10&includeEmployeeId=${TRIAL_ID}`,
      });
      const detail = await app.inject({
        method: 'GET',
        url: `/platform/billing/service-trials/${TRIAL_ID}`,
      });
      const policy = await app.inject({
        method: 'GET',
        url: '/platform/billing/service-trial-policy',
      });
      const updatePolicy = await app.inject({
        method: 'PUT',
        url: '/platform/billing/service-trial-policy',
        payload: policyBody,
      });

      expect(summary.statusCode).toBe(200);
      expect(summary.json().data).toEqual({ pending_review_count: 1 });
      expect(candidates.statusCode).toBe(200);
      expect(candidates.json().data).toEqual({
        list: [], pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().data).toEqual({ trial: { id: TRIAL_ID } });
      expect(policy.statusCode).toBe(200);
      expect(policy.json().data).toEqual({ policy: { version: 1 } });
      expect(updatePolicy.statusCode).toBe(200);
      expect(updatePolicy.json().data).toEqual({ policy: { version: 2 } });
      expect(serviceMethods.getSummary).toHaveBeenCalledWith(authContext);
      expect(serviceMethods.listAssigneeCandidates).toHaveBeenCalledWith(authContext, {
        page: 2, pageSize: 10, includeEmployeeId: TRIAL_ID,
      });
      expect(serviceMethods.getTrial).toHaveBeenCalledWith(authContext, TRIAL_ID);
      expect(serviceMethods.getPolicy).toHaveBeenCalledWith(authContext);
      expect(serviceMethods.updatePolicy).toHaveBeenCalledWith(
        authContext,
        policyBody,
      );
    } finally {
      await app.close();
      replaceMethod(controller, 'getRequiredPlatformStaffContext', originalAuth);
      for (const [name, method] of Object.entries(originals)) {
        replaceMethod(platformServiceTrialService, name, method);
      }
    }
  });

  test('rejects each invalid schema before platform service delegation', async () => {
    const [{ platformServiceTrialService }, controller] = await Promise.all([
      import('@/services/platform-service-trials'),
      loadController(),
    ]);
    const originals = Object.fromEntries(Object.keys(serviceMethods).map(
      (name) => [name, Reflect.get(platformServiceTrialService, name)],
    ));
    const originalAuth = Reflect.get(controller, 'getRequiredPlatformStaffContext');
    replaceMethod(controller, 'getRequiredPlatformStaffContext', mock(async () => authContext));
    for (const [name, method] of Object.entries(serviceMethods)) {
      replaceMethod(platformServiceTrialService, name, method);
    }
    const routes = registeredRoutes(controller);
    const invalidRequests = [
      ['GET /platform/billing/service-trials', { query: { pageSize: '101' } }],
      ['GET /platform/billing/service-trials/assignee-candidates', {
        query: { pageSize: '101', unknown: 'rejected' },
      }],
      ['GET /platform/billing/service-trials/:id', { params: { id: 'bad-id' } }],
      ['POST /platform/billing/service-trials', { body: {} }],
      ['POST /platform/billing/service-trials/:id/review', { params: { id: TRIAL_ID }, body: { decision: 'maybe' } }],
      ['POST /platform/billing/service-trials/:id/extend', { params: { id: TRIAL_ID }, body: { extension_days: 0 } }],
      ['POST /platform/billing/service-trials/:id/revoke', { params: { id: TRIAL_ID }, body: { reason: ' ' } }],
      ['POST /platform/billing/service-trials/:id/assign', { params: { id: TRIAL_ID }, body: { assignee_employee_id: 'bad-id' } }],
      ['GET /platform/billing/service-trials/:id/follow-ups', {
        params: { id: TRIAL_ID }, query: { pageSize: '101' },
      }],
      ['POST /platform/billing/service-trials/:id/follow-ups', {
        params: { id: TRIAL_ID }, body: { follow_up_type: 'phone', summary: ' ', result: '结果' },
      }],
      ['POST /platform/billing/service-trials/:id/follow-ups/:followUpId/cancel', {
        params: { id: TRIAL_ID, followUpId: 'bad-id' },
        body: { status: 'canceled', idempotency_key: IDEMPOTENCY_KEY },
      }],
      ['PUT /platform/billing/service-trial-policy', { body: {} }],
      ['POST /platform/billing/service-trials/:id/review', {
        params: { id: 'bad-id' },
        body: {
          decision: 'rejected', expected_version: 1,
          reason: '拒绝', idempotency_key: IDEMPOTENCY_KEY,
        },
      }],
      ['POST /platform/billing/service-trials/:id/extend', {
        params: { id: 'bad-id' },
        body: {
          extension_days: 7, expected_version: 1,
          reason: '延期', idempotency_key: IDEMPOTENCY_KEY,
        },
      }],
      ['POST /platform/billing/service-trials/:id/revoke', {
        params: { id: 'bad-id' },
        body: {
          expected_version: 1, reason: '撤销',
          idempotency_key: IDEMPOTENCY_KEY,
        },
      }],
      ['POST /platform/billing/service-trials/:id/assign', {
        params: { id: 'bad-id' },
        body: {
          assignee_employee_id: null, expected_version: 1,
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
      replaceMethod(controller, 'getRequiredPlatformStaffContext', originalAuth);
      for (const [name, method] of Object.entries(originals)) {
        replaceMethod(platformServiceTrialService, name, method);
      }
    }
  });

  test('registers once and leaves AND permission enforcement in the service', async () => {
    const [routeIndex, source] = await Promise.all([
      Bun.file(new URL('../../routes/index.ts', import.meta.url)).text(),
      Bun.file(new URL('./index.ts', import.meta.url)).text(),
    ]);

    expect(routeIndex.match(/import PlatformServiceTrialsController /g)).toHaveLength(1);
    expect(routeIndex.match(/PlatformServiceTrialsController\.registerExtraRoutes\(app\)/g)).toHaveLength(1);
    expect(source).toContain('extends PlatformBaseController');
    expect(source.match(/getRequiredPlatformStaffContext\(request\)/g)).toHaveLength(14);
    expect(source).not.toContain('getRequiredPlatformPermissionContext');
    expect(source.match(/ResponseHandler\.success/g)).toHaveLength(14);
    expect(source).not.toContain('throw new Error');
    expect(source).not.toContain('.from(');
    expect(source).not.toContain('.rpc(');
  });
});
