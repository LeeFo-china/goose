import { describe, expect, mock, test } from 'bun:test';

mock.module('@gooes/domain', () => ({
  VIRTUAL_BENEFIT_TYPES: ['duration', 'count', 'points', 'quota'] as const,
  VIRTUAL_DURATION_UNITS: ['month', 'year'] as const,
  VIRTUAL_PAYMENT_ENVIRONMENTS: ['sandbox', 'production'] as const,
  VIRTUAL_PRODUCT_STATUSES: ['draft', 'active', 'suspended', 'archived'] as const,
  VIRTUAL_REFUND_TEMPLATES: [
    'duration_before_fulfillment',
    'consumable_unused_full_reverse',
  ] as const,
}));

describe('platform virtual product schemas', () => {
  test('defaults pagination and rejects client-owned identity', async () => {
    const {
      CreatePlatformVirtualProductSchema,
      PlatformVirtualProductListQuerySchema,
    } = await import('./platform-virtual-products');

    expect(PlatformVirtualProductListQuerySchema.parse({})).toMatchObject({
      page: 1,
      pageSize: 20,
    });
    expect(() =>
      PlatformVirtualProductListQuerySchema.parse({ pageSize: 101 }),
    ).toThrow();

    expect(() =>
      CreatePlatformVirtualProductSchema.parse({
        code: 'forged',
        provider_product_id: 'forged',
        name: '次数包',
        product_type: 'count',
        amount_fen: 100,
        image_file_id: crypto.randomUUID(),
        purchase_notes: '',
        refund_template: 'consumable_unused_full_reverse',
        grant_rule: {
          benefit_type: 'count',
          entitlement_code: 'ai.calls',
          grant_amount: 10,
          expiry_mode: 'permanent',
        },
      }),
    ).toThrow();
  });
});
