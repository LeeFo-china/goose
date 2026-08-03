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
const is = mock((_column: string, _value: null) => query);
const or = mock((_filter: string) => query);
const maybeSingle = mock(
  async (): Promise<{ data: unknown; error: unknown }> => ({
    data: null,
    error: null,
  }),
);
const rpc = mock(
  async (
    _name: string,
    _args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }> => ({
    data: null,
    error: null,
  }),
);
const query = {
  select,
  order,
  range,
  eq,
  is,
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
    is.mockClear();
    or.mockClear();
    maybeSingle.mockClear();
    rpc.mockClear();
    range.mockImplementation(async () => ({ data: [], error: null, count: 0 }));
    rpc.mockImplementation(async () => ({ data: null, error: null }));
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

  test('finds the annual compatibility product by immutable code', async () => {
    const { platformVirtualProductsRepository } = await import(
      './platform-virtual-products'
    );

    await platformVirtualProductsRepository.findByCode(
      'custom_support_branding_annual',
    );

    expect(eq).toHaveBeenCalledWith('code', 'custom_support_branding_annual');
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
  });

  test('accepts only completed platform virtual-goods image uploads', async () => {
    const { platformVirtualProductsRepository } = await import(
      './platform-virtual-products'
    );

    await platformVirtualProductsRepository.isUsablePlatformFile(
      '33333333-3333-4333-8333-333333333333',
    );

    expect(is).toHaveBeenCalledWith('tenant_id', null);
    expect(eq).toHaveBeenCalledWith('owner_type', 'branding_virtual_goods');
    expect(eq).toHaveBeenCalledWith('scene', 'branding_virtual_goods');
    expect(eq).toHaveBeenCalledWith('visibility', 'public');
    expect(eq).toHaveBeenCalledWith('width', 200);
    expect(eq).toHaveBeenCalledWith('height', 200);
    expect(eq).toHaveBeenCalledWith('status', 'active');
    expect(is).toHaveBeenCalledWith('deleted_at', null);
  });

  test('uses the generic compatibility command for legacy settings writes', async () => {
    const { platformVirtualProductsRepository } = await import(
      './platform-virtual-products'
    );

    await platformVirtualProductsRepository.manageAnnualCompatibility({
      expectedProductVersion: 4,
      purchaseMode: 'maintenance',
      virtualProductPatch: {
        environment: 'production',
        provider_product_id: 'branding-annual',
        version: 3,
      },
      actorEmployeeId: '11111111-1111-4111-8111-111111111111',
    });

    expect(rpc).toHaveBeenCalledWith(
      'platform_manage_annual_virtual_payment_compatibility',
      {
        p_expected_product_version: 4,
        p_purchase_mode: 'maintenance',
        p_virtual_product_patch: {
          environment: 'production',
          provider_product_id: 'branding-annual',
          version: 3,
        },
        p_actor_employee_id: '11111111-1111-4111-8111-111111111111',
      },
    );
  });

  test('maps compatibility command conflicts to stable application errors', async () => {
    const { platformVirtualProductsRepository } = await import(
      './platform-virtual-products'
    );
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { code: 'P0001', message: 'VIRTUAL_PRODUCT_CHANNEL_ID_IMMUTABLE' },
    }));

    await expect(platformVirtualProductsRepository.manageAnnualCompatibility({
      expectedProductVersion: 4,
      virtualProductPatch: {},
      actorEmployeeId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'VIRTUAL_PRODUCT_CHANNEL_ID_IMMUTABLE',
    });
  });
});
