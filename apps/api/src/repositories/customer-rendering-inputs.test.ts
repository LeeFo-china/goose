import { beforeAll, describe, expect, test } from 'bun:test';
import { createClient } from '@supabase/supabase-js';
import type { CustomerInputOwner, CustomerInputRow } from './customer-rendering-inputs';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
let Repository: typeof import('./customer-rendering-inputs').CustomerRenderingInputsRepository;
beforeAll(async () => {
  ({ CustomerRenderingInputsRepository: Repository } = await import('./customer-rendering-inputs'));
});
const ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-09-13T10:00:00.000Z';
const LEASE = '2026-09-13T10:05:00.000Z';
const FUTURE = '2026-09-13T11:00:00.000Z';
const PAST = '2026-09-13T09:00:00.000Z';
const owner: CustomerInputOwner = {
  tenantId: ID, channel: 'wechat', subjectKeyVersion: 1, subjectDigest: 'a'.repeat(64),
  applicationId: null, installationId: null,
};
const normalized = { objectKey: 'private/normalized.webp', sizeBytes: 100, width: 20, height: 10, checksum: 'b'.repeat(64) };
function row(overrides: Partial<CustomerInputRow> = {}): CustomerInputRow {
  return {
    id: ID, tenant_id: ID, channel: 'wechat', subject_key_version: 1,
    subject_digest: owner.subjectDigest, application_id: null, installation_id: null,
    purpose: 'room', declared_mime_type: 'image/jpeg', declared_size_bytes: 100,
    bucket: 'issued-bucket', region: 'ap-guangzhou', raw_object_key: 'private/raw',
    normalized_object_key: null, normalized_size_bytes: null, width: null, height: null,
    checksum: null, status: 'issued', expires_at: FUTURE, processing_lease_expires_at: null,
    raw_cleanup_after: FUTURE, raw_deleted_at: null, ...overrides,
  };
}

// Use the installed Supabase query builder; only the HTTP/database boundary is replaced.
function database(initial: CustomerInputRow[] = [row()], failure?: unknown) {
  const rows: Record<string, unknown>[] = initial.map((value) => ({ ...value, created_at: NOW }));
  const requests: { url: URL; method: string; body: Record<string, unknown> | null; headers: Headers }[] = [];
  const client = createClient('http://localhost:54321', 'test', {
    global: { fetch: Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body: Record<string, unknown> | null = init?.body ? JSON.parse(String(init.body)) : null;
      const headers = new Headers(init?.headers);
      requests.push({ url, method, body, headers });
      if (failure) return Response.json(failure, { status: 500 });
      if (method === 'POST') { rows.push(body!); return new Response(null, { status: 201 }); }
      const matching = rows.filter((value) => [...url.searchParams].every(([key, filter]) => {
        if (['select', 'order', 'limit'].includes(key)) return true;
        const split = filter.indexOf('.');
        const op = filter.slice(0, split);
        const expected = filter.slice(split + 1);
        const actual = value[key];
        if (op === 'is') return actual === null;
        if (actual === null || actual === undefined) return false;
        if (op === 'eq') return String(actual) === expected;
        if (op === 'gt') return String(actual) > expected;
        if (op === 'gte') return String(actual) >= expected;
        if (op === 'lte') return String(actual) <= expected;
        return false;
      }));
      if (method === 'HEAD') return new Response(null, { headers: { 'content-range': `*/${matching.length}` } });
      const limited = matching.slice(0, Number(url.searchParams.get('limit') ?? matching.length));
      if (method === 'PATCH') limited.forEach((value) => Object.assign(value, body));
      const fields = url.searchParams.get('select')?.split(',') ?? [];
      const selected = limited.map((value) => Object.fromEntries(fields.map((key) => [key, value[key]])));
      return Response.json(headers.get('accept')?.includes('vnd.pgrst.object') ? selected[0] ?? null : selected);
    }, { preconnect: fetch.preconnect }) },
  });
  // Same recursive SDK-type boundary as the production constructor; real builder remains in use.
  const repositoryClient = client as unknown as ConstructorParameters<typeof Repository>[0];
  return { repository: new Repository(repositoryClient), rows, requests };
}

