import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPayOrderRecord } from "@/repositories/wechat-pay-orders";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";
import {
  activeConfig,
  authContext,
  paymentCollectionTask,
  paymentConfigId,
  pendingOrder,
  platformPaymentConfigId as platformConfigId,
  projectId,
  receivablePlan,
  receivablePlanId,
  serviceProviderPlatformConfig as centralProfile,
  tenantId,
  workflowTaskId,
} from "./wechat-pay-orders.test-helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const serviceProviderConfig: WechatPayConfigRecord = {
  ...activeConfig,
  platform_payment_config_id: platformConfigId,
  merchant_mode: "service_provider_sub_merchant",
  merchant_name: "晴天装饰",
  merchant_id: centralProfile.merchant_id,
  sub_merchant_id: "sub-merchant-mchid",
  app_id: centralProfile.app_id,
  sub_app_id: null,
  applyment_state: "opened",
  appid_binding_state: "bound",
  encrypted_config_ref: centralProfile.encrypted_config_ref,
  serial_no: centralProfile.serial_no,
  notify_url: centralProfile.notify_url,
  validation_status: "valid",
  last_validated_at: centralProfile.last_validated_at,
};

const findPendingByWorkflowTask = mock(
  async (): Promise<WechatPayOrderRecord | null> => null,
);
const createOrder = mock(async (input: Record<string, unknown>) => ({
  ...pendingOrder,
  ...input,
  id: "88888888-8888-4888-8888-888888888888",
}));
const markPrepayCreated = mock(async (input: { orderId: string; prepayId: string }) => ({
  ...pendingOrder,
  id: input.orderId,
  payer_openid: "o-test-openid",
  prepay_id: input.prepayId,
}));
const findWechatPayConfig = mock(
  async (): Promise<WechatPayConfigRecord | null> => serviceProviderConfig,
);
const findPlatformConfigById = mock(
  async (): Promise<PlatformPaymentConfigRecord | null> => centralProfile,
);
const loadSecretBundle = mock(async (): Promise<WechatPaySecretBundle> => ({
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: "wechat-public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "bundle-revision-1",
}));
const createJsapiPrepay = mock(async () => ({
  prepayId: "prepay-test",
  paymentRequest: {
    timeStamp: "1782873600",
    nonceStr: "nonce",
    package: "prepay_id=prepay-test",
    signType: "RSA" as const,
    paySign: "pay-sign",
  },
}));
const createMiniProgramPaymentRequest = mock(() => ({
  timeStamp: "1782873601",
  nonceStr: "retry-nonce",
  package: "prepay_id=existing-prepay",
  signType: "RSA" as const,
  paySign: "retry-pay-sign",
}));

async function createService() {
  const { WechatPayOrderService } = await import("./wechat-pay-orders");
  return new WechatPayOrderService({
    orderRepository: {
      findPendingByWorkflowTask,
      findReceivablePlan: mock(async () => receivablePlan),
      createOrder,
      markPrepayCreated,
      listOrders: mock(async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      })),
    },
    workflowTaskRepository: {
      findById: mock(async () => paymentCollectionTask),
    },
    configRepository: {
      findWechatPayConfig,
    },
    platformPaymentConfigRepository: {
      findWechatPayConfigById: findPlatformConfigById,
    },
    secretBundleService: {
      load: loadSecretBundle,
    },
    wechatPayGateway: {
      createJsapiPrepay,
      createMiniProgramPaymentRequest,
    },
    accessPolicyService: {
      assertTenantContext: mock(() => tenantId),
      hasPermission: mock(() => true),
    },
    tradeNoFactory: () => "WX202607010999",
  });
}

const orderInput = {
  project_id: projectId,
  receivable_plan_id: receivablePlanId,
  workflow_task_id: workflowTaskId,
  amount: 8000,
  payer_openid: "o-test-openid",
};

