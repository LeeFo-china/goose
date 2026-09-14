import { beforeAll, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
let Repository: typeof import('./customer-rendering-job-worker').CustomerRenderingJobWorkerRepository;
beforeAll(async () => { ({ CustomerRenderingJobWorkerRepository: Repository } = await import('./customer-rendering-job-worker')); });

const jobId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const tenantId = '33333333-3333-4333-8333-333333333333';
const claim = { decision: 'claimed', job_id: jobId, attempt_id: attemptId, tenant_id: tenantId,
  style_asset_id: '66666666-6666-4666-8666-666666666666',
  space: 'living_room', mode: 'renovation', keep_notes: null,
  room: { file_id: '44444444-4444-4444-8444-444444444444', bucket: 'test-bucket-12345',
    region: 'ap-beijing', object_key: `private/customer-rendering-inputs/${tenantId}/44444444-4444-4444-8444-444444444444/normalized.webp`,
    size_bytes: 100, sha256: 'a'.repeat(64) },
  style_snapshot: { bucket: 'test-bucket-12345', region: 'ap-beijing',
    object_key: 'rendering/styles/test.webp', checksum: 'b'.repeat(64), size_bytes: 100,
    file_id: '55555555-5555-4555-8555-555555555555', title: 'Test', space: 'living_room',
    style: 'modern_simple', color_notes: '', material_notes: '', source_type: 'design',
    published_version: 1, published_at: '2026-09-14T00:00:00Z' } };

test('claim parses only a bounded, complete immutable work snapshot', async () => {
  const rpc = mock(async (_name: string, _params: Record<string, unknown>) => ({ data: claim, error: null }));
  const repository = new Repository({ rpc });
  expect(await repository.claim()).toMatchObject({ decision: 'claimed', job_id: jobId,
    room: { sha256: 'a'.repeat(64) } });
  expect(rpc.mock.calls[0]?.[0]).toBe('claim_customer_rendering_job');
  expect(rpc.mock.calls[0]?.[1]).toEqual({ p_lease_seconds: 900 });
});

test('claim fails closed when the private input snapshot is incomplete', async () => {
  const repository = new Repository({ rpc: async () => ({ data: { ...claim, room: { ...claim.room, object_key: null } }, error: null }) });
  await expect(repository.claim()).rejects.toMatchObject({ code: 'DB_ERROR' });
});

test('worker transitions include the attempt fence and never accept unknown DB decisions', async () => {
  const rpc = mock(async (name: string, _params: Record<string, unknown>) => ({ data: { decision: name === 'mark_customer_rendering_job_submitted' ? 'submitted' : 'surprise' }, error: null }));
  const repository = new Repository({ rpc });
  expect(await repository.markSubmitted(jobId, attemptId, 'ark-model')).toEqual('submitted');
  expect(rpc.mock.calls[0]?.[1]).toEqual({ p_job_id: jobId, p_attempt_id: attemptId, p_model_code: 'ark-model' });
  await expect(repository.markReviewRequired(jobId, attemptId, 'PROVIDER_TIMEOUT')).rejects.toMatchObject({ code: 'DB_ERROR' });
});
