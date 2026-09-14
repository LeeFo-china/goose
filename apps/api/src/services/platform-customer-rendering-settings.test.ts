import { beforeAll, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Service: typeof import('./platform-customer-rendering-settings').PlatformCustomerRenderingSettingsService;
beforeAll(async () => {
  ({ PlatformCustomerRenderingSettingsService: Service } = await import('./platform-customer-rendering-settings'));
});

const tenantId = '11111111-1111-4111-8111-111111111111';
const auth = { employeeId: '33333333-3333-4333-8333-333333333333', isPlatformSuperAdmin: true };
const update = { enabled: false, daily_task_limit: 2, daily_budget_fen: 200,
  per_job_reserve_fen: 100, expected_version: 0, reason: '试点配置准备' };
const setting = { tenant_id: tenantId, enabled: false, daily_task_limit: 2,
  daily_budget_fen: 200, per_job_reserve_fen: 100, version: 1,
  updated_at: '2026-09-14T03:00:00Z' };

test('missing setting reads as disabled and update derives operator from session', async () => {
  const get = mock(async () => ({ tenantExists: true, setting: null }));
  const save = mock(async () => ({ decision: 'updated' as const, setting }));
  const service = new Service({ get, getDailyUsage: async () => ({ budget_date: '2026-09-14',
    task_count: 0, budget_used_fen: 0 }), save });
  expect(await service.get(auth, tenantId)).toEqual({ tenant_id: tenantId, enabled: false,
    daily_task_limit: null, daily_budget_fen: null, per_job_reserve_fen: null,
    version: 0, updated_at: null });
  expect(await service.update(auth, tenantId, update)).toEqual(setting);
  expect(save).toHaveBeenCalledWith({ tenantId, ...update, operatorEmployeeId: auth.employeeId });
});

test('settings service rejects non-superadmin and maps missing tenant or stale version', async () => {
  const get = mock(async () => ({ tenantExists: false, setting: null }));
  const save = mock(async () => ({ decision: 'stale' as const }));
  const getDailyUsage = async () => ({ budget_date: '2026-09-14',
    task_count: 0, budget_used_fen: 0 });
  const service = new Service({ get, getDailyUsage, save });
  for (const context of [{ ...auth, isPlatformSuperAdmin: false },
    { ...auth, employeeId: 'forged' }]) {
    await expect(service.update(context, tenantId, update)).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(save).not.toHaveBeenCalled();
  await expect(service.get(auth, tenantId)).rejects.toMatchObject({ statusCode: 404 });
  await expect(service.update(auth, tenantId, update)).rejects.toMatchObject({ statusCode: 409 });
  const missing = new Service({ get, getDailyUsage,
    save: async () => ({ decision: 'not_found' }) });
  await expect(missing.update(auth, tenantId, update)).rejects.toMatchObject({ statusCode: 404 });
  const inactive = new Service({ get, save: async () => ({ decision: 'tenant_inactive' }) } as never);
  await expect(inactive.update(auth, tenantId, { ...update, enabled: true }))
    .rejects.toMatchObject({ statusCode: 409, code: 'RENDERING_SETTINGS_TENANT_INACTIVE' });
});

test('daily usage requires a real superadmin and an existing tenant', async () => {
  const usage = { budget_date: '2026-09-14', task_count: 2, budget_used_fen: 80 };
  const get = mock(async () => ({ tenantExists: true, setting: null }));
  const getDailyUsage = mock(async () => usage);
  const service = new Service({ get, getDailyUsage, save: async () => ({ decision: 'stale' }) });
  await expect(service.getDailyUsage({ ...auth, isPlatformSuperAdmin: false }, tenantId))
    .rejects.toMatchObject({ statusCode: 403 });
  expect(get).not.toHaveBeenCalled();
  expect(getDailyUsage).not.toHaveBeenCalled();
  expect(await service.getDailyUsage(auth, tenantId)).toEqual(usage);
  expect(getDailyUsage).toHaveBeenCalledWith(tenantId);

  const missing = new Service({ get: async () => ({ tenantExists: false, setting: null }),
    getDailyUsage, save: async () => ({ decision: 'stale' }) });
  await expect(missing.getDailyUsage(auth, tenantId)).rejects.toMatchObject({ statusCode: 404 });
  expect(getDailyUsage).toHaveBeenCalledTimes(1);
});
