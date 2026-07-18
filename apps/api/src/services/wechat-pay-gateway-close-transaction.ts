import { Errors } from "@/errors/error-factory";
import {
  parseWechatPayJson,
  stringField,
} from "@/services/wechat-pay-gateway-response";
import type { WechatPayJsapiConfig } from "@/services/wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";
import { buildWechatPayAuthorization } from "@/services/wechat-pay-signatures";

export type WechatPayCloseTransactionByOutTradeNoInput = {
  config: WechatPayJsapiConfig;
  outTradeNo: string;
  secretBundle: WechatPaySecretBundle;
};

type CloseTransactionInput = WechatPayCloseTransactionByOutTradeNoInput & {
  fetchImpl: typeof fetch;
  nonce?: string;
  timestamp?: string;
};

export async function closeWechatPayTransactionByOutTradeNo(
  input: CloseTransactionInput,
): Promise<void> {
  const serialNo = input.config.serial_no?.trim();
  if (!serialNo) {
    throw Errors.business(
      409,
      "微信支付证书序列号未配置",
      "WECHAT_PAY_SERIAL_NO_REQUIRED",
    );
  }

  const request = buildCloseTransactionRequest(input.config, input.outTradeNo);
  const body = JSON.stringify(request.body);
  const authorization = buildWechatPayAuthorization({
    method: "POST",
    urlPath: request.urlPath,
    body,
    merchantId: input.config.merchant_id || "",
    serialNo,
    privateKeyPem: input.secretBundle.privateKeyPem,
    nonce: input.nonce,
    timestamp: input.timestamp,
  });
  const response = await input.fetchImpl(
    `${input.secretBundle.baseUrl}${request.urlPath}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body,
    },
  );
  if (response.ok) return;

  const payload = await parseWechatPayJson(response);
  throw Errors.business(
    502,
    "微信支付关单失败",
    "WECHAT_PAY_CLOSE_FAILED",
    {
      status: response.status,
      code: stringField(payload, "code"),
      message: stringField(payload, "message"),
    },
  );
}

function buildCloseTransactionRequest(
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
    return {
      urlPath: `/v3/pay/partner/transactions/out-trade-no/${encodedOutTradeNo}/close`,
      body: {
        sp_mchid: config.merchant_id,
        sub_mchid: config.sub_merchant_id,
      },
    };
  }

  if (!config.merchant_id) {
    throw Errors.business(
      409,
      "微信支付商户号未配置",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
    );
  }
  return {
    urlPath: `/v3/pay/transactions/out-trade-no/${encodedOutTradeNo}/close`,
    body: { mchid: config.merchant_id },
  };
}
