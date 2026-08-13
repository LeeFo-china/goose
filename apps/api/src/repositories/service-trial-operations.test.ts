import { describe, expect, mock, test } from 'bun:test';
import type { ServiceTrialOperationsClient } from './service-trial-operations';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const TRIAL_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE_ID = '33333333-3333-4333-8333-333333333333';
const FOLLOW_UP_ID = '44444444-4444-4444-8444-444444444444';
const DELIVERY_ID = '55555555-5555-4555-8555-555555555555';
const LEASE_TOKEN = '66666666-6666-4666-8666-666666666666';
const KEY = '77777777-7777-4777-8777-777777777777';

const followUp = {
  id: FOLLOW_UP_ID, trial_id: TRIAL_ID, tenant_id: TENANT_ID,
  follow_up_type: 'phone', status: 'pending', summary: '已电话沟通',
  result: '等待客户确认', next_follow_up_at: '2026-08-20T00:00:00.000Z',
  created_by_employee_id: EMPLOYEE_ID, created_at: '2026-08-12T00:00:00.000Z',
} as const;
const claim = {
  delivery_id: DELIVERY_ID, lease_token: LEASE_TOKEN, trial_id: TRIAL_ID,
  tenant_id: TENANT_ID, recipient_employee_id: EMPLOYEE_ID,
  event_type: 'expires_in_7_days', source: 'time_boundary',
  trial_status: 'active', starts_at: '2026-08-01T00:00:00.000Z',
  trial_ends_at: '2026-08-20T00:00:00.000Z',
  grace_ends_at: '2026-08-27T00:00:00.000Z',
} as const;

type QueryResult = { data: unknown; error: unknown; count?: number | null };

class Query {
  calls: unknown[][] = [];
  constructor(private result: unknown) {}
  select(...args: unknown[]) { this.calls.push(['select', ...args]); return this; }
  eq(...args: unknown[]) { this.calls.push(['eq', ...args]); return this; }
  order(...args: unknown[]) { this.calls.push(['order', ...args]); return this; }
  range(...args: unknown[]) { this.calls.push(['range', ...args]); return this; }
  maybeSingle() { this.calls.push(['maybeSingle']); return Promise.resolve(this.result); }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result as QueryResult).then(onfulfilled, onrejected);
  }
}

async function loadRepository(input: { fromResult?: unknown; rpc?: (name: string,
  params: Record<string, unknown>) => Promise<unknown> } = {}) {
  const query = new Query(input.fromResult ?? { data: [followUp], error: null, count: 1 });
  const rpc = mock(input.rpc ?? (async (name: string) => ({
    data: name.includes('claim_') ? [claim]
      : name.includes('complete_') ? {
        delivery_id: DELIVERY_ID, status: 'sent', notification_id: null,
        sent_at: '2026-08-12T00:00:00.000Z', idempotent: false,
      } : name.includes('fail_') ? {
        delivery_id: DELIVERY_ID, status: 'failed', attempt_count: 1,
        retry_at: '2026-08-12T00:01:00.000Z', idempotent: false,
      } : name.includes('cancel_') ? { ...followUp, status: 'canceled', idempotent: false }
        : { ...followUp, idempotent: false }, error: null,
  })));
  const module = await import('./service-trial-operations');
  const client = { from: () => query, rpc } as unknown as ServiceTrialOperationsClient;
  return { repository: new module.ServiceTrialOperationsRepository(() => client), query, rpc };
}

