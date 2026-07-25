import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";
import {
  activeConfig,
  paymentConfigId,
  serviceProviderPlatformConfig,
  tenantId,
} from "./wechat-pay-orders.test-helpers";
import type {
  CustomerWechatPaySmokeOrderRecord,
} from "@/repositories/customer-wechat-pay-smoke";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const customerId = "99999999-9999-4999-8999-999999999999";
const smokeOrderId = "88888888-8888-4888-8888-888888888888";
const createdAt = "2026-07-25T13:30:00.000Z";
const paidAt = "2026-07-25T13:31:00+08:00";

const serviceProviderTenantConfig = {
  ...activeConfig,
  merchant_mode: "service_provider_sub_merchant",
  merchant_id: serviceProviderPlatformConfig.merchant_id,
  sub_merchant_id: "sub-mchid-1",
  app_id: serviceProviderPlatformConfig.app_id,
  sub_app_id: null,
  applyment_state: "opened",
  appid_binding_state: "bound",
  platform_payment_config_id: serviceProviderPlatformConfig.id,
  encrypted_config_ref: serviceProviderPlatformConfig.encrypted_config_ref,
  serial_no: serviceProviderPlatformConfig.serial_no,
  notify_url: serviceProviderPlatformConfig.notify_url,
  validation_status: "valid",
  last_validated_at: serviceProviderPlatformConfig.last_validated_at,
  enabled_channels: serviceProviderPlatformConfig.enabled_channels,
};

const pendingSmokeOrder: CustomerWechatPaySmokeOrderRecord = {
  id: smokeOrderId,
  tenant_id: tenantId,
  customer_id: customerId,
  payment_config_id: paymentConfigId,
  out_trade_no: "CS20260725133000ABCD1234",
  idempotency_key: null,
  amount_fen: 100,
  paid_amount_fen: 0,
  currency: "CNY",
  status: "pending",
  payer_openid: "o-customer-openid",
  prepay_id: null,
  transaction_id: null,
  trade_state: null,
  trade_state_desc: null,
  paid_at: null,
  closed_at: null,
  failed_at: null,
  failure_reason: null,
  latest_notification_id: null,
  metadata: {},
  created_at: createdAt,
  updated_at: createdAt,
};

const findByIdempotencyKey = mock(
  async (): Promise<CustomerWechatPaySmokeOrderRecord | null> => null,
);
const createOrder = mock(
  async (input: Record<string, unknown>) => ({
    ...pendingSmokeOrder,
    ...input,
    id: smokeOrderId,
    created_at: createdAt,
    updated_at: createdAt,
  }) as CustomerWechatPaySmokeOrderRecord,
);
const markPrepayCreated = mock(async (input: { prepayId: string }) => ({
  ...pendingSmokeOrder,
  prepay_id: input.prepayId,
}));
const findOrderById = mock(
  async (): Promise<CustomerWechatPaySmokeOrderRecord | null> => ({
    ...pendingSmokeOrder,
    prepay_id: "prepay-test",
  }),
);
const markOrderPaid = mock(async (input: {
  transactionId: string;
  paidAt: string;
  notificationId: string | null;
}) => ({
  ...pendingSmokeOrder,
  status: "paid",
  prepay_id: "prepay-test",
  transaction_id: input.transactionId,
  trade_state: "SUCCESS",
  trade_state_desc: "支付成功",
  paid_at: input.paidAt,
  latest_notification_id: input.notificationId,
}) as CustomerWechatPaySmokeOrderRecord);
const markOrderTradeState = mock(
  async (): Promise<CustomerWechatPaySmokeOrderRecord> => ({
    ...pendingSmokeOrder,
    prepay_id: "prepay-test",
    trade_state: "NOTPAY",
    trade_state_desc: "订单未支付",
  }),
);
const findWechatPayConfig = mock(async () => serviceProviderTenantConfig);
const findWechatPayConfigById = mock(async () => serviceProviderPlatformConfig);
const loadSecretBundle = mock(async (): Promise<WechatPaySecretBundle> => ({
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: "PUB_KEY_ID_1",
  wechatPayPublicKeyPem: "public-key",
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
  package: "prepay_id=prepay-test",
  signType: "RSA" as const,
  paySign: "retry-pay-sign",
}));
const queryTransactionByOutTradeNo = mock(async () => ({
  sp_mchid: serviceProviderTenantConfig.merchant_id,
  sub_mchid: serviceProviderTenantConfig.sub_merchant_id,
  out_trade_no: pendingSmokeOrder.out_trade_no,
  transaction_id: "4200000000000000000000000000",
  trade_state: "SUCCESS",
  trade_state_desc: "支付成功",
  success_time: paidAt,
  amount: {
    total: 100,
    currency: "CNY",
  },
  requestId: "wx-request-id",
}));

