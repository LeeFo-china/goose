import { describe, expect, mock, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { WechatPayOrderRecord } from "@/repositories/wechat-pay-orders";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

const directConfig = {
  id: "config-1",
  tenant_id: "tenant-1",
  provider: "wechat_pay",
  principal_type: "tenant",
  merchant_mode: "direct_merchant",
  merchant_name: "测试商户",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wxbac3b1e168fd968a",
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
  serial_no: "SERIALNO",
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
  workflow_instance_id: null,
  workflow_task_id: null,
  receivable_plan_id: null,
  payment_id: null,
  out_trade_no: "WX202607010001",
  transaction_id: null,
  amount: 100,
  paid_amount: 0,
  currency: "CNY",
  status: "pending",
  payer_openid: "o-openid",
  prepay_id: null,
  paid_at: null,
  closed_at: null,
  failed_at: null,
  failure_reason: null,
  latest_notification_id: null,
  metadata: {},
  created_by_employee_id: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
} satisfies WechatPayOrderRecord;

async function createGateway(fetchImpl: typeof fetch) {
  const { WechatPayGateway } = await import("./wechat-pay-gateway");
  return new WechatPayGateway({
    fetchImpl,
    nonceFactory: () => "nonce-1",
    timestampFactory: () => "1782873600",
  });
}

describe("WechatPayGateway", () => {
  test("creates jsapi prepay and returns mini program payment request", async () => {
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual(
        expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
      );
      expect(String((init?.headers as Record<string, string>).Authorization))
        .toContain('mchid="1112582521"');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        appid: "wxbac3b1e168fd968a",
        mchid: "1112582521",
        out_trade_no: "WX202607010001",
      });
      return new Response(JSON.stringify({ prepay_id: "prepay-test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const result = await gateway.createJsapiPrepay({
      config: directConfig,
      order,
      description: "项目收款",
      secretBundle: {
        privateKeyPem: privateKey,
        apiV3Key: "api-v3-key",
        wechatPayPublicKeyId: null,
        wechatPayPublicKeyPem: null,
        baseUrl: "https://api.mch.weixin.qq.com",
      },
    });

    expect(result.prepayId).toBe("prepay-test");
    expect(result.paymentRequest).toMatchObject({
      timeStamp: "1782873600",
      nonceStr: "nonce-1",
      package: "prepay_id=prepay-test",
      signType: "RSA",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("maps upstream failure to stable business error", async () => {
    const fetchImpl = mock(async () =>
      new Response(JSON.stringify({
        code: "PARAM_ERROR",
        message: "appid and mchid not match",
      }), { status: 400 })
    ) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(
      gateway.createJsapiPrepay({
        config: directConfig,
        order,
        description: "项目收款",
        secretBundle: {
          privateKeyPem: privateKey,
          apiV3Key: "api-v3-key",
          wechatPayPublicKeyId: null,
          wechatPayPublicKeyPem: null,
          baseUrl: "https://api.mch.weixin.qq.com",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_PREPAY_FAILED",
    });
  });

  test("queries direct merchant transaction by out trade no", async () => {
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://api.mch.weixin.qq.com/v3/pay/transactions/out-trade-no/WX202607010001?mchid=1112582521",
      );
      expect(init?.method).toBe("GET");
      expect(String((init?.headers as Record<string, string>).Authorization))
        .toContain('mchid="1112582521"');
      return new Response(JSON.stringify({
        out_trade_no: "WX202607010001",
        transaction_id: "4200000000202607010000000001",
        trade_state: "SUCCESS",
        success_time: "2026-07-01T10:00:00+08:00",
        amount: { total: 100, currency: "CNY" },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const result = await gateway.queryTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX202607010001",
      secretBundle: {
        privateKeyPem: privateKey,
        apiV3Key: "api-v3-key",
        wechatPayPublicKeyId: null,
        wechatPayPublicKeyPem: null,
        baseUrl: "https://api.mch.weixin.qq.com",
      },
    });

    expect(result).toMatchObject({
      out_trade_no: "WX202607010001",
      transaction_id: "4200000000202607010000000001",
      trade_state: "SUCCESS",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("requests direct merchant refund by transaction id", async () => {
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.mch.weixin.qq.com/v3/refund/domestic/refunds");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual(
        expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
      );
      expect(String((init?.headers as Record<string, string>).Authorization))
        .toContain('mchid="1112582521"');
      expect(JSON.parse(String(init?.body))).toEqual({
        transaction_id: "4200000000202607010000000001",
        out_refund_no: "TRR202607100800000001",
        reason: "客户误充值，需要申请退款",
        notify_url: "https://api.example.com/pay/wechat/callback",
        amount: {
          refund: 10000,
          total: 10000,
          currency: "CNY",
        },
      });
      return new Response(JSON.stringify({
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const result = await gateway.requestRefund({
      config: directConfig,
      transactionId: "4200000000202607010000000001",
      outRefundNo: "TRR202607100800000001",
      reason: "客户误充值，需要申请退款",
      refundAmountFen: 10000,
      totalAmountFen: 10000,
      secretBundle: {
        privateKeyPem: privateKey,
        apiV3Key: "api-v3-key",
        wechatPayPublicKeyId: null,
        wechatPayPublicKeyPem: null,
        baseUrl: "https://api.mch.weixin.qq.com",
      },
    });

    expect(result).toEqual({
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      status: "PROCESSING",
      raw: {
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