describe('CustomerRenderingInputsRepository', () => {
  test('persists only issued whitelist fields including original storage location', async () => {
    const db = database([]);
    await db.repository.createIssued(owner, {
      id: ID, purpose: 'room', mimeType: 'image/jpeg', sizeBytes: 100,
      bucket: 'issued-bucket', region: 'ap-guangzhou', rawObjectKey: 'private/raw', expiresAt: FUTURE,
      ...{ status: 'approved', upload_url: 'secret', tenant_id: 'attacker' },
    });
    expect(db.rows[0]).toEqual({
      id: ID, tenant_id: ID, channel: 'wechat', subject_key_version: 1, subject_digest: owner.subjectDigest,
      application_id: null, installation_id: null, purpose: 'room', declared_mime_type: 'image/jpeg',
      declared_size_bytes: 100, bucket: 'issued-bucket', region: 'ap-guangzhou', raw_object_key: 'private/raw',
      expires_at: FUTURE, status: 'issued',
    });
  });

  test('findOwned is bounded and returns persisted location', async () => {
    const db = database();
    expect(await db.repository.findOwned(owner, ID)).toEqual(row());
    expect(db.requests[0]?.url.searchParams.get('limit')).toBe('1');
    expect(db.requests[0]?.url.searchParams.get('select')).not.toContain('*');
  });

  test('conditional updates use primary-key bounds without PATCH limit while reads stay bounded', async () => {
    const db = database([]);
    await db.repository.findOwned(owner, ID);
    await db.repository.claimProcessing(owner, ID, LEASE, NOW);
    await db.repository.markNormalized(owner, ID, normalized, LEASE, NOW);
    await db.repository.markFailed(owner, ID, null, NOW);
    await db.repository.markFailed(owner, ID, LEASE, NOW);
    await db.repository.claimRawCleanup({
      tenantId: ID, id: ID, previousDue: PAST, nextDue: LEASE, status: 'issued', now: NOW,
    });
    await db.repository.markRawDeleted(ID, ID, LEASE, NOW);
    const updates = db.requests.filter((request) => request.method === 'PATCH');
    expect(updates).toHaveLength(7);
    for (const request of updates) {
      expect(request.url.searchParams.get('id')).toBe(`eq.${ID}`);
      expect(request.url.searchParams.has('limit')).toBe(false);
    }
    expect(db.requests[0]?.method).toBe('GET');
    expect(db.requests[0]?.url.searchParams.get('limit')).toBe('1');
  });

  const otherOwners: CustomerInputOwner[] = [
    { ...owner, tenantId: '22222222-2222-4222-8222-222222222222' },
    { ...owner, channel: 'douyin', applicationId: 'app', installationId: ID },
    { ...owner, subjectKeyVersion: 2 }, { ...owner, subjectDigest: 'b'.repeat(64) },
    { ...owner, applicationId: 'other-app' }, { ...owner, installationId: ID },
  ];
  test('every owner boundary hides reads and prevents all customer mutations', async () => {
    for (const other of otherOwners) {
      const db = database();
      expect(await db.repository.findOwned(other, ID)).toBeNull();
      expect(await db.repository.countRecent(other, PAST)).toBe(0);
      expect(await db.repository.claimProcessing(other, ID, LEASE, NOW)).toBe(false);
      expect(await db.repository.markFailed(other, ID, null, NOW)).toBe(false);
      db.rows[0]!.status = 'processing'; db.rows[0]!.processing_lease_expires_at = LEASE;
      expect(await db.repository.markNormalized(other, ID, normalized, LEASE, NOW)).toBe(false);
      expect(await db.repository.markFailed(other, ID, LEASE, NOW)).toBe(false);
    }
    expect(await database([]).repository.findOwned(owner, ID)).toBeNull();
  });

  test('douyin scope is matched explicitly', async () => {
    const douyin = { ...owner, channel: 'douyin' as const, applicationId: 'app', installationId: ID };
    const db = database([row({ channel: 'douyin', application_id: 'app', installation_id: ID })]);
    expect(await db.repository.findOwned(douyin, ID)).not.toBeNull();
    expect(await db.repository.findOwned({ ...douyin, applicationId: 'other' }, ID)).toBeNull();
    expect(await db.repository.findOwned({ ...douyin, installationId: crypto.randomUUID() }, ID)).toBeNull();
  });

  test('counts both frequency windows with HEAD exact count and indexed created_at filter', async () => {
    const db = database();
    for (const since of ['2026-09-13T09:50:00.000Z', '2026-09-12T16:00:00.000Z']) {
      expect(await db.repository.countRecent(owner, since)).toBe(1);
      const request = db.requests.at(-1)!;
      expect(request.method).toBe('HEAD');
      expect(request.headers.get('prefer')).toContain('count=exact');
      expect(request.url.searchParams.get('created_at')).toBe(`gte.${since}`);
      expect(request.url.searchParams.get('select')).toBe('id');
    }
  });

  test('only one concurrent caller can claim issued or reclaim expired processing', async () => {
    for (const value of [row(), row({ status: 'processing', processing_lease_expires_at: PAST })]) {
      const db = database([value]);
      const results = await Promise.all([
        db.repository.claimProcessing(owner, ID, LEASE, NOW),
        db.repository.claimProcessing(owner, ID, FUTURE, NOW),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(db.rows[0]?.processing_lease_expires_at).toBe(results[0] ? LEASE : FUTURE);
    }
  });

  test('active leases, expired issued intents, and deleted raw cannot be claimed', async () => {
    for (const value of [
      row({ status: 'processing', processing_lease_expires_at: LEASE }),
      row({ expires_at: NOW }), row({ raw_deleted_at: PAST }), row({ status: 'pending_review' }),
    ]) expect(await database([value]).repository.claimProcessing(owner, ID, LEASE, NOW)).toBe(false);
  });

  test('recovers expired processing after intent expiry but rejects expired first-time issued claims', async () => {
    const db = database([row({ expires_at: PAST, status: 'processing', processing_lease_expires_at: PAST })]);
    expect(await db.repository.claimProcessing(owner, ID, LEASE, NOW)).toBe(true);
    expect(db.rows[0]?.processing_lease_expires_at).toBe(LEASE);
    expect(await database([row({ expires_at: PAST })]).repository.claimProcessing(owner, ID, LEASE, NOW)).toBe(false);
    expect(await database([row({ expires_at: PAST, status: 'processing', processing_lease_expires_at: LEASE })])
      .repository.claimProcessing(owner, ID, FUTURE, NOW)).toBe(false);
    expect(await database([row({ expires_at: PAST, status: 'processing', processing_lease_expires_at: PAST, raw_deleted_at: PAST })])
      .repository.claimProcessing(owner, ID, LEASE, NOW)).toBe(false);
  });

  test('only current active lease can normalize and replay is read-only', async () => {
    const db = database([row({ status: 'processing', processing_lease_expires_at: LEASE })]);
    expect(await db.repository.markNormalized(owner, ID, normalized, PAST, NOW)).toBe(false);
    expect(await db.repository.markNormalized(owner, ID, normalized, LEASE, FUTURE)).toBe(false);
    expect(await db.repository.markNormalized(owner, ID, normalized, LEASE, NOW)).toBe(true);
    expect(await db.repository.markNormalized(owner, ID, normalized, LEASE, NOW)).toBe(false);
    const result = await db.repository.findOwned(owner, ID);
    expect(result?.status).toBe('pending_review');
    expect(result?.normalized_object_key).toBe(normalized.objectKey);
    expect(result?.processing_lease_expires_at).toBeNull();
  });

  test('failure is issued-only without token and lease-fenced with token', async () => {
    expect(await database().repository.markFailed(owner, ID, null, NOW)).toBe(true);
    const db = database([row({ status: 'processing', processing_lease_expires_at: LEASE })]);
    for (const token of [null, PAST]) expect(await db.repository.markFailed(owner, ID, token, NOW)).toBe(false);
    expect(await db.repository.markFailed(owner, ID, LEASE, FUTURE)).toBe(false);
    expect(await db.repository.markFailed(owner, ID, LEASE, NOW)).toBe(true);
  });

  test('cleanup listing is due-only, ordered and capped at 100', async () => {
    const db = database([row({ raw_cleanup_after: PAST }), row(), row({ raw_cleanup_after: PAST, raw_deleted_at: NOW })]);
    expect(await db.repository.listRawCleanupDue(NOW, 1000)).toHaveLength(1);
    expect(db.requests[0]?.url.searchParams.get('limit')).toBe('100');
    expect(db.requests[0]?.url.searchParams.get('order')).toBe('raw_cleanup_after.asc,id.asc');
    for (const limit of [0, -1, NaN, 1.5]) await expect(db.repository.listRawCleanupDue(NOW, limit)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('cleanup claims compare due and status and fence expired uploads before deletion', async () => {
    for (const status of ['issued', 'processing', 'pending_review', 'approved'] as const) {
      const db = database([row({ status, raw_cleanup_after: PAST, expires_at: PAST, processing_lease_expires_at: PAST })]);
      const claim = { tenantId: ID, id: ID, previousDue: PAST, nextDue: LEASE, status, now: NOW };
      expect(await db.repository.claimRawCleanup(claim)).toBe(true);
      expect(await db.repository.claimRawCleanup(claim)).toBe(false);
      expect(db.rows[0]?.status).toBe(['issued', 'processing'].includes(status) ? 'deleted' : status);
      expect(await db.repository.claimProcessing(owner, ID, FUTURE, NOW)).toBe(false);
      expect(await db.repository.markRawDeleted(ID, ID, PAST, NOW)).toBe(false);
      expect(await db.repository.markRawDeleted(ID, ID, LEASE, NOW)).toBe(true);
    }
  });

  test('cleanup never claims active processing, unexpired issued or future cleanup', async () => {
    for (const value of [
      row({ status: 'processing', raw_cleanup_after: PAST, processing_lease_expires_at: LEASE }),
      row({ raw_cleanup_after: PAST }), row({ expires_at: PAST }),
    ]) {
      expect(await database([value]).repository.claimRawCleanup({ tenantId: ID, id: ID, previousDue: value.raw_cleanup_after,
        nextDue: LEASE, status: value.status, now: NOW })).toBe(false);
    }
  });

  test('database failures and malformed row responses become DB_ERROR', async () => {
    const db = database([], { message: 'private database detail', code: 'XX000' });
    await expect(db.repository.findOwned(owner, ID)).rejects.toMatchObject({ code: 'DB_ERROR' });
    await expect(db.repository.countRecent(owner, PAST)).rejects.toMatchObject({ code: 'DB_ERROR' });
    await expect(database([row({ width: -1 })]).repository.findOwned(owner, ID)).rejects.toMatchObject({ code: 'DB_ERROR' });
    await expect(database([row({ status: 'pending_review' })]).repository.findOwned(owner, ID)).rejects.toMatchObject({ code: 'DB_ERROR' });
  });
});
