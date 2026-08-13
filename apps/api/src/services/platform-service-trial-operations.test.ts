import { describe, expect, mock, test } from 'bun:test';
import type { ServiceTrialNotificationEvent } from '@gooes/domain';
import type { ServiceTrialFollowUpRecord } from '@/repositories/service-trial-operations';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const TRIAL_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const EMPLOYEE_ID = '33333333-3333-4333-8333-333333333333';
const FOLLOW_UP_ID = '44444444-4444-4444-8444-444444444444';
const DELIVERY_A = '55555555-5555-4555-8555-555555555555';
const DELIVERY_B = '66666666-6666-4666-8666-666666666666';
const LEASE = '77777777-7777-4777-8777-777777777777';
const KEY = '88888888-8888-4888-8888-888888888888';

const auth = (permissions: string[]) => ({
  authUserId: 'auth', employeeId: EMPLOYEE_ID, tenantId: null,
  tenantName: null, tenantSlug: null, tenantStatus: null,
  isPlatformAdmin: false, isPlatformStaff: true, isPlatformSuperAdmin: false,
  employeeName: '运营', employeeStatus: 'active', departmentId: null,
  tenantDepartmentId: null, departmentCode: null, departmentName: null,
  postId: null, postName: null, avatar: null, roleCodes: [], roles: [],
  permissions: permissions.map((code) => ({ code, scope: 'all' as const })),
});
type TrialStub = { id: string; tenant_id: string; trial_type: string };
type FollowUpStub = ServiceTrialFollowUpRecord & { idempotent: boolean };
const trial: TrialStub = { id: TRIAL_ID, tenant_id: TENANT_ID, trial_type: 'standard' };
const followUp: FollowUpStub = {
  id: FOLLOW_UP_ID, trial_id: TRIAL_ID, tenant_id: TENANT_ID,
  follow_up_type: 'phone', status: 'completed', summary: '完成沟通',
  result: '客户确认', next_follow_up_at: null,
  created_by_employee_id: EMPLOYEE_ID, created_at: '2026-08-12T00:00:00.000Z',
  idempotent: false,
};
const claim = (deliveryId: string, eventType: ServiceTrialNotificationEvent) => ({
  delivery_id: deliveryId, lease_token: LEASE, trial_id: TRIAL_ID,
  tenant_id: TENANT_ID, recipient_employee_id: EMPLOYEE_ID,
  event_type: eventType, source: 'time_boundary', trial_status: 'active',
  starts_at: '2026-08-01T00:00:00.000Z',
  trial_ends_at: '2026-08-20T00:00:00.000Z',
  grace_ends_at: '2026-08-27T00:00:00.000Z',
} as const);

async function createService(options: { notifyFailure?: boolean } = {}) {
  const repository = {
    listFollowUps: mock(async () => ({ list: [followUp], pagination: {
      page: 1, pageSize: 20, total: 1, totalPages: 1,
    } })),
    createFollowUp: mock(async (): Promise<FollowUpStub> => followUp),
    cancelFollowUp: mock(async (): Promise<FollowUpStub> => ({
      ...followUp, status: 'canceled',
    })),
    claimNotificationDeliveries: mock(async () => [
      claim(DELIVERY_A, 'expires_in_7_days'), claim(DELIVERY_B, 'expired'),
    ]),
    findNotificationIdForDelivery: mock(async () => null as string | null),
    completeNotificationDelivery: mock(async () => ({
      delivery_id: DELIVERY_A, status: 'sent' as const, notification_id: null,
      sent_at: '2026-08-12T00:00:00.000Z', idempotent: false,
    })),
    failNotificationDelivery: mock(async () => ({
      delivery_id: DELIVERY_A, status: 'failed' as const, attempt_count: 1,
      retry_at: '2026-08-12T00:01:00.000Z', idempotent: false,
    })),
  };
  const trialRepository = { findTrialById: mock(async (): Promise<TrialStub> => trial) };
  let call = 0;
  const notifications = { createEmployeeNotification: mock(async () => {
    call += 1;
    if (options.notifyFailure && call === 1) {
      throw Object.assign(new Error('raw phone 19900000000'), {
        code: 'NOTIFICATION_SEND_FAILED', details: { requestId: 'request-safe-1' },
      });
    }
    return [{ id: '99999999-9999-4999-8999-999999999999' }];
  }) };
  const module = await import('./platform-service-trial-operations');
  return { service: new module.PlatformServiceTrialOperationsService({
    repository, trialRepository, notifications,
  }), repository, trialRepository, notifications };
}

