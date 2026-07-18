import { describe, expect, mock, test } from "bun:test";
import { createVerify, generateKeyPairSync, sign } from "node:crypto";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { WechatPayOrderRecord } from "@/repositories/wechat-pay-orders";
import type { WechatPaySecretBundle } from "./wechat-pay-secret-bundles";
import { buildWechatPayRequestSignMessage } from "./wechat-pay-signatures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

const WECHAT_PAY_PUBLIC_KEY_ID = "PUB_KEY_ID_TEST";
const RESPONSE_TIMESTAMP = "1782873600";
const secretBundle = {
  privateKeyPem: privateKey,
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: WECHAT_PAY_PUBLIC_KEY_ID,
  wechatPayPublicKeyPem: publicKey,
  baseUrl: "https://api.mch.weixin.qq.com",
} satisfies WechatPaySecretBundle;

function createWechatPayResponse(
  payload: Record<string, unknown>,
  options: { status?: number; requestId?: string } = {},
) {
  const rawBody = JSON.stringify(payload);
  const nonce = "response-nonce";
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(`${RESPONSE_TIMESTAMP}\n${nonce}\n${rawBody}\n`),
    privateKey,
  ).toString("base64");
  return new Response(rawBody, {
    status: options.status ?? 200,
    headers: {
      "content-type": "application/json",
      "request-id": options.requestId ?? "wechat-request-id",
      "wechatpay-timestamp": RESPONSE_TIMESTAMP,
      "wechatpay-nonce": nonce,
      "wechatpay-serial": WECHAT_PAY_PUBLIC_KEY_ID,
      "wechatpay-signature": signature,
    },
  });
}

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

