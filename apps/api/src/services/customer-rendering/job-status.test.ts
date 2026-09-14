import { beforeAll, expect, mock, test } from 'bun:test';
import type { JwtPayload } from '@/utils/jwt';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
let Service: typeof import('./job-status').CustomerRenderingJobStatusService;
beforeAll(async () => { ({ CustomerRenderingJobStatusService: Service } = await import('./job-status')); });

const tenantId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const user = { token_type: 'visitor_session', visitor_id: 'visitor', openid: 'openid' } as JwtPayload;
const base = { id: jobId, status: 'processing' as const, created_at: '2026-09-14T00:00:00Z',
  updated_at: '2026-09-14T00:01:00Z', finished_at: null, attempt_id: attemptId,
  output_review_decision: null, result_bucket: null, result_region: null,
  result_object_key: null, result_sha256: null, result_size_bytes: null };
const contextService = { resolveWechat: async () => ({ tenantId, channel: 'wechat' as const,
  subject: 'openid', applicationId: null, installationId: null, verifiedPhone: null }),
resolveDouyin: async () => { throw new Error('wrong channel'); } };
const digestService = { subject: () => ({ keyVersion: 1, digest: 'a'.repeat(64) }) };

test('processing status exposes no private URL or provider details', async () => {
  const signResultRead = mock(async () => ({ url: 'https://example.com/result', expiresAt: '2026-09-14T00:10:00Z' }));
  const service = new Service({ contextService, digestService,
    repository: { findOwned: async () => base }, storage: { signResultRead } });
  expect(await service.get(user, 'wechat', jobId)).toEqual({
    job_id: jobId, status: 'processing', created_at: base.created_at,
    updated_at: base.updated_at, finished_at: null, result: null,
  });
  expect(signResultRead).not.toHaveBeenCalled();
});

test('only approved success receives a short-lived private result link', async () => {
  const location = { bucket: 'test-bucket-12345', region: 'ap-beijing',
    object_key: `private/customer-rendering-results/${tenantId}/${jobId}/${attemptId}/result.webp` };
  const signResultRead = mock(async (_tenant: string, _job: string, _attempt: string,
    _location: { bucket: string; region: string; object_key: string }) => ({ url: 'https://test-bucket-12345.cos.ap-beijing.myqcloud.com/private/result.webp?q-signature=abc',
    expiresAt: '2026-09-14T00:10:00Z' }));
  const service = new Service({ contextService, digestService,
    repository: { findOwned: async () => ({ ...base, status: 'succeeded' as const, finished_at: '2026-09-14T00:02:00Z',
      output_review_decision: 'approved' as const, result_bucket: location.bucket,
      result_region: location.region, result_object_key: location.object_key,
      result_sha256: 'a'.repeat(64), result_size_bytes: 100 }) },
    storage: { signResultRead } });
  expect(await service.get(user, 'wechat', jobId)).toMatchObject({ status: 'succeeded',
    result: { mime_type: 'image/webp', size_bytes: 100, expires_at: '2026-09-14T00:10:00Z' } });
  expect(signResultRead).toHaveBeenCalledWith(tenantId, jobId, attemptId, location);
});

test('missing owner-scoped job returns 404 without signing', async () => {
  const signResultRead = mock(async () => ({ url: 'https://example.com/result', expiresAt: '2026-09-14T00:10:00Z' }));
  const service = new Service({ contextService, digestService,
    repository: { findOwned: async () => null }, storage: { signResultRead } });
  await expect(service.get(user, 'wechat', jobId)).rejects.toMatchObject({ statusCode: 404 });
  expect(signResultRead).not.toHaveBeenCalled();
});
