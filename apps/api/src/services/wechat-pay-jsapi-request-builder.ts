import { Errors } from "@/errors/error-factory";

export type WechatPayJsapiConfig = {
  merchant_mode: string | null;
  merchant_id: string | null;
  sub_merchant_id?: string | null;
  app_id: string | null;
  sub_app_id?: string | null;
  serial_no: string | null;
  notify_url: string | null;
};

export type WechatPayJsapiOrder = {
  out_trade_no: string;
  amount: number | string;
  payer_openid: string | null;
  payment_expires_at?: string;
};

export type WechatPayJsapiPrepayRequestInput = {
  config: WechatPayJsapiConfig;
  order: WechatPayJsapiOrder;
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
      ...buildPaymentExpiration(input.order),
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
    !input.config.app_id
  ) {
    throw Errors.business(
      409,
      "微信支付服务商子商户配置不完整",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
    );
  }

  const appScope = input.config.sub_app_id
    ? {
      sub_appid: input.config.sub_app_id,
      payer: { sub_openid: input.order.payer_openid },
    }
    : {
      payer: { sp_openid: input.order.payer_openid },
    };

  return {
    urlPath: "/v3/pay/partner/transactions/jsapi",
    body: {
      sp_appid: input.config.app_id,
      sp_mchid: input.config.merchant_id,
      sub_mchid: input.config.sub_merchant_id,
      ...appScope,
      description: input.description,
      out_trade_no: input.order.out_trade_no,
      ...buildPaymentExpiration(input.order),
      notify_url: input.config.notify_url,
      amount: buildWechatPayAmount(input.order.amount),
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

function buildPaymentExpiration(order: WechatPayJsapiOrder) {
  const paymentExpiresAt = order.payment_expires_at;
  if (paymentExpiresAt === undefined) return {};
  if (!isValidRfc3339DateTime(paymentExpiresAt)) {
    throw Errors.business(
      400,
      "微信支付订单的支付结束时间格式无效",
      "WECHAT_PAY_PAYMENT_EXPIRES_AT_INVALID",
    );
  }
  return { time_expire: paymentExpiresAt };
}

function isValidRfc3339DateTime(value: string) {
  const pattern = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  if (!pattern.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}
