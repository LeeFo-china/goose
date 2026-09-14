import { beforeAll, expect, mock, test } from 'bun:test';
import type { CreateCustomerRenderingJob } from './customer-rendering-jobs';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
let Repository: typeof import('./customer-rendering-jobs').CustomerRenderingJobsRepository;
beforeAll(async () => { ({ CustomerRenderingJobsRepository: Repository } = await import('./customer-rendering-jobs')); });
const command: CreateCustomerRenderingJob = {
  tenantId: '11111111-1111-4111-8111-111111111111', channel: 'wechat',
  subjectKeyVersion: 1, subjectDigest: 'a'.repeat(64), applicationId: null, installationId: null,
  phoneKeyVersion: null, phoneDigest: null,
  styleAssetId: '22222222-2222-4222-8222-222222222222',
  roomFileId: '33333333-3333-4333-8333-333333333333', floorPlanFileId: null,
  space: 'living_room', mode: 'renovation', keepNotes: null,
  idempotencyKey: '44444444-4444-4444-8444-444444444444', requestHash: 'b'.repeat(64),
};

test('sends one atomic RPC with only server-derived scope and request fields', async () => {
  const rpc = mock(async (_name: string, _params: Record<string, unknown>) => ({ data: { decision: 'created', job_id: '55555555-5555-4555-8555-555555555555',
    status: 'queued', quota: { account_id: '66666666-6666-4666-8666-666666666666',
      phone_verified: false, consumed: 0, reserved: 1,
      active_job_id: '55555555-5555-4555-8555-555555555555', reservation_status: 'reserved', decision: 'reserved' } }, error: null }));
  const repository = new Repository({ rpc });
  expect(await repository.create(command)).toMatchObject({ decision: 'created', status: 'queued' });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0]?.[0]).toBe('create_customer_rendering_job');
  expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_tenant_id: command.tenantId,
    p_subject_digest: command.subjectDigest, p_phone_digest: null,
    p_room_file_id: command.roomFileId, p_request_hash: command.requestHash });
});

test('unknown database outcome fails closed without leaking provider details', async () => {
  const repository = new Repository({ rpc: async () => ({ data: { decision: 'surprise' }, error: null }) });
  await expect(repository.create(command)).rejects.toMatchObject({ code: 'DB_ERROR' });
});