describe('ServiceTrialOperationsRepository', () => {
  test('lists tenant-bound follow-ups with exact pagination and stable ordering', async () => {
    const { repository, query } = await loadRepository();
    const result = await repository.listFollowUps({
      trialId: TRIAL_ID, tenantId: TENANT_ID, page: 2, pageSize: 20,
    });
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 1, totalPages: 1 });
    expect(result.list).toEqual([followUp]);
    expect(query.calls).toContainEqual(['eq', 'trial_id', TRIAL_ID]);
    expect(query.calls).toContainEqual(['eq', 'tenant_id', TENANT_ID]);
    expect(query.calls).toContainEqual(['order', 'created_at', { ascending: false }]);
    expect(query.calls).toContainEqual(['order', 'id', { ascending: false }]);
    expect(query.calls).toContainEqual(['range', 20, 39]);
  });

  test('fails closed on cross-tenant rows and malformed exact counts', async () => {
    const crossTenant = { ...followUp, tenant_id: '88888888-8888-4888-8888-888888888888' };
    const { repository } = await loadRepository({
      fromResult: { data: [crossTenant], error: null, count: 0 },
    });
    await expect(repository.listFollowUps({
      trialId: TRIAL_ID, tenantId: TENANT_ID, page: 1, pageSize: 20,
    })).rejects.toMatchObject({ code: 'DB_ERROR', details: undefined });
  });

  test('uses exact create and cancel RPC arguments', async () => {
    const { repository, rpc } = await loadRepository();
    await repository.createFollowUp({
      actorEmployeeId: EMPLOYEE_ID, trialId: TRIAL_ID, tenantId: TENANT_ID,
      followUpType: 'phone', status: 'pending', summary: '已电话沟通',
      result: '等待客户确认', nextFollowUpAt: followUp.next_follow_up_at,
      idempotencyKey: KEY,
    });
    await repository.cancelFollowUp({
      actorEmployeeId: EMPLOYEE_ID, followUpId: FOLLOW_UP_ID,
      trialId: TRIAL_ID, tenantId: TENANT_ID, idempotencyKey: KEY,
    });
    expect(rpc.mock.calls[0]).toEqual(['platform_service_trial_create_follow_up', {
      p_actor_employee_id: EMPLOYEE_ID, p_trial_id: TRIAL_ID,
      p_tenant_id: TENANT_ID, p_follow_up_type: 'phone', p_status: 'pending',
      p_summary: '已电话沟通', p_result: '等待客户确认',
      p_next_follow_up_at: followUp.next_follow_up_at, p_idempotency_key: KEY,
    }]);
    expect(rpc.mock.calls[1]?.[0]).toBe('platform_service_trial_cancel_follow_up');
  });

  test('strictly parses claims and delivery completion facts', async () => {
    const { repository, rpc } = await loadRepository();
    expect(await repository.claimNotificationDeliveries(10)).toEqual([claim]);
    await repository.completeNotificationDelivery({
      deliveryId: DELIVERY_ID, leaseToken: LEASE_TOKEN, notificationId: null,
    });
    await repository.failNotificationDelivery({
      deliveryId: DELIVERY_ID, leaseToken: LEASE_TOKEN, errorCode: 'send_failed',
    });
    expect(rpc.mock.calls.map((item) => item[0])).toEqual([
      'platform_service_trial_claim_notification_deliveries',
      'platform_service_trial_complete_notification_delivery',
      'platform_service_trial_fail_notification_delivery',
    ]);
  });

  test('finds an existing notification by delivery identity for crash-safe replay', async () => {
    const notificationId = '99999999-9999-4999-8999-999999999999';
    const { repository, query } = await loadRepository({
      fromResult: { data: { id: notificationId }, error: null },
    });
    expect(await repository.findNotificationIdForDelivery({
      deliveryId: DELIVERY_ID, recipientEmployeeId: EMPLOYEE_ID,
    })).toBe(notificationId);
    expect(query.calls).toContainEqual(['eq', 'target_type', 'service_trial_delivery']);
    expect(query.calls).toContainEqual(['eq', 'target_id', DELIVERY_ID]);
    expect(query.calls).toContainEqual(['eq', 'recipient_employee_id', EMPLOYEE_ID]);
  });

  test('redacts raw RPC errors and rejects malformed claim bindings', async () => {
    const sentinel = 'RAW_POSTGREST_SECRET';
    const malformed = { ...claim, tenant_id: 'not-a-uuid' };
    const { repository } = await loadRepository({ rpc: async (name) => ({
      data: name.includes('claim_') ? [malformed] : null,
      error: name.includes('claim_') ? null : { message: sentinel },
    }) });
    await expect(repository.claimNotificationDeliveries(10)).rejects
      .toMatchObject({ code: 'DB_ERROR', details: undefined });
    await expect(repository.createFollowUp({
      actorEmployeeId: EMPLOYEE_ID, trialId: TRIAL_ID, tenantId: TENANT_ID,
      followUpType: 'phone', status: 'completed', summary: 'a', result: 'b',
      nextFollowUpAt: null, idempotencyKey: KEY,
    })).rejects.toMatchObject({ code: 'DB_ERROR', details: undefined });
  });
});
