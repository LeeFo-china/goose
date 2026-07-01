import { Errors } from "@/errors/error-factory";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { WechatPayOrderRecord } from "@/repositories/wechat-pay-orders";

export type WechatPayJsapiPrepayRequestInput = {
  config: WechatPayConfigRecord;
  order: WechatPayOrderRecord;
  description: string;
};

export type WechatPayJsapiPrepayRequest = {
  urlPath:
    | "/v3/pay/transactions/jsapi"
    | "/v3/pay/partner/transactions/jsapi";
  body: Record<string, unknown>;
};

export function buildWechatPayJsapiPrepayRequest(
  input: WechatPayJsapiPrepayRequestInput,
): WechatPayJsapiPrepayRequest {
  assertBasePrepayInput(input);

  if (input.config.merchant_mode === "service_provider_sub_merchant") {
    return buildServiceProviderPrepayRequest(input);
  }

  return buildDirectMerchantPrepayRequest(input);
}

function buildDirectMerchantPrepayRequest(
  input: WechatPayJsapiPrepayRequestInput,
): WechatPayJsapiPrepayRequest {
  if (!input.config.merchant_id || !input.config.app_id) {
    throw Errors.business(
      409,
      "微信支付直连商户配置不完整",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
    );
  }

  return {
    urlPath: "/v3/pay/transactions/jsapi",
    body: {
      appid: input.config.app_id,
      mchid: input.config.merchant_id,
      description: input.description,
      out_trade_no: input.order.out_trade_no,
      notify_url: input.config.notify_url,
      amount: buildWechatPayAmount(input.order.amount),
      payer: {
        openid: input.order.payer_openid,
      },
    },
  };
}

function buildServiceProviderPrepayRequest(
  input: WechatPayJsapiPrepayRequestInput,
): WechatPayJsapiPrepayRequest {
  if (
    !input.config.merchant_id ||
    !input.config.sub_merchant_id ||
    !input.config.app_id ||
    !input.config.sub_app_id
  ) {
    throw Errors.business(
      409,
      "微信支付服务商子商户配置不完整",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
    );
  }

  return {
    urlPath: "/v3/pay/partner/transactions/jsapi",
    body: {
      sp_appid: input.config.app_id,
      sp_mchid: input.config.merchant_id,
      sub_appid: input.config.sub_app_id,
      sub_mchid: input.config.sub_merchant_id,
      description: input.description,
      out_trade_no: input.order.out_trade_no,
      notify_url: input.config.notify_url,
      amount: buildWechatPayAmount(input.order.amount),
      payer: {
        sub_openid: input.order.payer_openid,
      },
    },
  };
}

function assertBasePrepayInput(input: WechatPayJsapiPrepayRequestInput) {
  if (!input.config.notify_url) {
    throw Errors.business(
      409,
      "微信支付回调地址未配置",
      "WECHAT_PAY_NOTIFY_URL_REQUIRED",
    );
  }
  if (!input.order.payer_openid) {
    throw Errors.business(
      409,
      "微信支付订单缺少付款用户 openid",
      "WECHAT_PAY_PAYER_OPENID_REQUIRED",
    );
  }
}

function buildWechatPayAmount(amount: number | string) {
  return {
    total: Math.round(Number(amount) * 100),
    currency: "CNY",
  };
}
