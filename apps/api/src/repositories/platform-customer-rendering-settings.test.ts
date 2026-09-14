import { beforeAll, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Repository: typeof import('./platform-customer-rendering-settings').PlatformCustomerRenderingSettingsRepository;
beforeAll(async () => {
  ({ PlatformCustomerRenderingSettingsRepository: Repository } = await import('./platform-customer-rendering-settings'));
});

const tenantId = '11111111-1111-4111-8111-111111111111';
const setting = { tenant_id: tenantId, enabled: false, daily_task_limit: 2,
  daily_budget_fen: 200, per_job_reserve_fen: 100, version: 1,
  updated_at: '2026-09-14T03:00:00Z' };

test('repository reads a scoped setting and distinguishes unconfigured tenants', async () => {
  const calls: string[] = [];
  const client = { from(table: string) {
    calls.push(table);
    return { select(columns: string) {
      expect(columns).not.toBe('*');
      return { eq(column: string, value: string) {
        expect(column).toBe('tenant_id');
        expect(value).toBe(tenantId);
        return { maybeSingle: async () => ({ data: setting, error: null }) };
      } };
    } };
  } };
  const repo = new Repository(client as never);
  expect(await repo.get(tenantId)).toEqual({ tenantExists: true, setting });
  expect(calls).toEqual(['tenant_customer_rendering_settings']);

  const missingClient = { from(table: string) {
    return { select() { return { eq(column: string, value: string) {
      expect(column).toBe(table === 'tenants' ? 'id' : 'tenant_id');
      expect(value).toBe(tenantId);
      return { maybeSingle: async () => ({ data: table === 'tenants' ? { id: tenantId } : null,
        error: null }) };
    } }; } };
  } };
  expect(await new Repository(missingClient as never).get(tenantId)).toEqual({ tenantExists: true,
    setting: null });
});

test('repository sends one privileged atomic command and rejects malformed result', async () => {
  const rpc = mock(async () => ({ data: { decision: 'updated', setting }, error: null }));
  const repo = new Repository({ rpc } as never);
  const command = { tenantId, enabled: false, daily_task_limit: 2,
    daily_budget_fen: 200, per_job_reserve_fen: 100, expected_version: 0,
    reason: '试点配置准备', operatorEmployeeId: '33333333-3333-4333-8333-333333333333' };
  expect(await repo.save(command)).toEqual({ decision: 'updated', setting });
  expect(rpc).toHaveBeenCalledWith('set_tenant_customer_rendering_settings', {
    p_tenant_id: tenantId, p_enabled: false, p_daily_task_limit: 2,
    p_daily_budget_fen: 200, p_per_job_reserve_fen: 100,
    p_expected_version: 0, p_reason: command.reason,
    p_operator_employee_id: command.operatorEmployeeId,
  });
  await expect(new Repository({ rpc: async () => ({ data: { decision: 'updated', setting: {
    ...setting, enabled: true } }, error: null }) } as never).save(command))
    .resolves.toMatchObject({ decision: 'updated' });
  await expect(new Repository({ rpc: async () => ({ data: { decision: 'updated' }, error: null }) } as never)
    .save(command)).rejects.toMatchObject({ statusCode: 500 });
});

test('repository reads one tenant-scoped daily usage aggregate and rejects malformed output', async () => {
  const usage = { budget_date: '2026-09-14', task_count: 2, budget_used_fen: 80 };
  const rpc = mock(async () => ({ data: usage, error: null }));
  const repo = new Repository({ rpc } as never);
  expect(await repo.getDailyUsage(tenantId)).toEqual(usage);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('get_tenant_customer_rendering_daily_usage', {
    p_tenant_id: tenantId,
  });
  await expect(new Repository({ rpc: async () => ({ data: { ...usage, task_count: -1 },
    error: null }) } as never).getDailyUsage(tenantId)).rejects.toMatchObject({ statusCode: 500 });
});
