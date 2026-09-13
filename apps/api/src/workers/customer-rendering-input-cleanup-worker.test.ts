import { beforeAll, expect, test } from 'bun:test';
import type { CustomerInputRow, RawCleanupClaim } from '@/repositories/customer-rendering-inputs';
import { Errors } from '@/errors/error-factory';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
let cleanup: typeof import('./customer-rendering-input-cleanup-worker').cleanupCustomerRenderingInputs;
let tick: typeof import('./customer-rendering-input-cleanup-worker').runCustomerRenderingInputCleanupTick;
beforeAll(async () => {
  ({ cleanupCustomerRenderingInputs: cleanup, runCustomerRenderingInputCleanupTick: tick } = await import('./customer-rendering-input-cleanup-worker'));
});
const NOW = '2026-09-13T10:00:00.000Z';
const PAST = '2026-09-13T09:00:00.000Z';
const FUTURE = '2026-09-13T11:00:00.000Z';
function row(status: CustomerInputRow['status'] = 'issued'): CustomerInputRow {
  return { id: crypto.randomUUID(), tenant_id: crypto.randomUUID(), channel: 'wechat',
    subject_key_version: 1, subject_digest: 'a'.repeat(64), application_id: null, installation_id: null,
    purpose: 'room', declared_mime_type: 'image/jpeg', declared_size_bytes: 10,
    bucket: 'old-bucket-123', region: 'ap-guangzhou', raw_object_key: 'private/raw',
    normalized_object_key: 'private/normalized.webp', normalized_size_bytes: 10, width: 1, height: 1,
    checksum: 'b'.repeat(64), status, expires_at: PAST, processing_lease_expires_at: PAST,
    raw_cleanup_after: PAST, raw_deleted_at: null };
}
function fixture(rows: CustomerInputRow[]) {
  let now = NOW;
  let failDelete = false;
  let expireDelete = false;
  const deleted: string[] = [];
  const queries: Array<[string, number]> = [];
  const repository = {
    async listRawCleanupDue(time: string, limit: number) {
      queries.push([time, limit]);
      return rows.filter(r => !r.raw_deleted_at && r.raw_cleanup_after <= time).slice(0, limit).map(r => ({ ...r }));
    },
    async claimRawCleanup(claim: RawCleanupClaim) {
      const r = rows.find(r => r.id === claim.id && r.tenant_id === claim.tenantId);
      if (!r || r.raw_deleted_at || r.status !== claim.status || r.raw_cleanup_after !== claim.previousDue
        || r.raw_cleanup_after > claim.now || (r.status === 'issued' && r.expires_at > claim.now)
        || (r.status === 'processing' && r.processing_lease_expires_at! > claim.now)) return false;
      r.raw_cleanup_after = claim.nextDue;
      if (r.status === 'issued' || r.status === 'processing') r.status = 'deleted';
      return true;
    },
    async markRawDeleted(tenant: string, id: string, due: string, time: string) {
      const r = rows.find(r => r.id === id && r.tenant_id === tenant);
      if (!r || r.raw_cleanup_after !== due || due <= time) return false;
      r.raw_deleted_at = time; return true;
    },
  };
  const storage = { async removeRaw(tenant: string, id: string, location: { bucket: string; region: string; object_key: string }) {
    const r = rows.find(r => r.id === id)!;
    expect(tenant).toBe(r.tenant_id);
    expect(location).toEqual({ bucket: r.bucket, region: r.region, object_key: r.raw_object_key });
    if (failDelete) throw Errors.badRequest('signed-url/subject/raw-bytes must never be logged');
    deleted.push(id);
    if (expireDelete) now = FUTURE;
  } };
  return { rows, deleted, queries, repository, storage, now: () => now,
    setNow: (value: string) => { now = value; }, fail: (value: boolean) => { failDelete = value; },
    expire: () => { expireDelete = true; } };
}

test('one bounded query per tick; no drain/full scan and no normalized deletion', async () => {
  const f = fixture(Array.from({ length: 101 }, () => row('approved')));
  const result = await cleanup(f);
  expect(f.queries).toEqual([[NOW, 100]]);
  expect(result.deleted).toBe(100);
  expect(f.rows[100]?.raw_deleted_at).toBeNull();
  expect(f.rows.every(r => r.status === 'approved' && r.normalized_object_key === 'private/normalized.webp')).toBe(true);
});
test('two concurrent workers only delete after winning claim', async () => {
  const f = fixture([row()]);
  await Promise.all([cleanup(f), cleanup(f)]);
  expect(f.deleted).toHaveLength(1);
  expect(f.rows[0]?.status).toBe('deleted');
});
test('active processing and unexpired issued protected; expired processing closes; reviewed states retained', async () => {
  const active = { ...row('processing'), processing_lease_expires_at: FUTURE };
  const issued = { ...row(), expires_at: FUTURE };
  const expired = row('processing'); const pending = row('pending_review');
  const f = fixture([active, issued, expired, pending]);
  await cleanup(f);
  expect(f.deleted).toEqual([expired.id, pending.id]);
  expect(active.status).toBe('processing'); expect(issued.status).toBe('issued');
  expect(expired.status).toBe('deleted'); expect(pending.status).toBe('pending_review');
});
test('failed deletion is counted without leaking error and retried only after due lease', async () => {
  const f = fixture([row('failed')]); f.fail(true);
  expect(await cleanup(f)).toMatchObject({ failed: 1, deleted: 0 });
  expect(f.rows[0]?.raw_deleted_at).toBeNull();
  expect(f.rows[0]?.raw_cleanup_after).toBe('2026-09-13T10:05:00.000Z');
  f.fail(false); await cleanup(f); expect(f.deleted).toHaveLength(0);
  f.setNow(FUTURE); await cleanup(f); expect(f.deleted).toHaveLength(1);
});
test('expired deletion lease cannot mark success and remains retryable', async () => {
  const f = fixture([row()]); f.expire();
  expect(await cleanup(f)).toMatchObject({ deleted: 0, lost: 1 });
  expect(f.rows[0]?.raw_deleted_at).toBeNull();
});
test('disabled tick performs no query; dry run never claims or deletes', async () => {
  const f = fixture([row()]);
  expect(await tick({ enabled: false, apply: true }, () => f)).toBeNull();
  expect(f.queries).toHaveLength(0);
  expect(await tick({ enabled: true, apply: false }, () => f)).toMatchObject({ scanned: 1, deleted: 0 });
  expect(f.deleted).toHaveLength(0); expect(f.rows[0]?.raw_cleanup_after).toBe(PAST);
});
test('runtime failure boundary reports only fixed summary', async () => {
  const f = fixture([]);
  f.repository.listRawCleanupDue = async () => { throw Errors.dbError('private subject'); };
  expect(await tick({ enabled: true, apply: true }, () => f)).toEqual({ failed: 1 });
});
