import { describe, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const repositoryModulePromise = import('./ocr-recognitions');

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type QueryTrace = {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
};

async function createRepository(results: QueryResult[]) {
  const { OcrRecognitionRepository } = await repositoryModulePromise;
  const traces: QueryTrace[] = [];
  const client = {
    from: mock((table: string) => {
      const trace: QueryTrace = { table, calls: [] };
      traces.push(trace);
      const result = results.shift() ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      for (const method of [
        'select',
        'insert',
        'update',
        'eq',
        'in',
        'gte',
        'lte',
        'order',
        'range',
        'limit',
      ]) {
        builder[method] = mock((...args: unknown[]) => {
          trace.calls.push({ method, args });
          return builder;
        });
      }
      builder.maybeSingle = mock(async () => {
        trace.calls.push({ method: 'maybeSingle', args: [] });
        return result;
      });
      builder.then = (
        resolve: (value: QueryResult) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject);
      return builder;
    }),
  };

  return {
    repository: new OcrRecognitionRepository(() => client as never),
    traces,
  };
}

describe('OcrRecognitionRepository', () => {
  test('creates a processing record with server-owned status', async () => {
    const row = { id: 'recognition-1', status: 'processing' };
    const { repository, traces } = await createRepository([{
      data: row,
      error: null,
    }]);

    const result = await repository.createProcessing({
      tenantId: 'tenant-1',
      actorEmployeeId: 'employee-1',
      scene: 'wechat_pay_applyment',
      documentType: 'business_license',
      providerAction: 'BizLicenseOCR',
      fileObjectId: 'file-1',
      fileChecksum: 'checksum-1',
      subjectType: 'wechat_pay_applyment',
      subjectId: 'applyment-1',
      idempotencyKey: 'idempotency-1',
      dedupeKey: 'dedupe-1',
      expiresAt: '2026-07-23T00:00:00.000Z',
    });

    expect(result).toMatchObject(row);

    expect(traces[0]?.table).toBe('ocr_recognitions');
    expect(traces[0]?.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({
        tenant_id: 'tenant-1',
        status: 'processing',
        provider: 'tencent_cloud',
      })],
    });
  });

  test('scopes idempotency lookup to the tenant', async () => {
    const { repository, traces } = await createRepository([{
      data: null,
      error: null,
    }]);

    await repository.findByTenantAndIdempotencyKey(
      'tenant-1',
      'idempotency-1',
    );

    expect(traces[0]?.calls).toEqual(expect.arrayContaining([
      { method: 'eq', args: ['tenant_id', 'tenant-1'] },
      { method: 'eq', args: ['idempotency_key', 'idempotency-1'] },
    ]));
  });

  test('bounds ownership lookups to the applyment attachment limit', async () => {
    const { repository, traces } = await createRepository([{
      data: [{ id: 'recognition-1', tenant_id: 'tenant-1' }],
      error: null,
    }]);

    await repository.findByIdsForTenant({
      tenantId: 'tenant-1',
      ids: ['recognition-1', 'recognition-2'],
      limit: 100,
    });

    expect(traces[0]?.calls).toEqual(expect.arrayContaining([
      { method: 'eq', args: ['tenant_id', 'tenant-1'] },
      {
        method: 'in',
        args: ['id', ['recognition-1', 'recognition-2']],
      },
      { method: 'limit', args: [20] },
    ]));
  });

  test('uses exact server pagination and excludes ciphertext from platform list', async () => {
    const { repository, traces } = await createRepository([{
      data: [{ id: 'recognition-1' }],
      error: null,
      count: 31,
    }]);

    const result = await repository.listPlatform({
      page: 3,
      pageSize: 10,
      status: 'failed',
      documentType: 'business_license',
    });

    expect(result.pagination).toEqual({
      page: 3,
      pageSize: 10,
      total: 31,
      totalPages: 4,
    });
    const selectCall = traces[0]?.calls.find((call) => call.method === 'select');
    expect(selectCall?.args[0]).not.toContain('result_ciphertext');
    expect(selectCall?.args[1]).toEqual({ count: 'exact' });
    expect(traces[0]?.calls).toContainEqual({ method: 'range', args: [20, 29] });
  });

  test('expires a stale active dedupe record before a new request', async () => {
    const { repository, traces } = await createRepository([{
      data: [{ id: 'recognition-1' }],
      error: null,
    }]);

    await repository.expireStaleByDedupeKey({
      tenantId: 'tenant-1',
      dedupeKey: 'dedupe-1',
      before: '2026-07-22T00:00:00.000Z',
    });

    expect(traces[0]?.calls).toEqual(expect.arrayContaining([
      { method: 'eq', args: ['tenant_id', 'tenant-1'] },
      { method: 'eq', args: ['dedupe_key', 'dedupe-1'] },
      { method: 'in', args: ['status', ['processing', 'succeeded']] },
      { method: 'lte', args: ['expires_at', '2026-07-22T00:00:00.000Z'] },
    ]));
    expect(traces[0]?.calls).toContainEqual({
      method: 'update',
      args: [{ status: 'expired', result_ciphertext: null }],
    });
  });

  test('expires a bounded candidate set and clears ciphertext', async () => {
    const { repository, traces } = await createRepository([
      {
        data: [
          { id: 'recognition-1', expires_at: '2026-07-20T00:00:00.000Z' },
          { id: 'recognition-2', expires_at: '2026-07-20T01:00:00.000Z' },
        ],
        error: null,
      },
      {
        data: [{ id: 'recognition-1' }, { id: 'recognition-2' }],
        error: null,
      },
    ]);

    const result = await repository.expireResultsBefore({
      before: '2026-07-22T00:00:00.000Z',
      limit: 500,
      apply: true,
    });

    expect(result.expiredCount).toBe(2);
    expect(result.oldestExpiresAt).toBe("2026-07-20T00:00:00.000Z");
    expect(traces[0]?.calls).toEqual(expect.arrayContaining([
      { method: 'in', args: ['status', ['processing', 'succeeded']] },
      { method: 'lte', args: ['expires_at', '2026-07-22T00:00:00.000Z'] },
      { method: 'limit', args: [500] },
    ]));
    expect(traces[1]?.calls).toContainEqual({
      method: 'update',
      args: [expect.objectContaining({
        status: 'expired',
        result_ciphertext: null,
      })],
    });
    expect(traces[1]?.calls).toContainEqual({
      method: 'in',
      args: ['id', ['recognition-1', 'recognition-2']],
    });
  });
});
