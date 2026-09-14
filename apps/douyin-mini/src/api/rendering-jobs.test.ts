import { expect, mock, test } from 'bun:test';
import { createRenderingJob, fetchRenderingJobStatus } from './rendering-jobs';

const ID = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';
const KEY = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const TENANT = '55555555-5555-4555-8555-555555555555';
const RESULT_URL = `https://rendering-123456.cos.ap-guangzhou.myqcloud.com/private/customer-rendering-results/${TENANT}/${ID}/${ATTEMPT}/result.webp?q-signature=${'a'.repeat(40)}`;

test('job creation sends the exact validated idempotent request', async () => {
  const request = mock(async () => ({ job_id: ID, status: 'queued' }));
  const input = { style_asset_id: ID, room_file_id: ROOM, space: 'living_room' as const,
    mode: 'soft_furnishing' as const, idempotency_key: KEY };
  expect(await createRenderingJob({ request } as never, input)).toEqual({ jobId: ID, status: 'queued' });
  expect(request).toHaveBeenCalledWith({ method: 'POST', path: '/douyin-mini/renderings/jobs', data: input });
});

test('job status accepts only a private signed result for the requested job', async () => {
  const request = mock(async () => ({ job_id: ID, status: 'succeeded',
    created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-14T00:03:00Z', finished_at: '2026-09-14T00:03:00Z',
    failure_reason: null,
    result: { mime_type: 'image/webp', size_bytes: 100, download_url: RESULT_URL, expires_at: '2099-01-01T00:00:00Z' } }));
  expect(await fetchRenderingJobStatus({ request } as never, ID)).toEqual({ jobId: ID, status: 'succeeded',
    failureReason: null,
    result: { url: RESULT_URL, expiresAt: '2099-01-01T00:00:00Z', sizeBytes: 100 } });
  expect(request).toHaveBeenCalledWith({ method: 'GET', path: `/douyin-mini/renderings/jobs/${ID}` });
  request.mockImplementation(async () => ({ job_id: ID, status: 'succeeded',
    created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-14T00:03:00Z', finished_at: '2026-09-14T00:03:00Z',
    failure_reason: null,
    result: { mime_type: 'image/webp', size_bytes: 100, download_url: 'https://evil.example/result.webp', expires_at: '2099-01-01T00:00:00Z' } }));
  await expect(fetchRenderingJobStatus({ request } as never, ID)).rejects.toMatchObject({ code: 'INVALID_API_RESPONSE' });
});

test('failed job exposes a bounded content refusal reason and no result URL', async () => {
  const request = mock(async () => ({ job_id: ID, status: 'failed',
    created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-14T00:03:00Z',
    finished_at: '2026-09-14T00:03:00Z', result: null, failure_reason: 'content_rejected' }));
  expect(await fetchRenderingJobStatus({ request } as never, ID)).toEqual({
    jobId: ID, status: 'failed', result: null, failureReason: 'content_rejected',
  });
});