describe("WechatPayOrderService platform profile provenance", () => {
  beforeEach(() => {
    findPendingByWorkflowTask.mockClear();
    createOrder.mockClear();
    markPrepayCreated.mockClear();
    findWechatPayConfig.mockClear();
    findPlatformConfigById.mockClear();
    loadSecretBundle.mockClear();
    createJsapiPrepay.mockClear();
    createMiniProgramPaymentRequest.mockClear();
    findPendingByWorkflowTask.mockImplementation(async () => null);
    findWechatPayConfig.mockImplementation(async () => serviceProviderConfig);
    findPlatformConfigById.mockImplementation(async () => centralProfile);
    loadSecretBundle.mockImplementation(async () => ({
      privateKeyPem: "private-key",
      apiV3Key: "api-v3-key",
      wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
      wechatPayPublicKeyPem: "wechat-public-key",
      baseUrl: "https://api.mch.weixin.qq.com",
      revision: "bundle-revision-1",
    }));
  });

  test.each(["unchecked", "invalid"] as const)(
    "rejects a %s central profile before inserting an order",
    async (validationStatus) => {
      findPlatformConfigById.mockImplementationOnce(async () => ({
        ...centralProfile,
        validation_status: validationStatus,
      }));
      const service = await createService();

      await expect(service.createOrder(authContext(), orderInput)).rejects.toMatchObject({
        statusCode: 409,
        code: "WECHAT_PAY_PLATFORM_PROFILE_NOT_READY",
        details: {
          profile_code: "tenant_service_provider",
          blocker_codes: ["PLATFORM_PAYMENT_CONFIG_NOT_VALIDATED"],
        },
      });

      expect(createOrder).not.toHaveBeenCalled();
      expect(loadSecretBundle).not.toHaveBeenCalled();
      expect(createJsapiPrepay).not.toHaveBeenCalled();
    },
  );

  test("rejects a service-provider tenant config without central provenance", async () => {
    findWechatPayConfig.mockImplementationOnce(async () => ({
      ...serviceProviderConfig,
      platform_payment_config_id: null,
    }));
    const service = await createService();

    await expect(service.createOrder(authContext(), orderInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_PLATFORM_PROFILE_PROVENANCE_REQUIRED",
    });

    expect(findPlatformConfigById).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  test("rejects tenant metadata that no longer matches the central profile", async () => {
    findWechatPayConfig.mockImplementationOnce(async () => ({
      ...serviceProviderConfig,
      serial_no: "STALE-SERIAL",
    }));
    const service = await createService();

    await expect(service.createOrder(authContext(), orderInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_PLATFORM_PROFILE_MISMATCH",
      details: { mismatch_fields: ["serial_no"] },
    });

    expect(createOrder).not.toHaveBeenCalled();
    expect(loadSecretBundle).not.toHaveBeenCalled();
  });

  test("rejects a tenant sub AppID that is absent from the central profile", async () => {
    findWechatPayConfig.mockImplementationOnce(async () => ({
      ...serviceProviderConfig,
      sub_app_id: "stale-sub-appid",
    }));
    const service = await createService();

    await expect(service.createOrder(authContext(), orderInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_PLATFORM_PROFILE_MISMATCH",
      details: { mismatch_fields: ["sub_app_id"] },
    });

    expect(createOrder).not.toHaveBeenCalled();
    expect(loadSecretBundle).not.toHaveBeenCalled();
  });

  test("rejects a secret bundle revision mismatch before inserting an order", async () => {
    loadSecretBundle.mockImplementationOnce(async () => ({
      privateKeyPem: "private-key",
      apiV3Key: "api-v3-key",
      wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
      wechatPayPublicKeyPem: "wechat-public-key",
      baseUrl: "https://api.mch.weixin.qq.com",
      revision: "stale-bundle-revision",
    }));
    const service = await createService();

    await expect(service.createOrder(authContext(), orderInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_SECRET_BUNDLE_REVISION_MISMATCH",
    });

    expect(createOrder).not.toHaveBeenCalled();
    expect(createJsapiPrepay).not.toHaveBeenCalled();
  });

  test("creates a service-provider order with a ready matching central profile", async () => {
    const service = await createService();

    const result = await service.createOrder(authContext(), orderInput);

    expect(findPlatformConfigById).toHaveBeenCalledWith(platformConfigId);
    expect(loadSecretBundle).toHaveBeenCalledWith(centralProfile.encrypted_config_ref);
    expect(createOrder).toHaveBeenCalledWith(expect.objectContaining({
      payment_config_id: paymentConfigId,
      metadata: expect.objectContaining({
        principal_type: "tenant",
        merchant_mode: "service_provider_sub_merchant",
        merchant_id: centralProfile.merchant_id,
        sub_merchant_id: "sub-merchant-mchid",
        app_id: centralProfile.app_id,
        sub_app_id: null,
      }),
    }));
    expect(createJsapiPrepay).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({ sub_app_id: null }),
      secretBundle: expect.objectContaining({ revision: "bundle-revision-1" }),
    }));
    expect(result.idempotent).toBe(false);
  });

  test("checks the central profile before re-signing an existing order", async () => {
    findPendingByWorkflowTask.mockImplementationOnce(async () => ({
      ...pendingOrder,
      payer_openid: "o-test-openid",
      prepay_id: "existing-prepay",
    }));
    findPlatformConfigById.mockImplementationOnce(async () => ({
      ...centralProfile,
      status: "suspended",
    }));
    const service = await createService();

    await expect(service.createOrder(authContext(), orderInput)).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_PLATFORM_PROFILE_NOT_READY",
      details: {
        blocker_codes: ["PLATFORM_PAYMENT_CONFIG_INACTIVE"],
      },
    });

    expect(createMiniProgramPaymentRequest).not.toHaveBeenCalled();
    expect(createJsapiPrepay).not.toHaveBeenCalled();
  });
});
