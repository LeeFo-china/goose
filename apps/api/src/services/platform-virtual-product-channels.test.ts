import { describe, expect, mock, test } from 'bun:test';

import type { AuthContext } from './authorization';
import type {
  QueryVirtualGoodsPublishResult,
  QueryVirtualGoodsUploadResult,
} from './wechat-virtual-payment-gateway-contracts';

mock.module('./access-policy', () => ({
  accessPolicyService: { assertPermission: mock(() => 'all') },
}));
mock.module('./platform-audit-logs', () => ({
  platformAuditLogService: { recordBestEffort: mock(async () => null) },
}));
mock.module('./system-settings', () => ({
  systemSettingsService: {
    getPlatformSecretString: mock(async () =>
      JSON.stringify({ appKey: 'production-secret', revision: 2 })
    ),
  },
}));
mock.module('./wechat-miniprogram-access-token', () => ({
  wechatMiniProgramAccessTokenProvider: {
    getAccessToken: mock(async () => 'access-token-sensitive'),
  },
}));
mock.module('./wechat-virtual-payment-gateway', () => ({
  WechatVirtualPaymentGateway: class {
    queryUploadGoods = mock(async () => uploadTask(0));
    queryPublishGoods = mock(async () => publishTask(0));
    startUploadGoods = mock(async () => ({
      accepted: true as const,
      requestId: 'start-upload-request-id',
      environment: 'production' as const,
    }));
    startPublishGoods = mock(async () => ({
      accepted: true as const,
      requestId: 'start-publish-request-id',
      environment: 'production' as const,
    }));
  },
}));
mock.module('./wechat-mini-session-credentials', () => ({
  wechatMiniSessionCredentialService: { invalidate: mock(async () => null) },
}));

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_USER_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_A = '33333333-3333-4333-8333-333333333333';
const PRODUCT_B = '44444444-4444-4444-8444-444444444444';
const MAPPING_A = '55555555-5555-4555-8555-555555555555';
const CHANNEL_ID = '66666666-6666-4666-8666-666666666666';
const OPERATION_A = '77777777-7777-4777-8777-777777777777';
const IMAGE_URL = 'https://cdn.example.test/virtual-product.png';

const auth = {
  authUserId: AUTH_USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  isPlatformAdmin: true,
  permissions: [
    { code: 'platform.virtual_product.read', scope: 'all' },
    { code: 'platform.virtual_product.publish', scope: 'all' },
  ],
} satisfies Partial<AuthContext>;

const productA = {
  id: PRODUCT_A,
  code: 'branding.annual',
  name: '年度品牌权益',
  product_type: 'duration',
  amount_fen: 19900,
  image_file_id: '88888888-8888-4888-8888-888888888888',
  purchase_notes: '支付后自动开通一年',
  refund_template: 'duration_before_fulfillment',
  status: 'draft',
  version: 5,
  image_url: IMAGE_URL,
  mapping: {
    id: MAPPING_A,
    product_id: PRODUCT_A,
    channel_id: CHANNEL_ID,
    provider_product_id: 'vp_branding_y',
    upload_state: 'not_started',
    publish_state: 'not_started',
    validation_status: 'pending',
    synced_product_version: null,
    remote_snapshot: {},
    last_operation_id: null,
    last_request_id: null,
    last_error_code: null,
    last_error_summary: null,
    version: 2,
  },
  channel: {
    id: CHANNEL_ID,
    provider: 'wechat_virtual',
    environment: 'production',
    app_id: 'wx-app',
    offer_id: 'offer-id',
    encrypted_secret_ref: 'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE',
    secret_revision: 2,
    status: 'active',
  },
};

const terminalProductA = {
  ...productA,
  mapping: {
    ...productA.mapping,
    upload_state: 'succeeded',
    publish_state: 'succeeded',
    validation_status: 'valid',
    synced_product_version: productA.version,
  },
};

const operationForProductA = {
  id: OPERATION_A,
  product_id: PRODUCT_A,
  mapping_id: MAPPING_A,
  channel_id: CHANNEL_ID,
  product_version: productA.version,
  phase: 'upload',
  state: 'processing',
  request_snapshot_hash: 'a'.repeat(64),
};

const operationForProductB = {
  ...operationForProductA,
  id: '99999999-9999-4999-8999-999999999999',
  product_id: PRODUCT_B,
};

function uploadTask(
  status: 0 | 1 | 2 | 3,
  items: QueryVirtualGoodsUploadResult['items'] = [],
): QueryVirtualGoodsUploadResult {
  return {
    requestId: 'upload-request-id',
    environment: 'production',
    status,
    items,
  };
}

function publishTask(
  status: 0 | 1 | 2 | 3,
  items: QueryVirtualGoodsPublishResult['items'] = [],
): QueryVirtualGoodsPublishResult {
  return {
    requestId: 'publish-request-id',
    environment: 'production',
    status,
    items,
  };
}

