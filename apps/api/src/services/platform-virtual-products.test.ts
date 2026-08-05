import { describe, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

mock.module('./access-policy', () => ({
  accessPolicyService: {
    assertPermission: mock(() => 'all'),
  },
}));

const auth = {
  authUserId: crypto.randomUUID(),
  isPlatformAdmin: true,
  isPlatformStaff: true,
  tenantId: null,
  employeeId: crypto.randomUUID(),
  permissions: [{ code: 'platform.virtual_product.manage', scope: 'all' }],
};

const productId = crypto.randomUUID();

describe('PlatformVirtualProductsService', () => {
  test('requires manage permission before creating a product', async () => {
    const { PlatformVirtualProductsService } = await import(
      './platform-virtual-products'
    );
    const repository = {
      create: mock(async () => ({})),
      isUsablePlatformFile: mock(async () => true),
    };
    const accessPolicy = {
      assertPermission: mock(() => 'all'),
    };
    const service = new PlatformVirtualProductsService({
      repository: repository as never,
      accessPolicy: accessPolicy as never,
    });

    await service.create(auth as never, {
      name: 'AI 次数包',
      product_type: 'count',
      amount_fen: 9900,
      image_file_id: crypto.randomUUID(),
      purchase_notes: '',
      refund_template: 'consumable_unused_full_reverse',
      grant_rule: {
        benefit_type: 'count',
        entitlement_code: 'ai.calls',
        grant_amount: 100,
        expiry_mode: 'permanent',
      },
    });

    expect(accessPolicy.assertPermission).toHaveBeenCalledWith(
      auth,
      'platform.virtual_product.manage',
    );
    expect(repository.create).toHaveBeenCalled();
  });

  test('blocks activation until production mapping is valid and synced', async () => {
    const { PlatformVirtualProductsService } = await import(
      './platform-virtual-products'
    );
    const repository = {
      getDetail: mock(async () => ({
        id: productId,
        version: 2,
        mappings: [
          {
            channel: { environment: 'production' },
            validation_status: 'pending',
            synced_product_version: null,
          },
        ],
      })),
      transition: mock(async () => ({})),
    };
    const service = new PlatformVirtualProductsService({
      repository: repository as never,
      accessPolicy: { assertPermission: mock(() => 'all') } as never,
    });

    await expect(
      service.activate(auth as never, productId, { version: 2 }),
    ).rejects.toMatchObject({ code: 'VIRTUAL_PRODUCT_NOT_READY' });
    expect(repository.transition).not.toHaveBeenCalled();
  });
});
