import { beforeAll, expect, mock, test } from 'bun:test';
import type COS from 'cos-nodejs-sdk-v5';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';

let Reviewer: typeof import('./client').CustomerRenderingResultReviewer;
beforeAll(async () => { ({ CustomerRenderingResultReviewer: Reviewer } = await import('./client')); });

const tenantId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const config = { bucket: 'current-bucket-123', region: 'ap-guangzhou', secretId: 'id', secretKey: 'key' };
const location = { bucket: 'persisted-bucket-123', region: 'ap-shanghai',
  object_key: `private/customer-rendering-results/${tenantId}/${jobId}/${attemptId}/result.webp` };

test.each([['0', 'approved'], [0, 'approved'], ['1', 'rejected'], [1, 'rejected'], ['2', 'manual'], [2, 'manual']] as const)(
  'COS CI verdict %s maps to %s for the supplied private result location', async (verdict, expected) => {
    const request = mock(async (_params: COS.RequestParams) => ({ statusCode: 200,
      RequestId: 'ci-request-123', headers: { 'x-ci-request-id': 'ci-request-123' },
      RecognitionResult: { Result: verdict } } as COS.RequestResult));
    const reviewer = new Reviewer({ loadConfig: async () => config, createCos: () => ({ request }) });
    expect(await reviewer.review(tenantId, jobId, attemptId, location)).toEqual({
      decision: expected, providerRequestId: 'ci-request-123', rawResult: Number(verdict),
    });
    expect(request).toHaveBeenCalledWith({ Bucket: location.bucket, Region: location.region,
      Method: 'GET', Key: location.object_key,
      Query: { 'ci-process': 'sensitive-content-recognition', 'large-image-detect': '1' } });
  });

test.each([undefined, null, false, '00', '9', {}, { Result: '0' }] as const)(
  'unknown successful CI verdict %p requires manual review', async (verdict) => {
    const request = mock(async () => ({ statusCode: 200, RequestId: 'ci-request-unknown', headers: {},
      RecognitionResult: { Result: verdict } } as COS.RequestResult));
    const reviewer = new Reviewer({ loadConfig: async () => config, createCos: () => ({ request }) });
    expect(await reviewer.review(tenantId, jobId, attemptId, location)).toEqual({
      decision: 'manual', providerRequestId: 'ci-request-unknown', rawResult: verdict === '9' ? 9 : null,
    });
  });

test('CI request ID falls back to the provider header and rejects unsafe metadata', async () => {
  const request = mock(async () => ({ statusCode: 200,
    headers: { 'x-ci-request-id': 'header-request-123' }, RecognitionResult: { Result: 0 } } as COS.RequestResult));
  const reviewer = new Reviewer({ loadConfig: async () => config, createCos: () => ({ request }) });
  expect(await reviewer.review(tenantId, jobId, attemptId, location)).toEqual({
    decision: 'approved', providerRequestId: 'header-request-123', rawResult: 0,
  });
  request.mockResolvedValueOnce({ statusCode: 200, RequestId: 'unsafe\nrequest', headers: {},
    RecognitionResult: { Result: 2 } } as COS.RequestResult);
  expect(await reviewer.review(tenantId, jobId, attemptId, location)).toEqual({
    decision: 'manual', providerRequestId: null, rawResult: 2,
  });
});

test('forged or malformed result locations are rejected before config and COS access', async () => {
  const loadConfig = mock(async () => config);
  const request = mock(async () => ({ statusCode: 200, headers: {},
    RecognitionResult: { Result: 0 } } as COS.RequestResult));
  const reviewer = new Reviewer({ loadConfig, createCos: () => ({ request }) });
  for (const candidate of [
    { ...location, object_key: 'public/result.webp' },
    { ...location, object_key: location.object_key.replace(jobId, tenantId) },
    { ...location, bucket: 'https://forged.example' },
    { ...location, region: 'invalid/region' },
  ]) await expect(reviewer.review(tenantId, jobId, attemptId, candidate))
    .rejects.toMatchObject({ statusCode: 400 });
  await expect(reviewer.review(tenantId, jobId, 'invalid', location))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(loadConfig).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

test('config failure and provider failures stay unavailable, never rejected or manual', async () => {
  const request = mock(async (_params: COS.RequestParams) => ({ statusCode: 503, headers: {} } as COS.RequestResult));
  const unavailable = { statusCode: 503, code: 'RENDERING_RESULT_REVIEW_UNAVAILABLE' };
  await expect(new Reviewer({ loadConfig: async () => { throw Error('secret detail'); } })
    .review(tenantId, jobId, attemptId, location)).rejects.toMatchObject(unavailable);
  await expect(new Reviewer({ loadConfig: async () => config, createCos: () => ({ request }) })
    .review(tenantId, jobId, attemptId, location)).rejects.toMatchObject(unavailable);
  request.mockRejectedValueOnce(Error('network detail'));
  await expect(new Reviewer({ loadConfig: async () => config, createCos: () => ({ request }) })
    .review(tenantId, jobId, attemptId, location)).rejects.toMatchObject(unavailable);
});
