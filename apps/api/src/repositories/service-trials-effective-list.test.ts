import { beforeAll, describe, expect, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

import type { ServiceTrialClient, TrialRecord } from './service-trials';

let ServiceTrialRepository: typeof import('./service-trials').ServiceTrialRepository;
beforeAll(async () => ({ ServiceTrialRepository } = await import('./service-trials')));

const NOW = '2026-08-11T08:00:00.000Z';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';
const TRIAL_ID = '11111111-1111-4111-8111-111111111111';
const policy = { policy_id: '99999999-9999-4999-8999-999999999999', version: 1,
  trial_days: 30, grace_days: 7, max_trial_days: 60, max_grace_days: 14,
  max_schedule_days: 30, max_extension_count: 1, max_extension_days: 30,
  reapply_cooldown_days: 30, allow_repeat: false, reminder_days: [7, 3, 1],
  override_used: false };
const scheduled = { id: TRIAL_ID, tenant_id: TENANT_ID, source: 'platform_grant',
  trial_type: 'standard', status: 'scheduled', application_reason: null,
  expected_user_count: null, expected_project_count: null, contact_name: null,
  contact_phone: null, grant_reason: '评估', review_decision: null,
  review_reason: null, revoke_reason: null, withdraw_reason: null,
  requested_at: null, reviewed_at: null, granted_at: '2026-08-10T00:00:00.000Z',
  starts_at: '2026-08-11T07:00:00.000Z', activated_at: null,
  trial_ends_at: '2026-09-10T07:00:00.000Z',
  grace_ends_at: '2026-09-17T07:00:00.000Z', withdrawn_at: null,
  revoked_at: null, converted_at: null, converted_order_id: null,
  granted_by_employee_id: ACTOR_ID, reviewed_by_employee_id: null,
  requested_by_employee_id: null, revoked_by_employee_id: null,
  withdrawn_by_employee_id: null, assignee_employee_id: null,
  scope_snapshot: { version: 1, capabilities: ['core.projects'] },
  policy_snapshot: policy, extension_count: 0, version: 1,
  created_at: '2026-08-10T00:00:00.000Z',
  updated_at: '2026-08-10T00:00:00.000Z' } satisfies TrialRecord;

function harness(data: unknown) {
  const calls: Array<readonly [string, ...unknown[]]> = [];
  const client = { from() { throw new Error('platform list must use one RPC') },
    rpc(name: string, params: Record<string, unknown>) {
      calls.push(['rpc', name, params]);
      return Promise.resolve({ data, error: null });
    } };
  return { calls, repository: new ServiceTrialRepository(
    () => client as unknown as ServiceTrialClient) };
}

describe('ServiceTrialRepository effective-status list RPC', () => {
  test('binds platform filters, exact pagination and effective status in one RPC', async () => {
    const row = { ...scheduled, tenant: { id: TENANT_ID, name: '示例企业', slug: 'example' },
      assignee: null };
    const f = harness({ items: [{ trial: row, effective_status: 'active' }],
      total: 21, page: 2, page_size: 10, server_time: NOW });
    const result = await f.repository.listPlatformTrials({ page: 2, pageSize: 10,
      keyword: 'A%_,()', status: 'active', source: 'platform_grant',
      trialType: 'standard', appliedFrom: NOW, nowIso: NOW });
    expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 21, totalPages: 3 });
    expect(result.list).toEqual([row]);
    expect(f.calls).toEqual([['rpc', 'platform_service_trial_list', {
      p_tenant_id: null, p_platform: true, p_page: 2, p_page_size: 10,
      p_keyword: 'A%_,()', p_status: 'active', p_source: 'platform_grant',
      p_trial_type: 'standard', p_assignee_employee_id: null,
      p_applied_from: NOW, p_applied_to: null, p_expires_from: null,
      p_expires_to: null, p_now: NOW,
    }]]);
  });

  test('uses the same tenant-bounded RPC without platform relations', async () => {
    const f = harness({ items: [{ trial: scheduled, effective_status: 'active' }],
      total: 1, page: 1, page_size: 20, server_time: NOW });
    expect((await f.repository.listTenantTrials({ tenantId: TENANT_ID,
      status: 'active', nowIso: NOW })).list).toEqual([scheduled]);
    expect(f.calls[0]![2]).toMatchObject({ p_tenant_id: TENANT_ID,
      p_platform: false, p_status: 'active', p_now: NOW });
  });

  test('rejects mismatched effective status, time and surplus envelope facts', async () => {
    for (const data of [
      { items: [{ trial: scheduled, effective_status: 'expired' }], total: 1,
        page: 1, page_size: 20, server_time: NOW },
      { items: [{ trial: scheduled, effective_status: 'active' }], total: 1,
        page: 1, page_size: 20, server_time: '2026-08-12T08:00:00.000Z' },
      { items: [{ trial: scheduled, effective_status: 'active' }], total: 1,
        page: 1, page_size: 20, server_time: NOW, leak: 'raw' },
    ]) {
      const f = harness(data);
      await expect(f.repository.listTenantTrials({ tenantId: TENANT_ID,
        status: 'active', nowIso: NOW })).rejects.toMatchObject({ code: 'DB_ERROR' });
    }
  });
});