describe('PlatformServiceTrialOperationsService', () => {
  test('requires read/manage permissions and derives tenant from the trusted trial', async () => {
    const { service, repository } = await createService();
    await expect(service.listFollowUps(auth([]), TRIAL_ID, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ statusCode: 403 });
    await service.listFollowUps(auth(['platform.service_trial.read']), TRIAL_ID,
      { page: 1, pageSize: 20 });
    await service.createFollowUp(auth(['platform.service_trial.manage']), TRIAL_ID, {
      follow_up_type: 'phone', status: 'completed', summary: '完成沟通',
      result: '客户确认', idempotency_key: KEY,
    });
    expect(repository.createFollowUp).toHaveBeenCalledWith(expect.objectContaining({
      trialId: TRIAL_ID, tenantId: TENANT_ID, actorEmployeeId: EMPLOYEE_ID,
    }));
  });

  test('allows both guided and standard trials and rejects mismatched repository facts', async () => {
    const { service, repository, trialRepository } = await createService();
    trialRepository.findTrialById.mockResolvedValueOnce({ ...trial, trial_type: 'guided' });
    await service.createFollowUp(auth(['platform.service_trial.manage']), TRIAL_ID, {
      follow_up_type: 'wechat', status: 'completed', summary: '线上沟通',
      result: '完成', idempotency_key: KEY,
    });
    repository.createFollowUp.mockResolvedValueOnce({ ...followUp,
      tenant_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    await expect(service.createFollowUp(auth(['platform.service_trial.manage']), TRIAL_ID, {
      follow_up_type: 'phone', status: 'completed', summary: '电话',
      result: '完成', idempotency_key: KEY,
    })).rejects.toMatchObject({ code: 'DB_ERROR' });
  });

  test('isolates delivery failures, records stable evidence, and continues the batch', async () => {
    const { service, repository, notifications } = await createService({ notifyFailure: true });
    const result = await service.runReminderBatch({ limit: 20 });
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1,
      errors: [`${DELIVERY_A}:NOTIFICATION_SEND_FAILED:request-safe-1`] });
    expect(repository.failNotificationDelivery).toHaveBeenCalledWith({
      deliveryId: DELIVERY_A, leaseToken: LEASE,
      errorCode: 'notification_send_failed',
    });
    expect(repository.completeNotificationDelivery).toHaveBeenCalledWith({
      deliveryId: DELIVERY_B, leaseToken: LEASE,
      notificationId: '99999999-9999-4999-8999-999999999999',
    });
    expect(notifications.createEmployeeNotification).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('19900000000');
  });

  test('rejects invalid batches before claiming', async () => {
    const { service, repository } = await createService();
    await expect(service.runReminderBatch({ limit: 101 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repository.claimNotificationDeliveries).not.toHaveBeenCalled();
  });

  test('reuses an existing delivery notification without creating a duplicate', async () => {
    const { service, repository, notifications } = await createService();
    repository.claimNotificationDeliveries.mockResolvedValueOnce([
      claim(DELIVERY_A, 'expires_in_7_days'),
    ]);
    repository.findNotificationIdForDelivery.mockResolvedValueOnce(
      '99999999-9999-4999-8999-999999999999',
    );
    expect(await service.runReminderBatch({ limit: 1 })).toMatchObject({
      claimed: 1, sent: 1, failed: 0,
    });
    expect(notifications.createEmployeeNotification).not.toHaveBeenCalled();
  });
});