function createFixture(options: {
  snapshot?: unknown;
  running?: unknown;
  upload?: QueryVirtualGoodsUploadResult;
  publish?: QueryVirtualGoodsPublishResult;
} = {}) {
  const getSnapshot = mock(async () => options.snapshot ?? productA);
  const findRunningByChannel = mock(async () => options.running ?? null);
  const begin = mock(async () => operationForProductA);
  const finish = mock(async () => ({ operation: operationForProductA }));
  const getPlatformSecretString = mock(async () =>
    JSON.stringify({ appKey: 'production-secret', revision: 2 })
  );
  const assertPermission = mock(() => 'all' as const);
  const recordBestEffort = mock(async () => null);
  const getAccessToken = mock(async () => 'access-token-sensitive');
  const queryUploadGoods = mock(async () => options.upload ?? uploadTask(0));
  const queryPublishGoods = mock(async () => options.publish ?? publishTask(0));
  const startUploadGoods = mock(async () => ({
    accepted: true as const,
    requestId: 'start-upload-request-id',
    environment: 'production' as const,
  }));
  const startPublishGoods = mock(async () => ({
    accepted: true as const,
    requestId: 'start-publish-request-id',
    environment: 'production' as const,
  }));

  return {
    serviceFactory: async () => {
      const { PlatformVirtualProductChannelsService } = await import(
        './platform-virtual-product-channels'
      );
      return new PlatformVirtualProductChannelsService({
        operations: {
          getSnapshot,
          findRunningByChannel,
          begin,
          finish,
        } as never,
        settingsService: { getPlatformSecretString } as never,
        accessPolicy: { assertPermission } as never,
        audit: { recordBestEffort } as never,
        accessTokenProvider: { getAccessToken },
        gateway: {
          queryUploadGoods,
          queryPublishGoods,
          startUploadGoods,
          startPublishGoods,
        },
      });
    },
    begin,
    finish,
    assertPermission,
    queryUploadGoods,
    queryPublishGoods,
    startUploadGoods,
    startPublishGoods,
  };
}

describe('PlatformVirtualProductChannelsService', () => {
  test('does not let the newest remote task overwrite another product', async () => {
    const fixture = createFixture({ running: operationForProductB });
    const service = await fixture.serviceFactory();

    await expect(
      service.refresh(auth as AuthContext, PRODUCT_A, 'production'),
    ).rejects.toMatchObject({
      code: 'VIRTUAL_PRODUCT_CHANNEL_TASK_PENDING',
    });
    expect(fixture.finish).not.toHaveBeenCalled();
  });

  test('refresh is read-only when local evidence is terminal', async () => {
    const fixture = createFixture({ snapshot: terminalProductA });
    const service = await fixture.serviceFactory();

    expect(
      await service.refresh(auth as AuthContext, PRODUCT_A, 'production'),
    ).toEqual(terminalProductA);
    expect(fixture.queryUploadGoods).not.toHaveBeenCalled();
    expect(fixture.queryPublishGoods).not.toHaveBeenCalled();
  });

  test('maps out-of-band remote evidence to unknown for the owned running task', async () => {
    const fixture = createFixture({
      running: operationForProductA,
      upload: uploadTask(3, [{
        id: 'other_goods_id',
        name: '其他商品',
        price: 19900,
        remark: '支付后自动开通一年',
        itemUrl: IMAGE_URL,
        uploadStatus: 2,
      }]),
    });
    const service = await fixture.serviceFactory();

    await service.refresh(auth as AuthContext, PRODUCT_A, 'production');

    expect(fixture.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: OPERATION_A,
        state: 'unknown',
        failureCode: 'VIRTUAL_PRODUCT_REMOTE_GOODS_MISMATCH',
      }),
    );
  });

  test('production upload requires publish permission and uses database snapshot', async () => {
    const fixture = createFixture();
    const service = await fixture.serviceFactory();

    await service.startUpload(auth as AuthContext, PRODUCT_A, 'production', {
      version: 5,
    });

    expect(fixture.assertPermission).toHaveBeenCalledWith(
      auth,
      'platform.virtual_product.publish',
    );
    expect(fixture.startUploadGoods).toHaveBeenCalledWith(
      expect.objectContaining({
        item: {
          id: 'vp_branding_y',
          name: '年度品牌权益',
          price: 19900,
          remark: '支付后自动开通一年',
          itemUrl: IMAGE_URL,
        },
      }),
    );
  });

  test('publish starts from the database mapping id and product version', async () => {
    const fixture = createFixture({
      snapshot: {
        ...productA,
        mapping: { ...productA.mapping, upload_state: 'succeeded' },
      },
    });
    const service = await fixture.serviceFactory();

    await service.startPublish(auth as AuthContext, PRODUCT_A, 'production', {
      version: 5,
    });

    expect(fixture.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        mappingId: MAPPING_A,
        productVersion: 5,
        phase: 'publish',
      }),
    );
    expect(fixture.startPublishGoods).toHaveBeenCalledWith(
      expect.objectContaining({ providerProductId: 'vp_branding_y' }),
    );
  });
});
