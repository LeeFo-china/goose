import { beforeAll, expect, mock, test } from 'bun:test';
import type { RenderingJobRequest } from '@gooes/domain';
import type { JwtPayload } from '@/utils/jwt';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
let Service: typeof import('./jobs').CustomerRenderingJobsService;
beforeAll(async () => { ({ CustomerRenderingJobsService: Service } = await import('./jobs')); });
const tenantId = '11111111-1111-4111-8111-111111111111';
const user = { token_type: 'visitor_session', visitor_id: 'visitor', openid: 'openid' } as JwtPayload;
const command: RenderingJobRequest = {
  style_asset_id: '22222222-2222-4222-8222-222222222222',
  room_file_id: '33333333-3333-4333-8333-333333333333',
  space: 'living_room', mode: 'soft_furnishing',
  idempotency_key: '44444444-4444-4444-8444-444444444444',
};
const quota = { account_id: '55555555-5555-4555-8555-555555555555', phone_verified: false,
  consumed: 0, reserved: 1, active_job_id: '66666666-6666-4666-8666-666666666666', reservation_status: 'reserved' as const };

test('trusted actor and stable command hash reach one atomic RPC; replay returns original task', async () => {
  let calls = 0;
  const create = mock(async (_command: import('@/repositories/customer-rendering-jobs').CreateCustomerRenderingJob) => ({
    decision: calls++ === 0 ? 'created' as const : 'existing' as const,
    job_id: quota.active_job_id, status: 'queued' as const, quota,
  }));
  const service = new Service({ contextService: { resolveWechat: async () => ({
    tenantId, channel: 'wechat', subject: 'openid', applicationId: null,
    installationId: null, verifiedPhone: null,
  }), resolveDouyin: async () => { throw new Error('wrong channel'); } },
  digestService: { subject: () => ({ keyVersion: 1, digest: 'a'.repeat(64) }),
    phone: () => ({ keyVersion: 1, digest: 'b'.repeat(64) }) },
  repository: { create }, admissionEnabled: () => true });
  expect(await service.create(user, 'wechat', command)).toMatchObject({
    job_id: quota.active_job_id, status: 'queued', quota: { reserved: 1, active_job_id: quota.active_job_id },
  });
  expect(await service.create(user, 'wechat', command)).toMatchObject({ job_id: quota.active_job_id });
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[0]?.[0]).toEqual(create.mock.calls[1]?.[0]);
  expect(create.mock.calls[0]?.[0]).toMatchObject({ tenantId, channel: 'wechat',
    subjectDigest: 'a'.repeat(64), phoneDigest: null,
    requestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
  });
});

test.each([
  ['disabled', 503], ['style_unavailable', 422], ['input_unavailable', 422],
  ['daily_task_limit', 429], ['daily_budget_limit', 429], ['job_active', 409],
  ['phone_required', 409], ['quota_exhausted', 409], ['idempotency_conflict', 409],
] as const)('decision %s fails closed', async (decision, statusCode) => {
  const service = new Service({ contextService: { resolveWechat: async () => ({
    tenantId, channel: 'wechat', subject: 'openid', applicationId: null,
    installationId: null, verifiedPhone: null,
  }), resolveDouyin: async () => { throw new Error('wrong channel'); } },
  digestService: { subject: () => ({ keyVersion: 1, digest: 'a'.repeat(64) }),
    phone: () => ({ keyVersion: 1, digest: 'b'.repeat(64) }) },
  repository: { create: async () => ({ decision }) }, admissionEnabled: () => true });
  await expect(service.create(user, 'wechat', command)).rejects.toMatchObject({ statusCode });
});

test('default admission switch blocks all database writes', async () => {
  const create = mock(async () => ({ decision: 'disabled' as const }));
  const service = new Service({ repository: { create }, admissionEnabled: () => false });
  await expect(service.create(user, 'wechat', command)).rejects.toMatchObject({ statusCode: 503 });
  expect(create).not.toHaveBeenCalled();
});
