import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PaymentRecord } from "@/repositories/payments";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type {
  WechatPayNotificationRecord,
  WechatPayOrderRecord,
} from "@/repositories/wechat-pay-orders";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const config = {
  id: "config-1",
  tenant_id: "tenant-1",
  platform_payment_config_id: null,
  provider: "wechat_pay",
  principal_type: "tenant",
  merchant_mode: "direct_merchant",
  merchant_name: "测试商户",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wx-app",
  sub_app_id: null,
  applyment_business_code: null,
  applyment_id: null,
  applyment_state: "not_started",
  applyment_state_message: null,
  appid_binding_state: "not_required",
  appid_binding_message: null,
  opened_at: null,
  suspended_at: null,
  status: "active",
  enabled_at: null,
  disabled_at: null,
  enabled_channels: ["project_payment"],
  settlement_account_summary: null,
  encrypted_config_ref: "env://WECHAT_PAY_TEST",
  risk_switches: {},
  serial_no: "merchant-serial",
  notify_url: "https://api.example.com/pay/wechat/callback",
  validation_status: "valid",
  last_validated_at: null,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
} satisfies WechatPayConfigRecord;

const order = {
  id: "order-1",
  tenant_id: "tenant-1",
  payment_config_id: "config-1",
  project_id: "project-1",
  workflow_instance_id: "instance-1",
  workflow_task_id: "task-1",
  receivable_plan_id: "plan-1",
  payment_id: null,
  out_trade_no: "WX202607010001",
  transaction_id: null,
  amount: 10000,
  paid_amount: 0,
  currency: "CNY",
  status: "pending",
  payer_openid: "o-openid",
  prepay_id: "prepay-1",
  paid_at: null,
  closed_at: null,
  failed_at: null,
  failure_reason: null,
  latest_notification_id: null,
  metadata: { payment_type: "stage_2" },
  created_by_employee_id: "employee-1",
  created_at: "2026-07-01T10:01:00.000Z",
  updated_at: "2026-07-01T10:01:00.000Z",
} satisfies WechatPayOrderRecord;

const payment = {
  id: "payment-1",
  project_id: "project-1",
  amount: 10000,
  type: "stage_2",
  status: "confirmed",
  evidence_images: [],
  handled_by: "employee-1",
  pay_date: "2026-07-01T10:05:00.000Z",
  workflow_task_id: "task-1",
  source_type: "wechat_pay_order",
  source_id: "order-1",
  remark: "微信支付回调确认收款",
  payment_channel: "wechat_pay",
  provider: "wechat_pay",
  provider_transaction_id: "4200000000202607010000000001",
  out_trade_no: "WX202607010001",
  created_at: "2026-07-01T10:05:00.000Z",
} satisfies PaymentRecord;

const notification = {
  id: "notification-1",
  tenant_id: "tenant-1",
  order_id: "order-1",
  notify_id: "notify-1",
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
  summary: "支付成功",
  raw_payload: {},
  signature_valid: true,
  processed: false,
  processed_at: null,
  error_message: null,
  created_at: "2026-07-01T10:05:01.000Z",
} satisfies WechatPayNotificationRecord;

const rawBody = JSON.stringify({
  id: "notify-1",
  event_type: "TRANSACTION.SUCCESS",
  resource_type: "encrypt-resource",
  summary: "支付成功",
  resource: {
    nonce: "resource-nonce",
    associated_data: "transaction",
    ciphertext: "ciphertext",
  },
});

const decryptedResource = {
  out_trade_no: "WX202607010001",
  transaction_id: "4200000000202607010000000001",
  trade_state: "SUCCESS",
  success_time: "2026-07-01T10:05:00+08:00",
  amount: {
    total: 1000000,
    payer_total: 1000000,
    currency: "CNY",
  },
  payer: {
    openid: "o-openid",
  },
};

