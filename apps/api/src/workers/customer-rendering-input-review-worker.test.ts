import { beforeAll, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
let reviewCustomerRenderingInputs: typeof import('./customer-rendering-input-review-worker').reviewCustomerRenderingInputs;
beforeAll(async () => {
  ({ reviewCustomerRenderingInputs } = await import('./customer-rendering-input-review-worker'));
});

const row = { id: '22222222-2222-4222-8222-222222222222',
  tenant_id: '11111111-1111-4111-8111-111111111111', bucket: 'bucket-123', region: 'ap-guangzhou',
  normalized_object_key: 'private/customer-rendering-inputs/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/normalized.webp',
  review_due_at: '2026-09-14T00:00:00.000Z', review_attempts: 0 };

test.each(['approved', 'rejected', 'manual'] as const)('review result %s is fenced and persisted', async (result) => {
  const repository = { listReviewDue: mock(async () => [row]), claimReview: mock(async () => true),
    markReviewed: mock(async () => true) };
  const reviewer = { review: mock(async () => result) };
  const summary = await reviewCustomerRenderingInputs({ repository, reviewer,
    now: () => '2026-09-14T00:01:00.000Z' });
  expect(summary.approved + summary.rejected + summary.manual).toBe(1);
  expect(repository.claimReview).toHaveBeenCalledTimes(1);
  expect(repository.markReviewed).toHaveBeenCalledWith(row.tenant_id, row.id,
    '2026-09-14T00:06:00.000Z', result);
  expect(reviewer.review).toHaveBeenCalledWith(row.tenant_id, row.id, {
    bucket: row.bucket, region: row.region, object_key: row.normalized_object_key,
  });
});

test('provider failure remains fail closed and moves to manual review after bounded attempts', async () => {
  const repository = { listReviewDue: mock(async () => [{ ...row, review_attempts: 2 }]),
    claimReview: mock(async () => true), markReviewed: mock(async () => true) };
  const reviewer = { review: mock(async () => { throw new Error('provider unavailable'); }) };
  const summary = await reviewCustomerRenderingInputs({ repository, reviewer,
    now: () => '2026-09-14T00:01:00.000Z' });
  expect(summary.manual).toBe(1);
  expect(repository.markReviewed).toHaveBeenCalledWith(row.tenant_id, row.id,
    '2026-09-14T00:21:00.000Z', 'manual');
});

test('a crash after the third claim is recovered as manual without another paid audit', async () => {
  const repository = { listReviewDue: mock(async () => [{ ...row, review_attempts: 3 }]),
    claimReview: mock(async () => true), markReviewed: mock(async () => true) };
  const reviewer = { review: mock(async () => 'approved' as const) };
  const summary = await reviewCustomerRenderingInputs({ repository, reviewer,
    now: () => '2026-09-14T00:01:00.000Z' });
  expect(summary.manual).toBe(1);
  expect(repository.claimReview).not.toHaveBeenCalled();
  expect(reviewer.review).not.toHaveBeenCalled();
});
