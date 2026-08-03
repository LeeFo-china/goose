import { beforeAll, describe, expect, mock, test } from 'bun:test';

import type { AuthContext } from './authorization';
import { BRANDING_ADDON_PRODUCT_CODE } from './branding-addon-contracts';
import type { PlatformVirtualProductChannelSnapshot } from
  '../repositories/platform-virtual-goods-operations';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

type ServiceConstructor = typeof import(
  './branding-virtual-product-compatibility'
)['BrandingVirtualProductCatalogCompatibilityService'];

let BrandingVirtualProductCatalogCompatibilityService: ServiceConstructor;

beforeAll(async () => {
  ({ BrandingVirtualProductCatalogCompatibilityService } = await import(
    './branding-virtual-product-compatibility'
  ));
});

const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const PROVIDER_PRODUCT_ID = 'branding-annual';

const platformAuth = {
  authUserId: '11111111-1111-4111-8111-111111111111',
  employeeId: '22222222-2222-4222-8222-222222222222',
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: '平台管理员',
  employeeStatus: 'active',
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ['platform_admin'],
  roles: [],
  permissions: [{ code: 'platform.virtual_product.publish', scope: 'all' }],
} satisfies AuthContext;

const catalogProduct = {
  id: PRODUCT_ID,
  code: BRANDING_ADDON_PRODUCT_CODE,
  name: '年度品牌技术支持',
  product_type: 'duration',
  amount_fen: 9_900,
  currency: 'CNY',
  image_file_id: '33333333-3333-4333-8333-333333333333',
  image: {
    public_url: 'https://cdn.example.test/current-branding.png',
  },
  purchase_notes: '支付成功后自动开通一年',
  refund_template: 'duration_before_fulfillment',
  status: 'active',
  version: 4,
  created_at: '2026-07-28T00:00:00.000Z',
  updated_at: '2026-08-03T00:00:00.000Z',
  grant_rule: {
    entitlement_code: 'custom_support_branding',
    benefit_type: 'duration',
    duration_value: 1,
    duration_unit: 'year',
  },
  mappings: [{
    id: '55555555-5555-4555-8555-555555555555',
    product_id: PRODUCT_ID,
    channel_id: '66666666-6666-4666-8666-666666666666',
    provider_product_id: PROVIDER_PRODUCT_ID,
    upload_state: 'succeeded',
    publish_state: 'succeeded',
    validation_status: 'valid',
    synced_product_version: 4,
    last_operation_id: null,
    last_request_id: null,
    last_error_code: null,
    last_error_summary: null,
    remote_snapshot: {
      item_url: 'https://cdn.example.test/stale-branding.png',
      validated_at: '2026-08-03T00:00:00.000Z',
    },
    version: 8,
    created_at: '2026-07-31T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
    channel: {
      id: '66666666-6666-4666-8666-666666666666',
      provider: 'wechat_virtual' as const,
      environment: 'production' as const,
      app_id: 'wx-app',
      virtual_merchant_id: 'virtual-merchant',
      offer_id: 'offer-annual',
      encrypted_secret_ref:
        'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE',
      secret_revision: 2,
      status: 'active' as const,
      version: 3,
      created_at: '2026-07-31T00:00:00.000Z',
      updated_at: '2026-08-03T00:00:00.000Z',
    },
  }],
};

const channelSnapshot = {
  id: PRODUCT_ID,
  code: BRANDING_ADDON_PRODUCT_CODE,
  name: catalogProduct.name,
  product_type: 'duration',
  amount_fen: catalogProduct.amount_fen,
  image_file_id: catalogProduct.image_file_id,
  purchase_notes: catalogProduct.purchase_notes,
  refund_template: catalogProduct.refund_template,
  status: catalogProduct.status,
  version: catalogProduct.version,
  image_url: 'https://cdn.example.test/branding.png',
  mapping: catalogProduct.mappings[0]!,
  channel: catalogProduct.mappings[0]!.channel,
} satisfies PlatformVirtualProductChannelSnapshot;

function createFixture(product: unknown = catalogProduct) {
  const findByCode = mock(async () => product);
  const manageAnnualCompatibility = mock(async () => ({ ok: true }));
  const refresh = mock(async () => channelSnapshot);
  const startUpload = mock(async () => channelSnapshot);
  const startPublish = mock(async () => channelSnapshot);
  const validate = mock(async () => channelSnapshot);
  const service = new BrandingVirtualProductCatalogCompatibilityService({
    catalogRepository: { findByCode, manageAnnualCompatibility },
    channelService: { refresh, startUpload, startPublish, validate },
  });
  return {
    service,
    findByCode,
    manageAnnualCompatibility,
    refresh,
    startUpload,
    startPublish,
    validate,
  };
}