const listCallbackCandidateConfigs = mock(async () => [config]);
const loadSecretBundle = mock(async (): Promise<WechatPaySecretBundle> => ({
  privateKeyPem: "private-key",
  apiV3Key: "12345678901234567890123456789012",
  wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
  wechatPayPublicKeyPem: "public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
}));
const verifySignature = mock(() => true);
const decryptResource = mock(() => decryptedResource);
const findByOutTradeNo = mock(
  async (): Promise<WechatPayOrderRecord | null> => order,
);
const findNotificationByNotifyId = mock(
  async (): Promise<WechatPayNotificationRecord | null> => null,
);
const createNotification = mock(async (): Promise<WechatPayNotificationRecord> =>
  notification
);
const markNotificationProcessed = mock(async () => ({ ...notification, processed: true }));
const markNotificationFailed = mock(async () => ({ ...notification, processed: false }));
const markOrderPaid = mock(async () => ({
  ...order,
  status: "paid",
  payment_id: "payment-1",
}));
const createPayment = mock(async () => payment);
const findTaskById = mock(async () => ({
  id: "task-1",
  tenant_id: "tenant-1",
  definition_id: "definition-1",
  version_id: "version-1",
  instance_id: "instance-1",
  instance_node_id: "node-run-1",
  node_id: "node-1",
  created_at: "2026-07-01T10:00:00.000Z",
  updated_at: "2026-07-01T10:00:00.000Z",
  node_key: "payment_stage_2",
  node_type: "confirmation" as const,
  title: "中期进度款",
  status: "pending" as const,
  assignee_employee_id: null,
  assignee_role_code: null,
  assignee_permission_code: "finance.payment.confirm",
  due_at: null,
  completed_by: null,
  completed_at: null,
  instance: {
    id: "instance-1",
    subject_type: "project" as const,
    subject_id: "project-1",
    status: "running" as const,
    current_node_key: "payment_stage_2",
    current_node_snapshot: {
      business_kind: "payment_collection",
      config: { payment_type: "stage_2" },
    },
  },
}));
const completePaymentTask = mock(async () => ({
  result: { ok: true, bridged: true, operation: "confirm_payment" },
  payment,
  workflow_state: { id: "state-1" },
}));

async function createService() {
  const { WechatPayCallbackService } = await import("./wechat-pay-callbacks");
  return new WechatPayCallbackService({
    configRepository: { listCallbackCandidateConfigs },
    secretBundleService: { load: loadSecretBundle },
    crypto: { verifySignature, decryptResource },
    orderRepository: {
      findByOutTradeNo,
      findNotificationByNotifyId,
      createNotification,
      markNotificationProcessed,
      markNotificationFailed,
      markOrderPaid,
    },
    paymentRepository: { create: createPayment },
    workflowTaskRepository: { findById: findTaskById },
    paymentBridge: { complete: completePaymentTask },
  });
}

