import { Errors } from "@/errors/error-factory";
import {
  buildWechatPayJsapiPrepayRequest,
  type WechatPayJsapiConfig,
  type WechatPayJsapiOrder,
} from "@/services/wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";
import {
  buildWechatPayAuthorization,
  buildWechatPayMiniProgramPaymentRequest,
  type WechatPayMiniProgramPaymentRequest,
} from "@/services/wechat-pay-signatures";

type FetchImpl = typeof fetch;

type WechatPayGatewayDependencies = {
  fetchImpl?: FetchImpl;
  nonceFactory?: () => string;
  timestampFactory?: () => string;
};

export type WechatPayCreateJsapiPrepayInput = {
  config: WechatPayJsapiConfig;
  order: WechatPayJsapiOrder;
  description: string;
  secretBundle: WechatPaySecretBundle;
};

export type WechatPayCreateJsapiPrepayResult = {
  prepayId: string;
  paymentRequest: WechatPayMiniProgramPaymentRequest;
};

export type WechatPayQueryTransactionByOutTradeNoInput = {
  config: WechatPayJsapiConfig;
  outTradeNo: string;
  secretBundle: WechatPaySecretBundle;
};

export type WechatPayTransactionQueryResult = Record<string, unknown> & {
  out_trade_no?: string;
  transaction_id?: string;
  trade_state?: string;
  success_time?: string;
  amount?: Record<string, unknown>;
};

export class WechatPayGateway {
  private readonly fetchImpl: FetchImpl;
  private readonly nonceFactory?: () => string;
  private readonly timestampFactory?: () => string;

  constructor(dependencies: WechatPayGatewayDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.nonceFactory = dependencies.nonceFactory;
    this.timestampFactory = dependencies.timestampFactory;
  }

  async createJsapiPrepay(
    input: WechatPayCreateJsapiPrepayInput,
  ): Promise<WechatPayCreateJsapiPrepayResult> {
    const serialNo = input.config.serial_no?.trim();
    if (!serialNo) {
      throw Errors.business(
        409,
        "微信支付证书序列号未配置",
        "WECHAT_PAY_SERIAL_NO_REQUIRED",
      );
    }

    const prepayRequest = buildWechatPayJsapiPrepayRequest({
      config: input.config,
      order: input.order,
      description: input.description,
    });
    const body = JSON.stringify(prepayRequest.body);
    const nonce = this.createNonce();
    const timestamp = this.createTimestamp();
    const authorization = buildWechatPayAuthorization({
      method: "POST",
      urlPath: prepayRequest.urlPath,
      body,
      merchantId: input.config.merchant_id || "",
      serialNo,
      privateKeyPem: input.secretBundle.privateKeyPem,
      nonce,
      timestamp,
    });
    const response = await this.fetchImpl(
      `${input.secretBundle.baseUrl}${prepayRequest.urlPath}`,
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
    const payload = await parseWechatPayJson(response);
    if (!response.ok) {
      throw Errors.business(
        502,
        "微信支付预下单失败",
        "WECHAT_PAY_PREPAY_FAILED",
        {
          status: response.status,
          code: stringField(payload, "code"),
          message: stringField(payload, "message"),
        },
      );
    }

    const prepayId = stringField(payload, "prepay_id");
    if (!prepayId) {
      throw Errors.business(
        502,
        "微信支付预下单响应缺少 prepay_id",
        "WECHAT_PAY_PREPAY_RESPONSE_INVALID",
      );
    }

    return {
      prepayId,
      paymentRequest: buildWechatPayMiniProgramPaymentRequest({
        appId: input.config.sub_app_id || input.config.app_id || "",
        prepayId,
        privateKeyPem: input.secretBundle.privateKeyPem,
        nonce,
        timestamp,
      }),
    };
  }

  async queryTransactionByOutTradeNo(
    input: WechatPayQueryTransactionByOutTradeNoInput,
  ): Promise<WechatPayTransactionQueryResult> {
    const serialNo = input.config.serial_no?.trim();
    if (!serialNo) {
      throw Errors.business(
        409,
        "微信支付证书序列号未配置",
        "WECHAT_PAY_SERIAL_NO_REQUIRED",
      );
    }

    const urlPath = buildTransactionQueryUrlPath(input.config, input.outTradeNo);
    const nonce = this.createNonce();
    const timestamp = this.createTimestamp();
    const authorization = buildWechatPayAuthorization({
      method: "GET",
      urlPath,
      body: "",
      merchantId: input.config.merchant_id || "",
      serialNo,
      privateKeyPem: input.secretBundle.privateKeyPem,
      nonce,
      timestamp,
    });
    const response = await this.fetchImpl(
      `${input.secretBundle.baseUrl}${urlPath}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
        },
      },
    );
    const payload = await parseWechatPayJson(response);
    if (!response.ok) {
      throw Errors.business(
        502,
        "微信支付查单失败",
        "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
        {
          status: response.status,
          code: stringField(payload, "code"),
          message: stringField(payload, "message"),
        },
      );
    }

    return payload as WechatPayTransactionQueryResult;
  }

  private createNonce() {
    return this.nonceFactory?.() ?? undefined;
  }

  private createTimestamp() {
    return this.timestampFactory?.() ?? undefined;
  }
}

async function parseWechatPayJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json();
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildTransactionQueryUrlPath(
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

export const wechatPayGateway = new WechatPayGateway();