describe('BrandingVirtualProductCatalogCompatibilityService', () => {
  test('reads the annual product and preserved channel identity from the generic catalog', async () => {
    const fixture = createFixture();

    const result = await fixture.service.getSnapshot();

    expect(fixture.findByCode).toHaveBeenCalledWith(BRANDING_ADDON_PRODUCT_CODE);
    expect(result.product.id).toBe(PRODUCT_ID);
    expect(result.product.purchase_mode).toBe('wechat_virtual');
    expect(result.mappings[0]?.provider_product_id).toBe(PROVIDER_PRODUCT_ID);
    expect(result.mappings[0]?.provider_product_id).not.toMatch(/^vp_/);
    expect(result.mappings[0]?.version).toBe(3);
    expect(result.mappings[0]?.item_url).toBe(
      'https://cdn.example.test/current-branding.png',
    );
  });

  test('delegates legacy channel actions to the generic service for the annual product only', async () => {
    const fixture = createFixture();

    await fixture.service.refreshChannel(platformAuth, 'production');
    await fixture.service.startUpload(platformAuth, 'production', { version: 3 });
    await fixture.service.startPublish(platformAuth, 'production', { version: 3 });
    const validation = await fixture.service.validate(
      platformAuth,
      'production',
      { version: 3 },
    );

    expect(fixture.refresh).toHaveBeenCalledWith(
      platformAuth,
      PRODUCT_ID,
      'production',
    );
    expect(fixture.startUpload).toHaveBeenCalledWith(
      platformAuth,
      PRODUCT_ID,
      'production',
      { version: 4 },
    );
    expect(fixture.startPublish).toHaveBeenCalledWith(
      platformAuth,
      PRODUCT_ID,
      'production',
      { version: 4 },
    );
    expect(fixture.validate).toHaveBeenCalledWith(
      platformAuth,
      PRODUCT_ID,
      'production',
      { version: 4 },
    );
    expect(validation).toEqual({
      virtual_product: expect.objectContaining({
        environment: 'production',
        provider_product_id: PROVIDER_PRODUCT_ID,
        version: 3,
      }),
      validation: {
        kind: 'wechat_goods',
        validated_at: '2026-08-03T00:00:00.000Z',
        request_ids: { upload: null, publish: null },
      },
    });
  });

  test('rejects a stale legacy mapping version before invoking the generic channel service', async () => {
    const fixture = createFixture();

    await expect(fixture.service.startUpload(
      platformAuth,
      'production',
      { version: 2 },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: 'BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT',
    });
    expect(fixture.startUpload).not.toHaveBeenCalled();
  });

  test('keeps the legacy goods-status response shape', async () => {
    const fixture = createFixture();

    const result = await fixture.service.refreshChannel(
      platformAuth,
      'production',
    );

    expect(result).toEqual({
      environment: 'production',
      mapping_version: 3,
      upload: {
        state: 'succeeded',
        task_status: 3,
        item_status: 2,
        request_id: null,
      },
      publish: {
        state: 'succeeded',
        task_status: 3,
        item_status: 2,
        request_id: null,
      },
      next_action: 'validate',
      poll_after_ms: null,
    });
  });

  test('writes legacy settings through the generic compatibility command', async () => {
    const fixture = createFixture();

    const result = await fixture.service.updateConfiguration({
      expectedProductVersion: 4,
      productPatch: { purchase_mode: 'maintenance' },
      virtualProductPatch: {
        environment: 'production',
        provider_product_id: PROVIDER_PRODUCT_ID,
        version: 3,
      },
      actorEmployeeId: platformAuth.employeeId!,
    });

    expect(fixture.manageAnnualCompatibility).toHaveBeenCalledWith({
      expectedProductVersion: 4,
      purchaseMode: 'maintenance',
      virtualProductPatch: {
        environment: 'production',
        provider_product_id: PROVIDER_PRODUCT_ID,
        version: 3,
      },
      actorEmployeeId: platformAuth.employeeId!,
    });
    expect(result.product.id).toBe(PRODUCT_ID);
    expect(result.virtual_product?.provider_product_id)
      .toBe(PROVIDER_PRODUCT_ID);
  });

  test('returns the stable legacy not-found error when the catalog row is missing', async () => {
    const fixture = createFixture(null);

    await expect(fixture.service.getSnapshot()).rejects.toMatchObject({
      statusCode: 404,
      code: 'BRANDING_ADDON_PRODUCT_NOT_FOUND',
    });
  });
});