describe("WechatPayCallbackService", () => {
  beforeEach(() => {
    for (const fn of [
      listCallbackCandidateConfigs,
      loadSecretBundle,
      verifySignature,
      decryptResource,
      findByOutTradeNo,
      findNotificationByNotifyId,
      createNotification,
      markNotificationProcessed,
      markNotificationFailed,
      markOrderPaid,
      createPayment,
      findTaskById,
      completePaymentTask,
    ]) {
      fn.mockClear();
    }
    verifySignature.mockImplementation(() => true);
    decryptResource.mockImplementation(() => decryptedResource);
    findNotificationByNotifyId.mockImplementation(async () => null);
    findByOutTradeNo.mockImplementation(async () => order);
  });

  test("processes successful payment callback into payment and workflow bridge", async () => {
    const service = await createService();

    const result = await service.handleCallback({
      rawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
        "wechatpay-serial": "PUB_KEY_ID_TEST",
      },
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(verifySignature).toHaveBeenCalledWith(expect.objectContaining({
      rawBody,
      publicKeyPem: "public-key",
    }));
    expect(decryptResource).toHaveBeenCalledWith(expect.objectContaining({
      apiV3Key: "12345678901234567890123456789012",
      ciphertext: "ciphertext",
    }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      order_id: "order-1",
      notify_id: "notify-1",
      signature_valid: true,
    }));
    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({
      project_id: "project-1",
      amount: 10000,
      type: "stage_2",
      status: "confirmed",
      workflow_task_id: "task-1",
      source_type: "wechat_pay_order",
      source_id: "order-1",
      payment_channel: "wechat_pay",
      provider_transaction_id: "4200000000202607010000000001",
      out_trade_no: "WX202607010001",
    }));
    expect(completePaymentTask).toHaveBeenCalledWith(expect.objectContaining({
      action: "complete",
      output: expect.objectContaining({
        provider: "wechat_pay",
        out_trade_no: "WX202607010001",
      }),
    }));
    expect(markOrderPaid).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      orderId: "order-1",
      paymentId: "payment-1",
      notificationId: "notification-1",
    }));
    expect(markNotificationProcessed).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      notificationId: "notification-1",
    });
  });

  test("returns success without side effects for duplicate processed notification", async () => {
    findNotificationByNotifyId.mockImplementationOnce(async () => ({
      ...notification,
      processed: true,
    }));
    const service = await createService();

    const result = await service.handleCallback({
      rawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
      },
    });

    expect(result).toEqual({ code: "SUCCESS", message: "成功" });
    expect(createPayment).not.toHaveBeenCalled();
    expect(completePaymentTask).not.toHaveBeenCalled();
    expect(markOrderPaid).not.toHaveBeenCalled();
  });

  test("tries next callback candidate when a candidate cannot decrypt resource", async () => {
    listCallbackCandidateConfigs.mockImplementationOnce(async () => [
      { ...config, id: "wrong-config", encrypted_config_ref: "env://WRONG" },
      config,
    ]);
    loadSecretBundle
      .mockImplementationOnce(async () => ({
        privateKeyPem: "private-key",
        apiV3Key: "wrong-api-v3-key-12345678901234",
        wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
        wechatPayPublicKeyPem: "public-key",
        baseUrl: "https://api.mch.weixin.qq.com",
      }))
      .mockImplementationOnce(async () => ({
        privateKeyPem: "private-key",
        apiV3Key: "12345678901234567890123456789012",
        wechatPayPublicKeyId: "PUB_KEY_ID_TEST",
        wechatPayPublicKeyPem: "public-key",
        baseUrl: "https://api.mch.weixin.qq.com",
      }));
    decryptResource
      .mockImplementationOnce(() => {
        throw Object.assign(new Error("decrypt failed"), {
          statusCode: 400,
          code: "WECHAT_PAY_CALLBACK_DECRYPT_FAILED",
        });
      })
      .mockImplementationOnce(() => decryptedResource);
    const service = await createService();

    await service.handleCallback({
      rawBody,
      headers: {
        "wechatpay-timestamp": "1782873600",
        "wechatpay-nonce": "callback-nonce",
        "wechatpay-signature": "signature",
        "wechatpay-serial": "PUB_KEY_ID_TEST",
      },
    });

    expect(decryptResource).toHaveBeenCalledTimes(2);
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  test("rejects callback when paid amount does not match order amount", async () => {
    decryptResource.mockImplementationOnce(() => ({
      ...decryptedResource,
      amount: {
        total: 999900,
        payer_total: 999900,
        currency: "CNY",
      },
    }));
    const service = await createService();

    await expect(
      service.handleCallback({
        rawBody,
        headers: {
          "wechatpay-timestamp": "1782873600",
          "wechatpay-nonce": "callback-nonce",
          "wechatpay-signature": "signature",
          "wechatpay-serial": "PUB_KEY_ID_TEST",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_CALLBACK_AMOUNT_MISMATCH",
    });

    expect(createPayment).not.toHaveBeenCalled();
    expect(markOrderPaid).not.toHaveBeenCalled();
    expect(markNotificationFailed).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      notificationId: "notification-1",
    }));
  });

});
