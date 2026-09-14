import { beforeAll, expect, test } from 'bun:test';
import type { CustomerInputOwner } from './customer-rendering-inputs';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
let Repository: typeof import('./customer-rendering-job-status').CustomerRenderingJobStatusRepository;
beforeAll(async () => { ({ CustomerRenderingJobStatusRepository: Repository } = await import('./customer-rendering-job-status')); });

const owner: CustomerInputOwner = { tenantId: '11111111-1111-4111-8111-111111111111',
  channel: 'douyin', subjectKeyVersion: 1, subjectDigest: 'a'.repeat(64),
  applicationId: 'app', installationId: '22222222-2222-4222-8222-222222222222' };
const id = '33333333-3333-4333-8333-333333333333';
const row = { id, status: 'queued' as const, created_at: '2026-09-14T00:00:00Z',
  updated_at: '2026-09-14T00:00:00Z', finished_at: null, attempt_id: null,
  output_review_decision: null, result_bucket: null, result_region: null,
  result_object_key: null, result_sha256: null, result_size_bytes: null };

function fixture(data: unknown) {
  const calls: unknown[][] = [];
  const query = {
    select: (...args: unknown[]) => { calls.push(['select', ...args]); return query; },
    eq: (...args: unknown[]) => { calls.push(['eq', ...args]); return query; },
    is: (...args: unknown[]) => { calls.push(['is', ...args]); return query; },
    limit: (...args: unknown[]) => { calls.push(['limit', ...args]); return query; },
    maybeSingle: async () => ({ data, error: null }),
  };
  const client = { from: (table: string) => { calls.push(['from', table]); return query; } };
  return { repository: new Repository(client), calls };
}

test('job status read applies complete owner scope and one-row bound', async () => {
  const { repository, calls } = fixture(row);
  expect(await repository.findOwned(owner, id)).toEqual(row);
  for (const call of [['from', 'customer_rendering_jobs'], ['eq', 'tenant_id', owner.tenantId],
    ['eq', 'channel', 'douyin'], ['eq', 'subject_key_version', 1],
    ['eq', 'subject_digest', owner.subjectDigest], ['eq', 'application_id', 'app'],
    ['eq', 'installation_id', owner.installationId], ['eq', 'id', id], ['limit', 1]]) {
    expect(calls).toContainEqual(call);
  }
  expect(JSON.stringify(calls)).not.toContain('select","*"');
});

test('missing and malformed database rows stay private', async () => {
  expect(await fixture(null).repository.findOwned(owner, id)).toBeNull();
  await expect(fixture({ ...row, status: 'succeeded' }).repository.findOwned(owner, id))
    .rejects.toMatchObject({ code: 'DB_ERROR' });
});