const partnerConfig = {
  ...directConfig,
  merchant_mode: "service_provider_sub_merchant",
  merchant_id: "1561816121",
  sub_merchant_id: "1900000109",
  app_id: "wx-service-app",
  sub_app_id: "wxbac3b1e168fd968a",
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

const orderWithExpiration = {
  ...order,
  payment_expires_at: "2026-07-01T10:05:00+08:00",
};

async function createGateway(fetchImpl: typeof fetch) {
  const { WechatPayGateway } = await import("./wechat-pay-gateway");
  return new WechatPayGateway({
    fetchImpl,
    nonceFactory: () => "nonce-1",
    timestampFactory: () => RESPONSE_TIMESTAMP,
    nowSecondsFactory: () => Number(RESPONSE_TIMESTAMP),
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
        time_expire: "2026-07-01T10:05:00+08:00",
      });
      return createWechatPayResponse({ prepay_id: "prepay-test" });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const result = await gateway.createJsapiPrepay({
      config: directConfig,
      order: orderWithExpiration,
      description: "项目收款",
      secretBundle,
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
      createWechatPayResponse({
        code: "PARAM_ERROR",
        message: "appid and mchid not match",
      }, { status: 400, requestId: "wechat-error-request-id" })
    ) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(
      gateway.createJsapiPrepay({
        config: directConfig,
        order: orderWithExpiration,
        description: "项目收款",
        secretBundle,
      }),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_PREPAY_FAILED",
      details: expect.objectContaining({
        operation: "jsapi_prepay",
        requestId: "wechat-error-request-id",
      }),
    });
  });

  test("retains request id when a verified prepay payload is invalid", async () => {
    const fetchImpl = mock(async () =>
      createWechatPayResponse({}, { requestId: "wechat-invalid-request-id" })
    ) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(gateway.createJsapiPrepay({
      config: directConfig,
      order,
      description: "项目收款",
      secretBundle,
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_PREPAY_RESPONSE_INVALID",
      details: expect.objectContaining({
        operation: "jsapi_prepay",
        requestId: "wechat-invalid-request-id",
      }),
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
      return createWechatPayResponse({
        out_trade_no: "WX202607010001",
        transaction_id: "4200000000202607010000000001",
        trade_state: "SUCCESS",
        success_time: "2026-07-01T10:00:00+08:00",
        amount: { total: 100, currency: "CNY" },
      });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const result = await gateway.queryTransactionByOutTradeNo({
      config: directConfig,
      outTradeNo: "WX202607010001",
      secretBundle,
    });

    expect(result).toMatchObject({
      out_trade_no: "WX202607010001",
      transaction_id: "4200000000202607010000000001",
      trade_state: "SUCCESS",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("queries direct merchant refund by out refund no", async () => {
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(
        "https://api.mch.weixin.qq.com/v3/refund/domestic/refunds/TRR202607100800000001",
      );
      expect(init?.method).toBe("GET");
      expect(String((init?.headers as Record<string, string>).Authorization))
        .toContain('mchid="1112582521"');
      return createWechatPayResponse({
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
        amount: { refund: 10000, total: 10000, currency: "CNY" },
      });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const result = await gateway.queryRefundByOutRefundNo({
      config: directConfig,
      outRefundNo: "TRR202607100800000001",
      secretBundle,
    });

    expect(result).toMatchObject({
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      status: "PROCESSING",
      requestId: "wechat-request-id",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("queries partner refund with sub merchant id in the signed path", async () => {
    const urlPath =
      "/v3/refund/domestic/refunds/TRR202607100800000001?sub_mchid=1900000109";
    const fetchImpl = mock(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(`https://api.mch.weixin.qq.com${urlPath}`);
      expect(init?.method).toBe("GET");
      const authorization = String(
        (init?.headers as Record<string, string>).Authorization,
      );
      expect(authorization).toContain('mchid="1561816121"');
      const signature = authorization.match(/signature="([^"]+)"/)?.[1] ?? "";
      const verifier = createVerify("RSA-SHA256");
      verifier.update(buildWechatPayRequestSignMessage({
        method: "GET",
        urlPath,
        body: "",
        nonce: "nonce-1",
        timestamp: "1782873600",
      }));
      verifier.end();
      expect(verifier.verify(publicKey, signature, "base64")).toBe(true);
      return createWechatPayResponse({
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
        amount: { refund: 10000, total: 10000, currency: "CNY" },
      });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    const result = await gateway.queryRefundByOutRefundNo({
      config: partnerConfig,
      outRefundNo: "TRR202607100800000001",
      secretBundle,
    });

    expect(result).toMatchObject({ status: "PROCESSING" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("rejects partner refund query without sub merchant id", async () => {
    const fetchImpl = mock(async () => createWechatPayResponse({})) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await expect(gateway.queryRefundByOutRefundNo({
      config: { ...partnerConfig, sub_merchant_id: null },
      outRefundNo: "TRR202607100800000001",
      secretBundle,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_CONFIG_INCOMPLETE",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
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
      return createWechatPayResponse({
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
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
      secretBundle,
    });

    expect(result).toEqual({
      out_refund_no: "TRR202607100800000001",
      refund_id: "5030000000202607150000000001",
      status: "PROCESSING",
      requestId: "wechat-request-id",
      raw: {
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("limits refund reason to 80 UTF-8 bytes without splitting characters", async () => {
    const longReason = "客户误充值，需要申请退款。".repeat(10);
    let sentReason = "";
    const fetchImpl = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { reason?: unknown };
      sentReason = typeof body.reason === "string" ? body.reason : "";
      return createWechatPayResponse({
        out_refund_no: "TRR202607100800000001",
        refund_id: "5030000000202607150000000001",
        status: "PROCESSING",
      });
    }) as unknown as typeof fetch;
    const gateway = await createGateway(fetchImpl);

    await gateway.requestRefund({
      config: directConfig,
      transactionId: "4200000000202607010000000001",
      outRefundNo: "TRR202607100800000001",
      reason: longReason,
      refundAmountFen: 10000,
      totalAmountFen: 10000,
      secretBundle,
    });

    expect(new TextEncoder().encode(sentReason).byteLength).toBeLessThanOrEqual(80);
    expect(sentReason.length).toBeGreaterThan(0);
    expect(longReason.startsWith(sentReason)).toBe(true);
    expect(sentReason).not.toContain("�");
  });

});
