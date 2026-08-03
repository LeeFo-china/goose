import { beforeEach, describe, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const select = mock((_columns: string, _options?: unknown) => query);
const order = mock((_column: string, _options?: unknown) => query);
const range = mock(
  async (_from: number, _to: number): Promise<{
    data: unknown[];
    error: unknown;
    count: number | null;
  }> => ({ data: [], error: null, count: 0 }),
);
const eq = mock((_column: string, _value: unknown) => query);
const or = mock((_filter: string) => query);
const maybeSingle = mock(
  async (): Promise<{ data: unknown; error: unknown }> => ({
    data: null,
    error: null,
  }),
);
const rpc = mock(
  async (_name: string, _args: Record<string, unknown>) => ({
    data: null,
    error: null,
  }),
);
const query = {
  select,
  order,
  range,
  eq,
  or,
  maybeSingle,
};

mock.module('../utils/supabase/index', () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: () => query,
      rpc,
    }),
  },
}));

describe('PlatformVirtualProductsRepository', () => {
  beforeEach(() => {
    select.mockClear();
    order.mockClear();
    range.mockClear();
    eq.mockClear();
    or.mockClear();
    maybeSingle.mockClear();
    rpc.mockClear();
    range.mockImplementation(async () => ({ data: [], error: null, count: 0 }));
  });

  test('uses bounded pagination and stable ordering for the list', async () => {
    const { platformVirtualProductsRepository, LIST_COLUMNS } = await import(
      './platform-virtual-products'
    );

    await platformVirtualProductsRepository.list({ page: 2, pageSize: 20 });

    expect(select).toHaveBeenCalledWith(LIST_COLUMNS, { count: 'exact' });
    expect(range).toHaveBeenCalledWith(20, 39);
    expect(order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(order).toHaveBeenCalledWith('id', { ascending: false });
  });
});
