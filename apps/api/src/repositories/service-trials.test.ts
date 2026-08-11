import { beforeAll, describe, expect, test } from 'bun:test';
import { createClient } from '@supabase/supabase-js';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
import type { ServiceTrialClient, TrialPolicyRecord, TrialRecord } from './service-trials';
let ServiceTrialRepository: typeof import('./service-trials').ServiceTrialRepository;
beforeAll(async () => ({ ServiceTrialRepository } = await import('./service-trials')));
type DbResult = { data: unknown; error: unknown; count?: number | null };
type Call = readonly [string, ...unknown[]];
const TRIAL_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_TENANT_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '44444444-4444-4444-8444-444444444444';
const ASSIGNEE_ID = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-08-11T08:00:00.000Z';
const policySnapshot = {
  policy_id: '99999999-9999-4999-8999-999999999999',
  version: 1,
  trial_days: 30,
  grace_days: 7,
  max_trial_days: 60,
  max_grace_days: 14,
  max_schedule_days: 30,
  max_extension_count: 1,
  max_extension_days: 30,
  reapply_cooldown_days: 30,
  allow_repeat: false,
  reminder_days: [7, 3, 1],
};
const pendingTrial = {
  id: TRIAL_ID, tenant_id: TENANT_ID, source: 'tenant_application',
  trial_type: 'standard', status: 'pending_review',
  application_reason: '体验项目协作', expected_user_count: 10,
  expected_project_count: 3, contact_name: '张三', contact_phone: '13800138000',
  grant_reason: null, review_decision: null, review_reason: null,
  revoke_reason: null, withdraw_reason: null,
  requested_at: '2026-08-10T08:00:00.000Z',
  reviewed_at: null, granted_at: null, starts_at: null, activated_at: null,
  trial_ends_at: null, grace_ends_at: null, withdrawn_at: null,
  revoked_at: null, converted_at: null, converted_order_id: null,
  granted_by_employee_id: null, reviewed_by_employee_id: null,
  requested_by_employee_id: ACTOR_ID,
  revoked_by_employee_id: null, withdrawn_by_employee_id: null,
  assignee_employee_id: null,
  scope_snapshot: { version: 1, capabilities: ['core.projects'] },
  policy_snapshot: policySnapshot,
  extension_count: 0, version: 1,
  created_at: '2026-08-10T08:00:00.000Z',
  updated_at: '2026-08-10T08:00:00.000Z',
} satisfies TrialRecord;
const activeTrial = {
  ...pendingTrial, source: 'platform_grant', trial_type: 'guided', status: 'active',
  application_reason: null, expected_user_count: null, expected_project_count: null,
  contact_name: null, contact_phone: null, requested_at: null,
  requested_by_employee_id: null, grant_reason: '重点租户试用',
  granted_at: '2026-08-09T08:00:00.000Z',
  starts_at: '2026-08-10T08:00:00.000Z',
  activated_at: '2026-08-10T08:00:00.000Z',
  trial_ends_at: '2026-09-09T08:00:00.000Z',
  grace_ends_at: '2026-09-16T08:00:00.000Z',
  granted_by_employee_id: ACTOR_ID, assignee_employee_id: ASSIGNEE_ID,
  policy_snapshot: { ...policySnapshot, override_used: false },
} satisfies TrialRecord;
const tenantSummary = { id: TENANT_ID, name: '示例企业', slug: 'example' };
const assigneeSummary = {
  id: ASSIGNEE_ID, name: '平台顾问', phone: '13900139000', status: 'active',
} as const;
const event = {
  id: '77777777-7777-4777-8777-777777777777',
  tenant_id: TENANT_ID, trial_id: TRIAL_ID, event_key: 'trial-granted',
  event_type: 'trial_granted', from_status: null, to_status: 'active',
  reason: '重点租户试用', actor_employee_id: ACTOR_ID, metadata: {},
  occurred_at: '2026-08-10T08:00:00.000Z',
  created_at: '2026-08-10T08:00:00.000Z',
} as const;
const currentPolicy = {
  id: '88888888-8888-4888-8888-888888888888', is_current: true,
  trial_days: 30, grace_days: 7, reminder_days: [7, 3, 1],
  max_trial_days: 60, max_grace_days: 14, max_schedule_days: 30,
  max_extension_count: 1, max_extension_days: 30, reapply_cooldown_days: 30,
  allow_repeat: false,
  standard_scope: { version: 1, capabilities: ['core.projects'] },
  guided_scope: { version: 1, capabilities: ['core.projects', 'core.files'] },
  version: 1, change_reason: null,
  created_at: '2026-08-10T08:00:00.000Z',
  updated_at: '2026-08-10T08:00:00.000Z',
} satisfies TrialPolicyRecord;
function maskedListTrial<T extends object>(row: T): T & {
  contact_name: string | null; contact_phone: string | null;
} {
  const facts = row as Record<string, unknown>;
  const contactName = typeof facts.contact_name === 'string' ? facts.contact_name : null;
  const contactPhone = typeof facts.contact_phone === 'string' ? facts.contact_phone : null;
  const assignee = facts.assignee && typeof facts.assignee === 'object'
    ? { ...facts.assignee as Record<string, unknown>,
      phone: typeof (facts.assignee as { phone?: unknown }).phone === 'string'
        ? '139****9000' : null } : facts.assignee;
  return { ...row, contact_name: contactName ? `${[...contactName][0]}${'*'.repeat(
    Math.max(1, [...contactName].length - 1))}` : null,
  contact_phone: contactPhone ? `${contactPhone.slice(0, 3)}****${contactPhone.slice(-4)}` : null,
  ...('assignee' in row ? { assignee } : {}) } as T & {
    contact_name: string | null; contact_phone: string | null;
  };
}
function harness(input: { tableResult?: DbResult;
  rpcResult?: DbResult | (() => Promise<DbResult>) }) {
  const calls: Call[] = [];
  const result = input.tableResult ?? { data: null, error: null };
  const query = {
    select(columns: string, options?: unknown) { calls.push(['select', columns, options]); return this },
    eq(column: string, value: unknown) { calls.push(['eq', column, value]); return this },
    in(column: string, values: readonly unknown[]) { calls.push(['in', column, values]); return this },
    ilike(column: string, pattern: string) { calls.push(['ilike', column, pattern]); return this },
    or(filter: string) { calls.push(['or', filter]); return this },
    gte(column: string, value: unknown) { calls.push(['gte', column, value]); return this },
    lte(column: string, value: unknown) { calls.push(['lte', column, value]); return this },
    order(column: string, options: unknown) { calls.push(['order', column, options]); return this },
    range(from: number, to: number) { calls.push(['range', from, to]); return this },
    limit(value: number, options?: unknown) { calls.push(['limit', value, options]); return this },
    maybeSingle() { calls.push(['maybeSingle']); return Promise.resolve(result) },
    then<TResult1 = DbResult, TResult2 = never>(
      onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };
  const client = {
    from(table: string) { calls.push(['from', table]); return query },
    rpc(name: string, params: Record<string, unknown>) {
      calls.push(['rpc', name, params]);
      if (typeof input.rpcResult === 'function') return input.rpcResult();
      if (name === 'platform_service_trial_list') {
        if (result.error) return Promise.resolve(result);
        const rows = Array.isArray(result.data) ? result.data : result.data;
        return Promise.resolve({ data: { items: Array.isArray(rows)
          ? rows.map((row) => ({ trial: maskedListTrial(row),
            effective_status: params.p_status ?? row.status })) : rows,
        total: result.count, page: params.p_page, page_size: params.p_page_size,
        server_time: params.p_now }, error: null });
      }
      return Promise.resolve(input.rpcResult ?? { data: null, error: null });
    },
  };
  return { calls, repository: new ServiceTrialRepository(
    () => client as unknown as ServiceTrialClient,
  ) };
}
async function expectDbError(request: Promise<unknown>, message?: string): Promise<void> {
  await expect(request).rejects.toMatchObject({
    statusCode: 500, code: 'DB_ERROR', details: undefined, ...(message ? { message } : {}),
  });
}
describe('ServiceTrialRepository reads', () => {
  test('tenant history is tenant-scoped, bounded, stable, and strictly parsed', async () => {
    const f = harness({
      tableResult: { data: [pendingTrial], error: null, count: 21 },
    });
    const result = await f.repository.listTenantTrials({
      tenantId: TENANT_ID,
      page: 2,
      pageSize: 500,
      status: 'pending_review',
    });
    expect(result.pagination).toEqual({ page: 2, pageSize: 100,
      total: 21, totalPages: 1 });
    expect(result.list).toEqual([maskedListTrial(pendingTrial)]);
    expect(f.calls[0]).toEqual(['rpc', 'platform_service_trial_list',
      expect.objectContaining({ p_tenant_id: TENANT_ID, p_platform: false,
        p_status: 'pending_review', p_page: 2, p_page_size: 100 })]);
  });
  test('tenant history defaults to page 1 and page size 20', async () => {
    const f = harness({ tableResult: { data: [], error: null, count: 0 } });
    await f.repository.listTenantTrials({ tenantId: TENANT_ID });
    expect(f.calls[0]![2]).toMatchObject({ p_page: 1, p_page_size: 20 });
  });
  test('rejects missing, invalid, or insufficient exact pagination counts', async () => {
    const platformRow = { ...activeTrial, tenant: tenantSummary, assignee: assigneeSummary };
    for (const input of [
      { count: null, platform: false, data: [] },
      { count: undefined, platform: true, data: [] },
      { count: -1, platform: false, data: [] },
      { count: 1.5, platform: true, data: [] },
      { count: 0, platform: false, data: [pendingTrial] },
      { count: 0, platform: true, data: [platformRow] },
    ]) {
      const f = harness({ tableResult: { data: input.data, error: null, count: input.count } });
      const request = input.platform ? f.repository.listPlatformTrials({})
        : f.repository.listTenantTrials({ tenantId: TENANT_ID });
      await expectDbError(request);
    }
  });
  test('rejects tenant history rows outside the requested tenant', async () => {
    const f = harness({ tableResult: { data: [{ ...pendingTrial,
      tenant_id: OTHER_TENANT_ID }], error: null, count: 1 } });
    await expectDbError(f.repository.listTenantTrials({ tenantId: TENANT_ID }));
  });
  test('selects and strictly parses the policy snapshot needed for audit facts', async () => {
    const row = { ...pendingTrial, policy_snapshot: policySnapshot };
    const shortTrialRow = { ...row, policy_snapshot: { ...policySnapshot, trial_days: 2 } };
    const f = harness({ tableResult: { data: [row, shortTrialRow], error: null, count: 2 } });
    expect((await f.repository.listTenantTrials({ tenantId: TENANT_ID })).list)
      .toEqual([maskedListTrial(row), maskedListTrial(shortTrialRow)]);
    const malformed = harness({ tableResult: { data: [{ ...row,
      policy_snapshot: { ...policySnapshot, reminder_days: [3, 7, 3] },
    }], error: null, count: 1 } });
    await expectDbError(malformed.repository.listTenantTrials({ tenantId: TENANT_ID }));
  });
  test('current tenant trial only considers attributable statuses and one row', async () => {
    const f = harness({ tableResult: { data: pendingTrial, error: null } });
    expect(await f.repository.findCurrentTenantTrial(TENANT_ID)).toEqual(pendingTrial);
    expect(f.calls).toContainEqual(['eq', 'tenant_id', TENANT_ID]);
    expect(f.calls).toContainEqual(['in', 'status',
      ['pending_review', 'scheduled', 'active', 'grace_period']]);
    expect(f.calls).toContainEqual(['limit', 1, undefined]);
    expect(f.calls).toContainEqual(['maybeSingle']);
  });

  test('rejects a current trial outside the requested tenant or attributable statuses', async () => {
    for (const data of [
      { ...pendingTrial, tenant_id: OTHER_TENANT_ID },
      { ...pendingTrial, status: 'withdrawn', withdrawn_at: NOW,
        withdrawn_by_employee_id: ACTOR_ID, withdraw_reason: '已撤回' },
    ]) {
      const f = harness({ tableResult: { data, error: null } });
      await expectDbError(f.repository.findCurrentTenantTrial(TENANT_ID));
    }
  });

  test('platform list exposes tenant and assignee in one query with safe keyword syntax', async () => {
    const row = { ...activeTrial, tenant: tenantSummary, assignee: assigneeSummary };
    const f = harness({ tableResult: { data: [row], error: null, count: 1 } });
    const result = await f.repository.listPlatformTrials({
      keyword: '张三,()"\\%_', status: 'active', source: 'platform_grant',
      trialType: 'guided', assigneeEmployeeId: ASSIGNEE_ID,
      appliedFrom: '2026-08-01T00:00:00.000Z',
      appliedTo: '2026-08-31T23:59:59.000Z',
      expiresFrom: '2026-09-01T00:00:00.000Z',
      expiresTo: '2026-09-30T23:59:59.000Z',
    });

    expect(result.list).toEqual([maskedListTrial(row)]);
    expect(f.calls).toEqual([['rpc', 'platform_service_trial_list',
      expect.objectContaining({ p_platform: true, p_keyword: '张三,()"\\%_',
        p_status: 'active', p_source: 'platform_grant', p_trial_type: 'guided',
        p_assignee_employee_id: ASSIGNEE_ID })]]);
  });

  test('sends literal keyword characters only as an RPC JSON parameter', async () => {
    const requests: Request[] = [];
    const fetchStub = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const request = input instanceof Request
        ? input
        : new Request(input.toString(), init);
      requests.push(request);
      return new Response(JSON.stringify({ items: [], total: 0, page: 1,
        page_size: 20, server_time: NOW }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-range': '*/0' },
      });
    }) as typeof fetch;
    const client = createClient('http://127.0.0.1:54321', 'test-key', {
      global: { fetch: fetchStub },
    });
    const repository = new ServiceTrialRepository(
      () => client as unknown as ServiceTrialClient,
    );

    await repository.listPlatformTrials({ keyword: 'a,()"%_' + '\\', nowIso: NOW });
    expect(new URL(requests[0]!.url).pathname).toEndWith('/rpc/platform_service_trial_list');
    expect(JSON.parse(await requests[0]!.clone().text()).p_keyword).toBe('a,()"%_' + '\\');
  });

  test('rejects inconsistent or malformed list relations without leaking data', async () => {
    const row = { ...activeTrial,
      tenant: { ...tenantSummary, id: OTHER_TENANT_ID }, assignee: assigneeSummary };
    const f = harness({ tableResult: { data: [row], error: null, count: 1 } });
    await expectDbError(f.repository.listPlatformTrials({}), '查询平台技术服务试用列表失败');
  });

  test('uses database-compatible strict tenant and assignee relation facts', async () => {
    const nullableStatusRow = { ...activeTrial, tenant: tenantSummary,
      assignee: { ...assigneeSummary, status: null } };
    const valid = harness({ tableResult: {
      data: [nullableStatusRow], error: null, count: 1,
    } });
    expect((await valid.repository.listPlatformTrials({})).list)
      .toEqual([maskedListTrial(nullableStatusRow)]);

    for (const row of [
      { ...activeTrial, tenant: { ...tenantSummary, name: null },
        assignee: assigneeSummary },
      { ...activeTrial, tenant: { ...tenantSummary, slug: null },
        assignee: assigneeSummary },
      { ...activeTrial, tenant: tenantSummary,
        assignee: { ...assigneeSummary, status: 'deleted' } },
    ]) {
      const invalid = harness({ tableResult: { data: [row], error: null, count: 1 } });
      await expectDbError(invalid.repository.listPlatformTrials({}));
    }
  });

  test('rejects platform list rows that contradict requested filters', async () => {
    const row = { ...activeTrial, tenant: tenantSummary, assignee: assigneeSummary };
    for (const input of [
      { source: 'tenant_application' as const },
      { trialType: 'standard' as const },
      { assigneeEmployeeId: ACTOR_ID },
    ]) {
      const f = harness({ tableResult: { data: [row], error: null, count: 1 } });
      await expectDbError(f.repository.listPlatformTrials(input));
    }
  });

  const convertedOrderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const tenantApplicationActive = {
    ...activeTrial, source: 'tenant_application',
    application_reason: '体验项目协作', expected_user_count: 10,
    expected_project_count: 3, contact_name: '张三', contact_phone: '13800138000',
    requested_at: NOW, requested_by_employee_id: ACTOR_ID,
  };
  test.each([
    { ...pendingTrial, status: 'rejected', review_decision: 'rejected',
      review_reason: '不符合条件', reviewed_at: NOW,
      reviewed_by_employee_id: ACTOR_ID, starts_at: NOW },
    { ...pendingTrial, converted_order_id: convertedOrderId },
    { ...pendingTrial, status: 'rejected', review_decision: 'rejected',
      reviewed_at: NOW, reviewed_by_employee_id: ACTOR_ID,
      review_reason: '不通过', granted_at: NOW },
    tenantApplicationActive,
    { ...pendingTrial, withdrawn_at: NOW,
      withdrawn_by_employee_id: ACTOR_ID, withdraw_reason: '撤回' },
    { ...pendingTrial, review_decision: 'approved', reviewed_at: NOW,
      reviewed_by_employee_id: null, review_reason: '通过' },
    { ...pendingTrial, source: 'platform_grant', status: 'converted',
      application_reason: null, expected_user_count: null, expected_project_count: null,
      contact_name: null, contact_phone: null, requested_at: null,
      requested_by_employee_id: null,
      converted_order_id: convertedOrderId, converted_at: NOW },
    { ...pendingTrial, status: 'converted', review_decision: 'approved',
      reviewed_at: NOW, reviewed_by_employee_id: ACTOR_ID, review_reason: '通过',
      converted_order_id: convertedOrderId, converted_at: NOW },
    { ...pendingTrial, policy_snapshot: { ...policySnapshot, override_used: false } },
    { ...activeTrial, policy_snapshot: policySnapshot },
  ])('rejects partial or status-contradictory lifecycle facts', async (row) => {
    const f = harness({ tableResult: { data: [row], error: null, count: 1 } });
    await expectDbError(f.repository.listTenantTrials({ tenantId: TENANT_ID }));
  });

  test('accepts conversion attribution on legal terminal trial facts', async () => {
    const conversion = { converted_order_id: convertedOrderId, converted_at: NOW };
    const rows = [
      { ...pendingTrial, status: 'converted', ...conversion },
      { ...activeTrial, status: 'converted', ...conversion },
      { ...activeTrial, source: 'tenant_application', status: 'converted',
        application_reason: '体验项目协作', expected_user_count: 10,
        expected_project_count: 3, contact_name: '张三', contact_phone: '13800138000',
        requested_at: NOW, requested_by_employee_id: ACTOR_ID, review_decision: 'approved',
        reviewed_at: NOW,
        reviewed_by_employee_id: ACTOR_ID, review_reason: '通过', ...conversion },
      { ...pendingTrial, status: 'rejected', review_decision: 'rejected',
        reviewed_at: NOW, reviewed_by_employee_id: ACTOR_ID,
        review_reason: '不通过', ...conversion },
      { ...pendingTrial, status: 'withdrawn', withdrawn_at: NOW,
        withdrawn_by_employee_id: ACTOR_ID, withdraw_reason: '撤回', ...conversion },
      { ...activeTrial, status: 'revoked', revoked_at: NOW,
        revoked_by_employee_id: ACTOR_ID, revoke_reason: '撤销', ...conversion },
    ] satisfies TrialRecord[];
    const f = harness({ tableResult: { data: rows, error: null, count: 6 } });
    expect((await f.repository.listTenantTrials({ tenantId: TENANT_ID })).list)
      .toEqual(rows.map((row) => maskedListTrial(row)));
  });

  test('summary uses one exact RPC call and strictly parses the envelope', async () => {
    const summary = { pending_review_count: 2, scheduled_count: 1,
      current_active_count: 3, expiring_within_7_days_count: 1,
      month_new_count: 5, month_approved_count: 4, month_converted_count: 2,
      application_approval_rate: 0.8, activated_cohort_conversion_rate: 0.4,
      server_time: NOW };
    const f = harness({ rpcResult: { data: summary, error: null } });
    expect(await f.repository.getPlatformSummary(NOW)).toEqual(summary);
    expect(f.calls).toEqual([
      ['rpc', 'platform_service_trial_platform_summary', { p_now: NOW }],
    ]);

    const malformed = harness({
      rpcResult: { data: { ...summary, secret: 'must-not-pass' }, error: null },
    });
    await expectDbError(malformed.repository.getPlatformSummary(NOW));
  });

  test('binds summary server time to the requested instant', async () => {
    const summary = {
      pending_review_count: 0, scheduled_count: 0, current_active_count: 0,
      expiring_within_7_days_count: 0, month_new_count: 0,
      month_approved_count: 0, month_converted_count: 0,
      application_approval_rate: 0, activated_cohort_conversion_rate: 0,
      server_time: '2026-08-11T16:00:00+08:00',
    };
    const equivalent = harness({ rpcResult: { data: summary, error: null } });
    expect(await equivalent.repository.getPlatformSummary(NOW)).toEqual(summary);

    const mismatch = harness({ rpcResult: { data: {
      ...summary, server_time: '2026-08-11T16:00:01+08:00',
    }, error: null } });
    await expectDbError(mismatch.repository.getPlatformSummary(NOW));
  });

  test('detail fetches trial, summaries, and bounded ordered events once', async () => {
    const detail = { ...activeTrial, tenant: tenantSummary,
      assignee: assigneeSummary, events: [event] };
    const f = harness({ tableResult: { data: detail, error: null } });
    expect(await f.repository.findTrialById({ id: TRIAL_ID, tenantId: TENANT_ID })).toEqual(detail);
    expect(f.calls.filter((call) => call[0] === 'from')).toHaveLength(1);
    expect(f.calls).toContainEqual(['eq', 'id', TRIAL_ID]);
    expect(f.calls).toContainEqual(['eq', 'tenant_id', TENANT_ID]);
    expect(f.calls).toContainEqual(['order', 'occurred_at',
      { ascending: false, referencedTable: 'events' }]);
    expect(f.calls).toContainEqual(['order', 'id',
      { ascending: false, referencedTable: 'events' }]);
    expect(f.calls).toContainEqual(['limit', 100, { referencedTable: 'events' }]);
    expect(f.calls).toContainEqual(['maybeSingle']);
  });

  test('detail rejects event aggregate binding violations', async () => {
    const f = harness({ tableResult: { data: { ...activeTrial,
      tenant: tenantSummary, assignee: assigneeSummary,
      events: [{ ...event, tenant_id: OTHER_TENANT_ID }] }, error: null } });
    await expectDbError(f.repository.findTrialById({ id: TRIAL_ID }));
  });

  test('binds detail identity to requested id and optional tenant', async () => {
    const detail = { ...activeTrial, tenant: tenantSummary,
      assignee: assigneeSummary, events: [event] };
    for (const input of [
      { id: OTHER_TENANT_ID },
      { id: TRIAL_ID, tenantId: OTHER_TENANT_ID },
    ]) {
      const f = harness({ tableResult: { data: detail, error: null } });
      await expectDbError(f.repository.findTrialById(input));
    }
  });

  test('reads and validates only the current policy row', async () => {
    const f = harness({ tableResult: { data: currentPolicy, error: null } });
    expect(await f.repository.findCurrentPolicy()).toEqual(currentPolicy);
    expect(f.calls).toContainEqual(['from', 'platform_service_trial_policies']);
    expect(f.calls).toContainEqual(['eq', 'is_current', true]);
    expect(f.calls).toContainEqual(['limit', 1, undefined]);
    expect(f.calls).toContainEqual(['maybeSingle']);
    expect(String(f.calls.find((call) => call[0] === 'select')?.[1])).not.toContain('*');
  });

  test('reads one historical policy by the command result identity', async () => {
    const historical = { ...currentPolicy, is_current: false as const };
    const f = harness({ tableResult: { data: historical, error: null } });
    expect(await f.repository.findPolicyById(historical.id)).toEqual(historical);
    expect(f.calls).toContainEqual(['eq', 'id', historical.id]);
    expect(f.calls).toContainEqual(['limit', 1, undefined]);
    expect(f.calls).not.toContainEqual(['eq', 'is_current', true]);
  });

  test('rejects inconsistent current policy reminder facts', async () => {
    const policy = { ...currentPolicy, trial_days: 5, reminder_days: [3, 7, 3] };
    const f = harness({ tableResult: { data: policy, error: null } });
    await expectDbError(f.repository.findCurrentPolicy());
  });

  test('wraps returned and rejected read failures without raw details', async () => {
    const returned = harness({
      tableResult: { data: null, error: { message: 'secret db detail' } },
    });
    const returnedError = await returned.repository.findCurrentTenantTrial(TENANT_ID)
      .catch((error: unknown) => error);
    expect(returnedError).toMatchObject({
      statusCode: 500,
      code: 'DB_ERROR',
      details: undefined,
    });
    expect(String(returnedError)).not.toContain('secret db detail');

    const rejected = harness({
      rpcResult: () => Promise.reject({ message: 'network secret' }),
    });
    const rejectedError = await rejected.repository.getPlatformSummary(NOW)
      .catch((error: unknown) => error);
    expect(rejectedError).toMatchObject({
      statusCode: 500,
      code: 'DB_ERROR',
      details: undefined,
    });
    expect(String(rejectedError)).not.toContain('network secret');
  });
});
