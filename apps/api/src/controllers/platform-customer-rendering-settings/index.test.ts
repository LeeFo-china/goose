import { beforeAll, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Controller: typeof import('.').PlatformCustomerRenderingSettingsController;
beforeAll(async () => {
  ({ PlatformCustomerRenderingSettingsController: Controller } = await import('.'));
});

const tenantId = '11111111-1111-4111-8111-111111111111';
const auth = { employeeId: '33333333-3333-4333-8333-333333333333', isPlatformSuperAdmin: true };
const setting = { tenant_id: tenantId, enabled: false, daily_task_limit: 2,
  daily_budget_fen: 200, per_job_reserve_fen: 100, version: 1,
  updated_at: '2026-09-14T03:00:00Z' };
const body = { enabled: false, daily_task_limit: 2, daily_budget_fen: 200,
  per_job_reserve_fen: 100, expected_version: 0, reason: '试点配置准备' };

test('registers owner-independent superadmin read and explicit update routes', async () => {
  const service = { get: mock(async () => setting), update: mock(async () => setting) };
  const controller = new Controller(service);
  const routes: Array<{ method: string; path: string }> = [];
  controller.registerExtraRoutes({
    get: (path: string) => routes.push({ method: 'GET', path }),
    put: (path: string) => routes.push({ method: 'PUT', path }),
  } as never);
  expect(routes).toEqual([
    { method: 'GET', path: '/platform/customer-rendering-settings/:tenantId' },
    { method: 'PUT', path: '/platform/customer-rendering-settings/:tenantId' },
  ]);
  const requireSuperAdmin = mock(async () => auth);
  Reflect.set(controller, 'getRequiredPlatformSuperAdminContext', requireSuperAdmin);
  const request = { params: { tenantId }, query: {}, body } as never;
  expect(await controller.getSettings(request)).toEqual({ data: setting, message: 'success' });
  expect(await controller.putSettings(request)).toEqual({ data: setting, message: 'success' });
  expect(service.update).toHaveBeenCalledWith(auth, tenantId, body);
  expect(requireSuperAdmin).toHaveBeenCalledTimes(2);
});

test('main route registry installs the settings controller', () => {
  const registry = readFileSync(new URL('../../routes/index.ts', import.meta.url), 'utf8');
  expect(registry).toContain('import PlatformCustomerRenderingSettingsController from');
  expect(registry).toContain('PlatformCustomerRenderingSettingsController.registerExtraRoutes(app);');
});

test('settings route rejects forged actor, invalid budget and unauthenticated write', async () => {
  const service = { get: mock(async () => setting), update: mock(async () => setting) };
  const controller = new Controller(service);
  Reflect.set(controller, 'getRequiredPlatformSuperAdminContext', async () => auth);
  const params = { tenantId };
  for (const invalid of [{ ...body, operator_employee_id: auth.employeeId },
    { ...body, per_job_reserve_fen: 201 }, { ...body, enabled: undefined }]) {
    await expect(controller.putSettings({ params, query: {}, body: invalid } as never))
      .rejects.toMatchObject({ statusCode: 400 });
  }
  expect(service.update).not.toHaveBeenCalled();
  Reflect.set(controller, 'getRequiredPlatformSuperAdminContext', async () => {
    throw { statusCode: 403, code: 'PLATFORM_SUPER_ADMIN_REQUIRED' };
  });
  await expect(controller.putSettings({ params, query: {}, body } as never))
    .rejects.toMatchObject({ statusCode: 403 });
  expect(service.update).not.toHaveBeenCalled();
});
