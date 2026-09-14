import { beforeAll, expect, mock, test } from 'bun:test';
import { arkGatewayError } from '@/gateways/ark-rendering/errors';
import type { ResultReviewOutcome } from '@/gateways/customer-rendering-result-review/client';
import type { ClaimedCustomerRenderingJob } from '@/repositories/customer-rendering-job-worker';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';

let runTick: typeof import('./customer-rendering-job-worker').runCustomerRenderingJobTick;
let isEnabled: typeof import('./customer-rendering-job-worker').isCustomerRenderingJobWorkerEnabled;
let prepareJob: typeof import('./customer-rendering-job-worker').prepareCustomerRenderingJob;
beforeAll(async () => ({ runCustomerRenderingJobTick: runTick,
  isCustomerRenderingJobWorkerEnabled: isEnabled,
  prepareCustomerRenderingJob: prepareJob } = await import('./customer-rendering-job-worker')));

const tenantId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const claim: ClaimedCustomerRenderingJob = { decision: 'claimed', tenant_id: tenantId,
  job_id: jobId, attempt_id: attemptId, style_asset_id: '44444444-4444-4444-8444-444444444444',
  space: 'living_room', mode: 'renovation', keep_notes: null,
  room: { file_id: '55555555-5555-4555-8555-555555555555', bucket: 'bucket-123', region: 'ap-beijing',
    object_key: `private/customer-rendering-inputs/${tenantId}/55555555-5555-4555-8555-555555555555/normalized.webp`,
    size_bytes: 100, sha256: 'a'.repeat(64) },
  style_snapshot: { file_id: '66666666-6666-4666-8666-666666666666', bucket: 'bucket-123',
    region: 'ap-beijing', object_key: `public/renovation-styles/${tenantId}/44444444-4444-4444-8444-444444444444/1.webp`, checksum: 'b'.repeat(64),
    size_bytes: 100, title: 'Test', space: 'living_room', style: 'modern_simple',
    color_notes: '', material_notes: '', source_type: 'design', published_version: 1,
    published_at: '2026-09-14T00:00:00Z' },
};
const location = { bucket: 'bucket-123', region: 'ap-beijing',
  object_key: `private/customer-rendering-results/${tenantId}/${jobId}/${attemptId}/result.webp` };
const config = { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: 'key', model: 'ark-model', timeoutMs: 300_000 };
const input = { roomImageUrl: 'https://example.com/room', referenceImageUrl: 'https://example.com/style',
  prompt: '装修效果', size: '2K' as const };
const image = { bytes: Buffer.from('RIFF____WEBP'), mimeType: 'image/webp' as const };

function fixture() {
  const sequence: string[] = [];
  const repository = {
    reconcileExpired: mock(async () => 0),
    claim: mock(async () => claim),
    markSubmitted: mock(async (): Promise<'submitted' | 'stale' | 'invalid_request'> => {
      sequence.push('submitted'); return 'submitted';
    }),
    recordResult: mock(async () => 'recorded' as const),
    recordOutputReview: mock(async () => 'recorded' as const),
    markReviewRequired: mock(async () => 'review_required' as const),
    finalize: mock(async () => ({ decision: 'finalized' as const, status: 'succeeded' as const })),
  };
  const prepare = mock(async () => ({ config, input, modelCode: 'ark-model-code' }));
  const generate = mock(async () => { sequence.push('generate'); return { imageUrl: 'https://ark.example/result', requestId: 'ark-request' }; });
  const download = mock(async () => image);
  const normalize = mock(async () => ({ bytes: image.bytes, mimeType: 'image/webp' as const, width: 16, height: 12 }));
  const storage = { location: mock(async () => location), put: mock(async () => ({ location,
    sizeBytes: image.bytes.length, sha256: 'c'.repeat(64) })) };
  const reviewer = { review: mock(async (): Promise<ResultReviewOutcome> => ({ decision: 'approved',
    providerRequestId: 'ci-request', rawResult: 0 })) };
  return { sequence, repository, prepare, generate, download, normalize, storage, reviewer,
    dependencies: { repository, prepare, generate, download, normalize, storage, reviewer } };
}

test('disabled default makes no RPC or provider call', async () => {
  const f = fixture();
  expect(isEnabled({})).toBe(false);
  expect(isEnabled({ CUSTOMER_RENDERING_JOB_WORKER_ENABLED: 'true' })).toBe(true);
  expect(await runTick(f.dependencies, false)).toEqual({ disabled: true });
  expect(f.repository.claim).not.toHaveBeenCalled();
  expect(f.generate).not.toHaveBeenCalled();
});

