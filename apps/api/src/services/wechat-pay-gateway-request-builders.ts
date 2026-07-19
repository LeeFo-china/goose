import { Errors } from "@/errors/error-factory";
import type { WechatPayJsapiConfig } from "@/services/wechat-pay-jsapi-request-builder";

type WechatPayRefundRequestBodyInput = {
  config: WechatPayJsapiConfig;
  transactionId: string;
  outRefundNo: string;
  reason: string;
  refundAmountFen: number;
  totalAmountFen: number;
};

export function buildWechatPayTransactionQueryUrlPath(
  config: WechatPayJsapiConfig,
  outTradeNo: string,
) {
  const encodedOutTradeNo = encodeURIComponent(outTradeNo);
  if (config.merchant_mode === "service_provider_sub_merchant") {
    if (!config.merchant_id || !config.sub_merchant_id) {
      throw Errors.business(
        409,
        "微信支付服务商子商户配置不完整",
        "WECHAT_PAY_CONFIG_INCOMPLETE",
      );
    }
    const query = new URLSearchParams({
      sp_mchid: config.merchant_id,
      sub_mchid: config.sub_merchant_id,
    });
    return `/v3/pay/partner/transactions/out-trade-no/${encodedOutTradeNo}?${query.toString()}`;
  }

  if (!config.merchant_id) {
    throw Errors.business(
      409,
      "微信支付商户号未配置",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
    );
  }
  const query = new URLSearchParams({ mchid: config.merchant_id });
  return `/v3/pay/transactions/out-trade-no/${encodedOutTradeNo}?${query.toString()}`;
}

export function buildWechatPayRefundRequestBody(
  input: WechatPayRefundRequestBodyInput,
) {
  if (!input.config.merchant_id) {
    throw Errors.business(
      409,
      "微信支付商户号未配置",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
    );
  }
  if (input.config.merchant_mode === "service_provider_sub_merchant") {
    if (!input.config.sub_merchant_id) {
      throw Errors.business(
        409,
        "微信支付服务商子商户配置不完整",
        "WECHAT_PAY_CONFIG_INCOMPLETE",
      );
    }
    return withRefundNotifyUrl(input.config, {
      sub_mchid: input.config.sub_merchant_id,
      transaction_id: input.transactionId,
      out_refund_no: input.outRefundNo,
      reason: normalizeRefundReason(input.reason),
      amount: buildRefundAmount(input),
    });
  }

  return withRefundNotifyUrl(input.config, {
    transaction_id: input.transactionId,
    out_refund_no: input.outRefundNo,
    reason: normalizeRefundReason(input.reason),
    amount: buildRefundAmount(input),
  });
}

export function buildWechatPayRefundQueryUrlPath(
  config: WechatPayJsapiConfig,
  outRefundNo: string,
) {
  const encodedOutRefundNo = encodeURIComponent(outRefundNo);
  if (config.merchant_mode === "service_provider_sub_merchant") {
    if (!config.merchant_id || !config.sub_merchant_id) {
      throw Errors.business(
        409,
        "微信支付服务商子商户配置不完整",
        "WECHAT_PAY_CONFIG_INCOMPLETE",
      );
    }
    const query = new URLSearchParams({
      sub_mchid: config.sub_merchant_id,
    });
    return `/v3/refund/domestic/refunds/${encodedOutRefundNo}?${query.toString()}`;
  }
  if (!config.merchant_id) {
    throw Errors.business(
      409,
      "微信支付商户号未配置",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
    );
  }
  return `/v3/refund/domestic/refunds/${encodedOutRefundNo}`;
}

function normalizeRefundReason(reason: string) {
  const normalized = reason.trim();
  const encoder = new TextEncoder();
  let byteLength = 0;
  let result = "";

  for (const character of normalized) {
    const characterByteLength = encoder.encode(character).byteLength;
    if (byteLength + characterByteLength > 80) break;
    result += character;
    byteLength += characterByteLength;
  }

  return result;
}

function withRefundNotifyUrl(
  config: WechatPayJsapiConfig,
  body: Record<string, unknown>,
) {
  const notifyUrl = config.notify_url?.trim();
  return notifyUrl ? { ...body, notify_url: notifyUrl } : body;
}

function buildRefundAmount(input: WechatPayRefundRequestBodyInput) {
  return {
    refund: input.refundAmountFen,
    total: input.totalAmountFen,
    currency: "CNY",
  };
}
