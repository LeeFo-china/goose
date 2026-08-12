import { describe, expect, mock, test } from 'bun:test';

import type { AuthContext } from '@/services/authorization';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const TRIAL_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = '33333333-3333-4333-8333-333333333333';
const authContext = {
  tenantId: null, employeeId: 'platform-employee-1',
  isPlatformStaff: true, isPlatformAdmin: false, isPlatformSuperAdmin: false,
  permissions: [],
} as unknown as AuthContext;

describe('PlatformServiceTrialService follow-ups', () => {
  test('delegates paginated reads, creates, and cancellation to operations', async () => {
    const { PlatformServiceTrialService } = await import('./platform-service-trials');
    const followUp = {
      id: IDEMPOTENCY_KEY, trial_id: TRIAL_ID, tenant_id: TENANT_ID,
      follow_up_type: 'phone' as const, status: 'pending' as const,
      summary: '电话沟通', result: '客户将在内部确认',
      next_follow_up_at: '2026-08-18T02:00:00.000Z',
      created_by_employee_id: '44444444-4444-4444-8444-444444444444',
      created_at: '2026-08-12T02:00:00.000Z', idempotent: false,
    };
    const page = {
      list: [], pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
    };
    const operationsService = {
      listFollowUps: mock(async () => page),
      createFollowUp: mock(async () => followUp),
      cancelFollowUp: mock(async () => ({ ...followUp, status: 'canceled' as const })),
    };
    const service = new PlatformServiceTrialService({ operationsService });
    const query = { page: 2, pageSize: 10, status: 'pending' as const };
    const input = {
      follow_up_type: 'phone' as const, status: 'pending' as const,
      summary: '电话沟通', result: '客户将在内部确认',
      next_follow_up_at: '2026-08-18T02:00:00.000Z',
      idempotency_key: IDEMPOTENCY_KEY,
    };

    await expect(service.listFollowUps(authContext, TRIAL_ID, query))
      .resolves.toEqual(page);
    await expect(service.createFollowUp(authContext, TRIAL_ID, input))
      .resolves.toEqual(followUp);
    await expect(service.cancelFollowUp(
      authContext, TRIAL_ID, followUp.id,
      { status: 'canceled', idempotency_key: IDEMPOTENCY_KEY },
    )).resolves.toMatchObject({ id: followUp.id, status: 'canceled' });
    expect(operationsService.listFollowUps).toHaveBeenCalledWith(
      authContext, TRIAL_ID, query,
    );
    expect(operationsService.createFollowUp).toHaveBeenCalledWith(
      authContext, TRIAL_ID, input,
    );
    expect(operationsService.cancelFollowUp).toHaveBeenCalledWith(
      authContext, TRIAL_ID, followUp.id,
      { status: 'canceled', idempotency_key: IDEMPOTENCY_KEY },
    );
  });
});