test('preparation signs only the approved room snapshot and immutable published style reference', async () => {
  const signRoom = mock(async () => 'https://signed.example/room');
  const prepared = await prepareJob(claim, { signRoom,
    resolveImageConfig: async () => ({ providerCode: 'ark', providerType: 'openai_compatible',
      modelCode: 'ark-model-code', modelName: 'ark-model', baseUrl: config.baseUrl,
      apiKey: config.apiKey, timeoutMs: config.timeoutMs }) });
  expect(signRoom).toHaveBeenCalledWith(tenantId, claim.room.file_id, {
    bucket: claim.room.bucket, region: claim.room.region, object_key: claim.room.object_key,
  });
  expect(prepared).toMatchObject({ modelCode: 'ark-model-code', config: { model: 'ark-model' },
    input: { roomImageUrl: 'https://signed.example/room',
      referenceImageUrl: `https://bucket-123.cos.ap-beijing.myqcloud.com/${claim.style_snapshot.object_key}` } });
  expect(JSON.stringify(prepared)).not.toContain('floor_plan');
});

test('records provider intent before paid Ark call and finalizes only approved audited output', async () => {
  const f = fixture();
  const result = await runTick(f.dependencies, true);
  expect(result).toMatchObject({ claimed: 1, approved: 1, reviewRequired: 0 });
  expect(f.sequence).toEqual(['submitted', 'generate']);
  expect(f.prepare).toHaveBeenCalledWith(claim);
  expect(f.repository.markSubmitted).toHaveBeenCalledWith(jobId, attemptId, 'ark-model-code');
  expect(f.generate).toHaveBeenCalledWith(config, input);
  expect(f.repository.recordResult).toHaveBeenCalledWith(jobId, attemptId, {
    location, sizeBytes: image.bytes.length, sha256: 'c'.repeat(64), providerRequestId: 'ark-request',
  });
  expect(f.repository.recordOutputReview).toHaveBeenCalledWith(jobId, attemptId, {
    decision: 'approved', providerRequestId: 'ci-request', rawResult: 0,
  });
  expect(f.repository.finalize).toHaveBeenCalledWith(jobId, attemptId, 'approved', null);
});

test('explicit Ark 4xx rejection releases quota, while unknown submission never resends', async () => {
  const rejected = fixture(); rejected.generate.mockRejectedValue(arkGatewayError('rejected', 422));
  await runTick(rejected.dependencies, true);
  expect(rejected.repository.finalize).toHaveBeenCalledWith(jobId, attemptId, 'provider_rejected', 'ARK_UPSTREAM_REJECTED');
  expect(rejected.repository.markReviewRequired).not.toHaveBeenCalled();
  const unknown = fixture(); unknown.generate.mockRejectedValue(arkGatewayError('submission_unknown'));
  await runTick(unknown.dependencies, true);
  expect(unknown.repository.markReviewRequired).toHaveBeenCalledWith(jobId, attemptId, 'ARK_SUBMISSION_UNKNOWN');
  expect(unknown.repository.finalize).not.toHaveBeenCalled();
  expect(unknown.generate).toHaveBeenCalledTimes(1);
  const ambiguous = fixture(); ambiguous.generate.mockRejectedValue(arkGatewayError('rejected'));
  await runTick(ambiguous.dependencies, true);
  expect(ambiguous.repository.markReviewRequired).toHaveBeenCalledWith(jobId, attemptId, 'ARK_SUBMISSION_UNKNOWN');
  expect(ambiguous.repository.finalize).not.toHaveBeenCalled();
});

