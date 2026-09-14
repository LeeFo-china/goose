import { beforeAll, expect, mock, test } from 'bun:test';
import type COS from 'cos-nodejs-sdk-v5';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
let Reviewer: typeof import('./client').CustomerRenderingInputReviewer;
beforeAll(async () => { ({ CustomerRenderingInputReviewer: Reviewer } = await import('./client')); });
const tenantId = '11111111-1111-4111-8111-111111111111';
const fileId = '22222222-2222-4222-8222-222222222222';
const config = { bucket: 'bucket-123', region: 'ap-guangzhou', secretId: 'id', secretKey: 'key' };
const location = { bucket: config.bucket, region: config.region,
  object_key: `private/customer-rendering-inputs/${tenantId}/${fileId}/normalized.webp` };

test.each([['0', 'approved'], ['1', 'rejected'], ['2', 'manual']] as const)(
  'COS CI result %s maps to %s with a private object key', async (value, expected) => {
    const request = mock(async (_params: COS.RequestParams) => ({
      statusCode: 200, headers: {}, RecognitionResult: { Result: value },
    } as COS.RequestResult));
    const reviewer = new Reviewer({ loadConfig: async () => config, createCos: () => ({ request }) });
    expect(await reviewer.review(tenantId, fileId, location)).toBe(expected);
    expect(request).toHaveBeenCalledWith({ Bucket: config.bucket, Region: config.region,
      Method: 'GET', Key: location.object_key,
      Query: { 'ci-process': 'sensitive-content-recognition', 'large-image-detect': '1' },
    });
  },
);

test('unrecognized successful response goes directly to manual without exposing a forged location', async () => {
  const request = mock(async () => ({ statusCode: 200, headers: {}, RecognitionResult: { Result: '9' } } as COS.RequestResult));
  const reviewer = new Reviewer({ loadConfig: async () => config, createCos: () => ({ request }) });
  expect(await reviewer.review(tenantId, fileId, location)).toBe('manual');
  await expect(reviewer.review(tenantId, fileId, { ...location, object_key: 'public/forged.webp' }))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(request).toHaveBeenCalledTimes(1);
});

test('non-success provider response remains retryable and cannot approve input', async () => {
  const reviewer = new Reviewer({ loadConfig: async () => config, createCos: () => ({
    request: async () => ({ statusCode: 503, headers: {} } as COS.RequestResult),
  }) });
  await expect(reviewer.review(tenantId, fileId, location)).rejects.toMatchObject({ statusCode: 502 });
});

test('persisted old bucket remains reviewable after current storage location rotates', async () => {
  const request = mock(async (_params: COS.RequestParams) => ({ statusCode: 200, headers: {},
    RecognitionResult: { Result: '0' } } as COS.RequestResult));
  const reviewer = new Reviewer({ loadConfig: async () => ({ ...config, bucket: 'new-bucket-123' }),
    createCos: () => ({ request }) });
  expect(await reviewer.review(tenantId, fileId, location)).toBe('approved');
  expect(request.mock.calls[0]?.[0].Bucket).toBe(location.bucket);
});