async function createService() {
  const { CustomerWechatPaySmokeService } = await import(
    "./customer-wechat-pay-smoke"
  );
  return new CustomerWechatPaySmokeService({
    orderRepository: {
      findByIdempotencyKey,
      createOrder,
      markPrepayCreated,
      findOrderById,
      markOrderPaid,
      markOrderTradeState,
    },
    configRepository: {
      findWechatPayConfig,
    },
    platformPaymentConfigRepository: {
      findWechatPayConfigById,
    },
    secretBundleService: {
      load: loadSecretBundle,
    },
    wechatPayGateway: {
      createJsapiPrepay,
      createMiniProgramPaymentRequest,
      queryTransactionByOutTradeNo,
    },
    tradeNoFactory: () => pendingSmokeOrder.out_trade_no,
    nowFactory: () => new Date(createdAt),
  });
}

describe("CustomerWechatPaySmokeService", () => {
  beforeEach(() => {
    findByIdempotencyKey.mockClear();
    createOrder.mockClear();
    markPrepayCreated.mockClear();
    findOrderById.mockClear();
    markOrderPaid.mockClear();
    markOrderTradeState.mockClear();
    findWechatPayConfig.mockClear();
    findWechatPayConfigById.mockClear();
    loadSecretBundle.mockClear();
    createJsapiPrepay.mockClear();
    createMiniProgramPaymentRequest.mockClear();
    queryTransactionByOutTradeNo.mockClear();
  });

  test("creates a fixed one-yuan customer smoke order and payment request", async () => {
    const service = await createService();

    const result = await service.createOrder(
      { tenantId, customerId },
      { payer_openid: "  o-customer-openid  " },
    );

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: tenantId,
        customer_id: customerId,
        payment_config_id: paymentConfigId,
        out_trade_no: pendingSmokeOrder.out_trade_no,
        amount_fen: 100,
        currency: "CNY",
        status: "pending",
        payer_openid: "o-customer-openid",
      }),
    );
    expect(createJsapiPrepay).toHaveBeenCalledWith({
      config: expect.objectContaining({
        merchant_mode: "service_provider_sub_merchant",
        sub_merchant_id: "sub-mchid-1",
      }),
      order: {
        out_trade_no: pendingSmokeOrder.out_trade_no,
        amount: 1,
        payer_openid: "o-customer-openid",
      },
      description: "固始晴天装饰微信支付测试-1元",
      secretBundle: expect.objectContaining({ apiV3Key: "api-v3-key" }),
    });
    expect(markPrepayCreated).toHaveBeenCalledWith({
      tenantId,
      customerId,
      orderId: smokeOrderId,
      prepayId: "prepay-test",
    });
    expect(result.order).toMatchObject({
      id: smokeOrderId,
      amount: 1,
      amount_fen: 100,
      status: "pending",
    });
    expect(result.payment_request).toMatchObject({
      timeStamp: "1782873600",
      package: "prepay_id=prepay-test",
      signType: "RSA",
      paySign: "pay-sign",
    });
  });

  test("queries wechat and marks pending smoke order paid", async () => {
    const service = await createService();

    const result = await service.getOrder({ tenantId, customerId }, smokeOrderId);

    expect(queryTransactionByOutTradeNo).toHaveBeenCalledWith({
      config: expect.objectContaining({
        merchant_mode: "service_provider_sub_merchant",
        sub_merchant_id: "sub-mchid-1",
      }),
      outTradeNo: pendingSmokeOrder.out_trade_no,
      secretBundle: expect.objectContaining({ apiV3Key: "api-v3-key" }),
    });
    expect(markOrderPaid).toHaveBeenCalledWith({
      tenantId,
      customerId,
      orderId: smokeOrderId,
      transactionId: "4200000000000000000000000000",
      paidAmountFen: 100,
      paidAt,
      notificationId: null,
      tradeStateDesc: "支付成功",
      metadata: expect.objectContaining({
        source: "wechat_query",
        request_id: "wx-request-id",
      }),
    });
    expect(result.order).toMatchObject({
      id: smokeOrderId,
      status: "paid",
      amount: 1,
      amount_fen: 100,
      transaction_id: "4200000000000000000000000000",
    });
  });
});
