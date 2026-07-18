import { Errors } from "@/errors/error-factory";
import {
  closeWechatPayTransactionByOutTradeNo,
  type WechatPayCloseTransactionByOutTradeNoInput,
} from "@/services/wechat-pay-gateway-close-transaction";
import {
  parseWechatPayJson,
  stringField,
} from "@/services/wechat-pay-gateway-response";
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
  closeRequestTimeoutMs?: number;
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
export type WechatPayCreateMiniProgramPaymentRequestInput = {
  config: WechatPayJsapiConfig;
  prepayId: string;
  secretBundle: WechatPaySecretBundle;
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
export type WechatPayQueryRefundByOutRefundNoInput = {
  config: WechatPayJsapiConfig;
  outRefundNo: string;
  secretBundle: WechatPaySecretBundle;
};
export type WechatPayRefundQueryResult = Record<string, unknown> & {
  out_refund_no?: string;
  refund_id?: string;
  status?: string;
  amount?: Record<string, unknown>;
};
export type WechatPayRequestRefundInput = {
  config: WechatPayJsapiConfig;
  transactionId: string;
  outRefundNo: string;
  reason: string;
  refundAmountFen: number;
  totalAmountFen: number;
  secretBundle: WechatPaySecretBundle;
};

export type WechatPayRequestRefundResult = {
  out_refund_no: string;
  refund_id: string | null;
  status: string;
  raw: Record<string, unknown>;
};

export class WechatPayGateway {
  private readonly fetchImpl: FetchImpl;
  private readonly nonceFactory?: () => string;
  private readonly timestampFactory?: () => string;
  private readonly closeRequestTimeoutMs?: number;

  constructor(dependencies: WechatPayGatewayDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.nonceFactory = dependencies.nonceFactory;
    this.timestampFactory = dependencies.timestampFactory;
    this.closeRequestTimeoutMs = dependencies.closeRequestTimeoutMs;
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
      paymentRequest: this.createMiniProgramPaymentRequest({
        config: input.config,
        prepayId,
        secretBundle: input.secretBundle,
      }),
    };
  }

  async closeTransactionByOutTradeNo(
    input: WechatPayCloseTransactionByOutTradeNoInput,
  ): Promise<void> {
    await closeWechatPayTransactionByOutTradeNo({
      ...input,
      fetchImpl: this.fetchImpl,
      nonce: this.createNonce(),
      timestamp: this.createTimestamp(),
      timeoutMs: this.closeRequestTimeoutMs,
    });
  }

  createMiniProgramPaymentRequest(
    input: WechatPayCreateMiniProgramPaymentRequestInput,
  ): WechatPayMiniProgramPaymentRequest {
    const appId = input.config.sub_app_id || input.config.app_id;
    if (!appId) {
      throw Errors.business(
        409,
        "微信支付小程序 AppID 配置不完整",
        "WECHAT_PAY_CONFIG_INCOMPLETE",
      );
    }
    return buildWechatPayMiniProgramPaymentRequest({
      appId,
      prepayId: input.prepayId,
      privateKeyPem: input.secretBundle.privateKeyPem,
      nonce: this.createNonce(),
      timestamp: this.createTimestamp(),
    });
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

  async requestRefund(
    input: WechatPayRequestRefundInput,
  ): Promise<WechatPayRequestRefundResult> {
    const serialNo = input.config.serial_no?.trim();
    if (!serialNo) {
      throw Errors.business(
        409,
        "微信支付证书序列号未配置",
        "WECHAT_PAY_SERIAL_NO_REQUIRED",
      );
    }

    const body = JSON.stringify(buildRefundRequestBody(input));
    const nonce = this.createNonce();
    const timestamp = this.createTimestamp();
    const urlPath = "/v3/refund/domestic/refunds";
    const authorization = buildWechatPayAuthorization({
      method: "POST",
      urlPath,
      body,
      merchantId: input.config.merchant_id || "",
      serialNo,
      privateKeyPem: input.secretBundle.privateKeyPem,
      nonce,
      timestamp,
    });
    const response = await this.fetchImpl(
      `${input.secretBundle.baseUrl}${urlPath}`,
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
        "微信支付申请退款失败",
        "WECHAT_PAY_REFUND_REQUEST_FAILED",
        {
          status: response.status,
          code: stringField(payload, "code"),
          message: stringField(payload, "message"),
        },
      );
    }

    return {
      out_refund_no: stringField(payload, "out_refund_no") ?? input.outRefundNo,
      refund_id: stringField(payload, "refund_id"),
      status: stringField(payload, "status") ?? "UNKNOWN",
      raw: payload,
    };
  }

  async queryRefundByOutRefundNo(
    input: WechatPayQueryRefundByOutRefundNoInput,
  ): Promise<WechatPayRefundQueryResult> {
    const serialNo = input.config.serial_no?.trim();
    if (!serialNo) {
      throw Errors.business(
        409,
        "微信支付证书序列号未配置",
        "WECHAT_PAY_SERIAL_NO_REQUIRED",
      );
    }

    const urlPath = buildRefundQueryUrlPath(input.config, input.outRefundNo);
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
        "微信支付查询退款失败",
        "WECHAT_PAY_REFUND_QUERY_FAILED",
        {
          status: response.status,
          code: stringField(payload, "code"),
          message: stringField(payload, "message"),
        },
      );
    }

    return payload as WechatPayRefundQueryResult;
  }

  private createNonce() {
    return this.nonceFactory?.() ?? undefined;
  }

  private createTimestamp() {
    return this.timestampFactory?.() ?? undefined;
  }
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

function buildRefundRequestBody(input: WechatPayRequestRefundInput) {
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
      sp_mchid: input.config.merchant_id,
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

function buildRefundQueryUrlPath(
  config: WechatPayJsapiConfig,
  outRefundNo: string,
) {
  if (config.merchant_mode === "service_provider_sub_merchant") {
    throw Errors.business(
      409,
      "当前暂不支持查询服务商子商户退款",
      "WECHAT_PAY_REFUND_QUERY_MODE_UNSUPPORTED",
    );
  }
  if (!config.merchant_id) {
    throw Errors.business(
      409,
      "微信支付商户号未配置",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
    );
  }
  return `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`;
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

function buildRefundAmount(input: WechatPayRequestRefundInput) {
  return {
    refund: input.refundAmountFen,
    total: input.totalAmountFen,
    currency: "CNY",
  };
}

export const wechatPayGateway = new WechatPayGateway();
