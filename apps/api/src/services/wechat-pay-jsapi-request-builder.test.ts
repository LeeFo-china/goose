import { describe, expect, test } from "bun:test";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { WechatPayOrderRecord } from "@/repositories/wechat-pay-orders";
import { MAX_POSTGRES_INTEGER_FEN } from "@/services/branding-addon-contracts";
import { buildWechatPayJsapiPrepayRequest } from "./wechat-pay-jsapi-request-builder";

const baseConfig = {
  id: "config-1",
  tenant_id: "tenant-1",
  platform_payment_config_id: null,
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
  encrypted_config_ref: "env://WECHAT_PAY_DIRECT",
  risk_switches: {},
  serial_no: "serial-no",
  notify_url: "https://api.example.com/pay/wechat/callback",
  validation_status: "valid",
  last_validated_at: null,
  created_by_employee_id: null,
  updated_by_employee_id: null,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T00:00:00.000Z",
} satisfies WechatPayConfigRecord;

const baseOrder = {
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
  amount: 10000.5,
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

const paymentExpiresAt = "2026-07-01T10:05:00+08:00";

describe("buildWechatPayJsapiPrepayRequest", () => {
  test("builds direct merchant jsapi request", () => {
    const request = buildWechatPayJsapiPrepayRequest({
      config: baseConfig,
      order: {
        ...baseOrder,
        payment_expires_at: paymentExpiresAt,
      },
      description: "项目收款",
    });

    expect(request).toEqual({
      urlPath: "/v3/pay/transactions/jsapi",
      body: {
        appid: "wxbac3b1e168fd968a",
        mchid: "1112582521",
        description: "项目收款",
        out_trade_no: "WX202607010001",
        time_expire: paymentExpiresAt,
        notify_url: "https://api.example.com/pay/wechat/callback",
        amount: {
          total: 1000050,
          currency: "CNY",
        },
        payer: {
          openid: "o-openid",
        },
      },
    });
  });

  test("builds service provider sub merchant jsapi request", () => {
    const request = buildWechatPayJsapiPrepayRequest({
      config: {
        ...baseConfig,
        merchant_mode: "service_provider_sub_merchant",
        merchant_id: "1561816121",
        sub_merchant_id: "1900000002",
        app_id: "wx-service-app",
        sub_app_id: "wxbac3b1e168fd968a",
      },
      order: {
        ...baseOrder,
        payment_expires_at: paymentExpiresAt,
      },
      description: "项目收款",
    });

    expect(request).toEqual({
      urlPath: "/v3/pay/partner/transactions/jsapi",
      body: {
        sp_appid: "wx-service-app",
        sp_mchid: "1561816121",
        sub_appid: "wxbac3b1e168fd968a",
        sub_mchid: "1900000002",
        description: "项目收款",
        out_trade_no: "WX202607010001",
        time_expire: paymentExpiresAt,
        notify_url: "https://api.example.com/pay/wechat/callback",
        amount: {
          total: 1000050,
          currency: "CNY",
        },
        payer: {
          sub_openid: "o-openid",
        },
      },
    });
  });

  test("builds service provider app jsapi request without sub app id", () => {
    const request = buildWechatPayJsapiPrepayRequest({
      config: {
        ...baseConfig,
        merchant_mode: "service_provider_sub_merchant",
        merchant_id: "service-provider-mchid",
        sub_merchant_id: "sub-merchant-mchid",
        app_id: "wx-service-provider-app",
        sub_app_id: null,
      },
      order: {
        ...baseOrder,
        payment_expires_at: paymentExpiresAt,
      },
      description: "项目收款",
    });

    expect(request).toEqual({
      urlPath: "/v3/pay/partner/transactions/jsapi",
      body: {
        sp_appid: "wx-service-provider-app",
        sp_mchid: "service-provider-mchid",
        sub_mchid: "sub-merchant-mchid",
        description: "项目收款",
        out_trade_no: "WX202607010001",
        time_expire: paymentExpiresAt,
        notify_url: "https://api.example.com/pay/wechat/callback",
        amount: {
          total: 1000050,
          currency: "CNY",
        },
        payer: {
          sp_openid: "o-openid",
        },
      },
    });
  });

  test("keeps legacy orders without a payment expiration compatible", () => {
    const request = buildWechatPayJsapiPrepayRequest({
      config: baseConfig,
      order: baseOrder,
      description: "项目收款",
    });

    expect(request.body).not.toHaveProperty("time_expire");
  });

  test.each([
    ["one fen", 1],
    ["PostgreSQL integer upper boundary", MAX_POSTGRES_INTEGER_FEN],
  ])("keeps %s as an exact integer-fen gateway total", (_label, amountFen) => {
    const request = buildWechatPayJsapiPrepayRequest({
      config: baseConfig,
      order: {
        ...baseOrder,
        amount: amountFen / 100,
        payment_expires_at: paymentExpiresAt,
      },
      description: "年度品牌技术支持",
    });

    expect(request.body.amount).toEqual({
      total: amountFen,
      currency: "CNY",
    });
  });

  test("rejects a blank direct merchant payment expiration", () => {
    expect(() => buildWechatPayJsapiPrepayRequest({
      config: baseConfig,
      order: { ...baseOrder, payment_expires_at: "   " },
      description: "项目收款",
    })).toThrow(expect.objectContaining({
      statusCode: 400,
      code: "WECHAT_PAY_PAYMENT_EXPIRES_AT_INVALID",
    }));
  });

  test("rejects an invalid service provider payment expiration", () => {
    expect(() => buildWechatPayJsapiPrepayRequest({
      config: {
        ...baseConfig,
        merchant_mode: "service_provider_sub_merchant",
        sub_merchant_id: "1900000002",
        sub_app_id: "wxbac3b1e168fd968a",
      },
      order: { ...baseOrder, payment_expires_at: "2026-02-30T10:05:00+08:00" },
      description: "项目收款",
    })).toThrow(expect.objectContaining({
      statusCode: 400,
      code: "WECHAT_PAY_PAYMENT_EXPIRES_AT_INVALID",
    }));
  });
});
