import { beforeEach, describe, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const maybeSingle = mock(async (): Promise<{ data: unknown; error: unknown }> => ({
  data: null,
  error: null,
}));
const select = mock((_columns: string) => query);
const eq = mock((_column: string, _value: unknown) => query);
const inFilter = mock((_column: string, _value: readonly unknown[]) => query);
const order = mock((_column: string, _options: unknown) => query);
const limit = mock((_count: number) => query);
const rpc = mock(async (_name: string, _args: Record<string, unknown>) => ({
  data: null,
  error: null,
}));
const query = { select, eq, in: inFilter, order, limit, maybeSingle };

mock.module('../utils/supabase/index', () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: () => query,
      rpc,
    }),
  },
}));

describe('PlatformVirtualGoodsOperationsRepository', () => {
  beforeEach(() => {
    maybeSingle.mockClear();
    select.mockClear();
    eq.mockClear();
    inFilter.mockClear();
    order.mockClear();
    limit.mockClear();
    rpc.mockClear();
  });

  test('loads a product-channel snapshot by product and environment', async () => {
    const { platformVirtualGoodsOperationsRepository } = await import(
      './platform-virtual-goods-operations'
    );

    await platformVirtualGoodsOperationsRepository.getSnapshot(
      'product-id',
      'production',
    );

    expect(select).toHaveBeenCalledWith(
      expect.stringContaining('platform_virtual_product_mappings'),
    );
    expect(eq).toHaveBeenCalledWith('id', 'product-id');
    expect(eq).toHaveBeenCalledWith(
      'platform_virtual_product_mappings.channel.environment',
      'production',
    );
    expect(maybeSingle).toHaveBeenCalled();
  });

  test('delegates begin and finish to service-role RPCs', async () => {
    const { platformVirtualGoodsOperationsRepository } = await import(
      './platform-virtual-goods-operations'
    );

    await platformVirtualGoodsOperationsRepository.begin({
      mappingId: 'mapping-id',
      productVersion: 3,
      phase: 'upload',
      requestSnapshotHash: 'a'.repeat(64),
    });
    await platformVirtualGoodsOperationsRepository.finish({
      operationId: 'operation-id',
      state: 'succeeded',
      requestId: 'request-id',
      normalizedResult: { ok: true },
      failureCode: null,
      failureSummary: null,
      syncedProductVersion: 3,
    });

    expect(rpc).toHaveBeenCalledWith('platform_begin_virtual_goods_operation', {
      p_mapping_id: 'mapping-id',
      p_product_version: 3,
      p_phase: 'upload',
      p_request_snapshot_hash: 'a'.repeat(64),
    });
    expect(rpc).toHaveBeenCalledWith('platform_finish_virtual_goods_operation', {
      p_operation_id: 'operation-id',
      p_state: 'succeeded',
      p_request_id: 'request-id',
      p_normalized_result: { ok: true },
      p_failure_code: null,
      p_failure_summary: null,
      p_synced_product_version: 3,
    });
  });
});