test('preflight and lost submission intent never call the paid provider', async () => {
  const failed = fixture(); failed.prepare.mockRejectedValue(Error('input signature unavailable'));
  await runTick(failed.dependencies, true);
  expect(failed.repository.finalize).toHaveBeenCalledWith(jobId, attemptId, 'failed', 'WORKER_PREFLIGHT_UNAVAILABLE');
  expect(failed.repository.markReviewRequired).not.toHaveBeenCalled();
  expect(failed.repository.markSubmitted).not.toHaveBeenCalled();
  expect(failed.generate).not.toHaveBeenCalled();
  const invalidConfig = fixture(); invalidConfig.prepare.mockResolvedValue({
    config: { ...config, baseUrl: 'http://invalid.example/api/v3' }, input, modelCode: 'ark-model-code',
  });
  await runTick(invalidConfig.dependencies, true);
  expect(invalidConfig.repository.finalize).toHaveBeenCalledWith(jobId, attemptId, 'failed', 'WORKER_PREFLIGHT_UNAVAILABLE');
  expect(invalidConfig.repository.markSubmitted).not.toHaveBeenCalled();
  expect(invalidConfig.generate).not.toHaveBeenCalled();
  const shortTimeout = fixture(); shortTimeout.prepare.mockResolvedValue({
    config: { ...config, timeoutMs: 60_000 }, input, modelCode: 'ark-model-code',
  });
  await runTick(shortTimeout.dependencies, true);
  expect(shortTimeout.repository.finalize).toHaveBeenCalledWith(jobId, attemptId,
    'failed', 'RENDERING_MODEL_TIMEOUT_UNSAFE');
  expect(shortTimeout.repository.markSubmitted).not.toHaveBeenCalled();
  expect(shortTimeout.generate).not.toHaveBeenCalled();
  const uncertain = fixture(); uncertain.repository.markSubmitted.mockRejectedValue(Error('RPC unknown'));
  await runTick(uncertain.dependencies, true);
  expect(uncertain.repository.markReviewRequired).toHaveBeenCalledWith(jobId, attemptId, 'WORKER_SUBMISSION_INTENT_UNAVAILABLE');
  expect(uncertain.generate).not.toHaveBeenCalled();
});

test.each(['download', 'storage', 'reviewer'] as const)('%s failure becomes review_required after one Ark call', async (stage) => {
  const f = fixture();
  if (stage === 'download') f.download.mockRejectedValue(Error('download'));
  if (stage === 'storage') f.storage.put.mockRejectedValue(Error('storage'));
  if (stage === 'reviewer') f.reviewer.review.mockRejectedValue(Error('review'));
  await runTick(f.dependencies, true);
  expect(f.repository.markReviewRequired).toHaveBeenCalledTimes(1);
  expect(f.repository.finalize).not.toHaveBeenCalled();
  expect(f.generate).toHaveBeenCalledTimes(1);
});

test('rejected CI output is audited then released; manual or missing request ID needs review', async () => {
  const rejected = fixture(); rejected.reviewer.review.mockResolvedValue({ decision: 'rejected',
    providerRequestId: 'ci-request', rawResult: 1 });
  await runTick(rejected.dependencies, true);
  expect(rejected.repository.finalize).toHaveBeenCalledWith(jobId, attemptId, 'rejected', 'OUTPUT_REVIEW_REJECTED');
  const manual = fixture(); manual.reviewer.review.mockResolvedValue({ decision: 'manual',
    providerRequestId: null, rawResult: 9 });
  await runTick(manual.dependencies, true);
  expect(manual.repository.recordOutputReview).toHaveBeenCalledWith(jobId, attemptId, {
    decision: 'manual', providerRequestId: null, rawResult: 9,
  });
  expect(manual.repository.markReviewRequired).toHaveBeenCalledWith(jobId, attemptId, 'OUTPUT_REVIEW_MANUAL');
  expect(manual.repository.finalize).not.toHaveBeenCalled();
  const missingId = fixture(); missingId.reviewer.review.mockResolvedValue({ decision: 'rejected',
    providerRequestId: null, rawResult: 1 });
  await runTick(missingId.dependencies, true);
  expect(missingId.repository.recordOutputReview).toHaveBeenCalledWith(jobId, attemptId, {
    decision: 'manual', providerRequestId: null, rawResult: 1,
  });
  expect(missingId.repository.finalize).not.toHaveBeenCalled();
});

test('result or review audit RPC failure leaves the reservation for reconciliation', async () => {
  const result = fixture(); result.repository.recordResult.mockRejectedValue(Error('DB unknown'));
  await runTick(result.dependencies, true);
  expect(result.repository.markReviewRequired).toHaveBeenCalledWith(jobId, attemptId, 'WORKER_RESULT_RECORD_UNAVAILABLE');
  expect(result.reviewer.review).not.toHaveBeenCalled();
  const review = fixture(); review.repository.recordOutputReview.mockRejectedValue(Error('DB unknown'));
  await runTick(review.dependencies, true);
  expect(review.repository.markReviewRequired).toHaveBeenCalledWith(jobId, attemptId, 'WORKER_OUTPUT_REVIEW_UNAVAILABLE');
  expect(review.repository.finalize).not.toHaveBeenCalled();
});

test('lost submitted fence prevents Ark call and expired attempts are reconciled each tick', async () => {
  const f = fixture(); f.repository.reconcileExpired.mockResolvedValue(2);
  f.repository.markSubmitted.mockResolvedValue('stale');
  const result = await runTick(f.dependencies, true);
  expect(result).toMatchObject({ reconciled: 2, lost: 1 });
  expect(f.generate).not.toHaveBeenCalled();
});
