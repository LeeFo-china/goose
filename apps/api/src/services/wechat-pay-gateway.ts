import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { readVerifiedWechatPayJson } from "@/services/wechat-pay-api-response";
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
  requestTimeoutMs?: number;
  nowSecondsFactory?: () => number;
};

type WechatPayOperation = "jsapi_prepay" | "transaction_query" | "refund_request" | "refund_query";

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

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
  requestId: string | null;
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
  requestId: string | null;
  raw: Record<string, unknown>;
};

export class WechatPayGateway {
  private readonly fetchImpl: FetchImpl;
  private readonly nonceFactory?: () => string;
  private readonly timestampFactory?: () => string;
  private readonly requestTimeoutMs: number;
  private readonly nowSecondsFactory: () => number;

  constructor(dependencies: WechatPayGatewayDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.nonceFactory = dependencies.nonceFactory;
    this.timestampFactory = dependencies.timestampFactory;
    this.requestTimeoutMs = dependencies.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.nowSecondsFactory = dependencies.nowSecondsFactory ??
      (() => Math.floor(Date.now() / 1_000));
  }

  async createJsapiPrepay(
    input: WechatPayCreateJsapiPrepayInput,
  ): Promise<WechatPayCreateJsapiPrepayResult> {
    const serialNo = requireSerialNo(input.config);
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
    const result = await this.requestVerifiedJson({
      operation: "jsapi_prepay",
      failureMessage: "微信支付预下单失败",
      failureCode: "WECHAT_PAY_PREPAY_FAILED",
      url: `${input.secretBundle.baseUrl}${prepayRequest.urlPath}`,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body,
      },
      secretBundle: input.secretBundle,
    });
    const { payload } = result;
    const prepayId = stringField(payload, "prepay_id");
    if (!prepayId) {
      throw Errors.business(
        502,
        "微信支付预下单响应缺少 prepay_id",
        "WECHAT_PAY_PREPAY_RESPONSE_INVALID",
        { operation: "jsapi_prepay", requestId: result.requestId },
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
    const serialNo = requireSerialNo(input.config);
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
    const result = await this.requestVerifiedJson({
      operation: "transaction_query",
      failureMessage: "微信支付查单失败",
      failureCode: "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
      url: `${input.secretBundle.baseUrl}${urlPath}`,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
        },
      },
      secretBundle: input.secretBundle,
    });
    const { payload } = result;
    return payload as WechatPayTransactionQueryResult;
  }

  async requestRefund(
    input: WechatPayRequestRefundInput,
  ): Promise<WechatPayRequestRefundResult> {
    const serialNo = requireSerialNo(input.config);
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
    const result = await this.requestVerifiedJson({
      operation: "refund_request",
      failureMessage: "微信支付申请退款失败",
      failureCode: "WECHAT_PAY_REFUND_REQUEST_FAILED",
      url: `${input.secretBundle.baseUrl}${urlPath}`,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body,
      },
      secretBundle: input.secretBundle,
    });
    const { payload } = result;
    return {
      out_refund_no: stringField(payload, "out_refund_no") ?? input.outRefundNo,
      refund_id: stringField(payload, "refund_id"),
      status: stringField(payload, "status") ?? "UNKNOWN",
      requestId: result.requestId,
      raw: payload,
    };
  }

  async queryRefundByOutRefundNo(
    input: WechatPayQueryRefundByOutRefundNoInput,
  ): Promise<WechatPayRefundQueryResult> {
    const serialNo = requireSerialNo(input.config);

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
    const result = await this.requestVerifiedJson({
      operation: "refund_query",
      failureMessage: "微信支付查询退款失败",
      failureCode: "WECHAT_PAY_REFUND_QUERY_FAILED",
      url: `${input.secretBundle.baseUrl}${urlPath}`,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
        },
      },
      secretBundle: input.secretBundle,
    });
    const { payload } = result;
    return { ...payload, requestId: result.requestId } as WechatPayRefundQueryResult;
  }

  private async requestVerifiedJson(input: {
    operation: WechatPayOperation;
    failureMessage: string;
    failureCode: string;
    url: string;
    init: RequestInit;
    secretBundle: WechatPaySecretBundle;
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    let requestId: string | null = null;
    try {
      const response = await this.fetchImpl(input.url, {
        ...input.init,
        signal: controller.signal,
      });
      requestId = response.headers.get("request-id")?.trim() || null;
      const verified = await readVerifiedWechatPayJson({
        response,
        publicKeyId: input.secretBundle.wechatPayPublicKeyId,
        publicKeyPem: input.secretBundle.wechatPayPublicKeyPem,
        nowSeconds: this.nowSecondsFactory(),
      });
      if (!response.ok) {
        throw Errors.business(502, input.failureMessage, input.failureCode, {
          status: response.status,
          code: stringField(verified.payload, "code"),
          message: stringField(verified.payload, "message"),
        });
      }
      return verified;
    } catch (error) {
      const details = { operation: input.operation, requestId };
      if (controller.signal.aborted || isAbortError(error)) {
        throw Errors.business(
          504,
          "微信支付接口请求超时",
          "WECHAT_PAY_TRANSPORT_TIMEOUT",
          details,
        );
      }
      if (error instanceof AppError) {
        throw Errors.business(error.statusCode, error.message, error.code, {
          ...recordDetails(error.details),
          ...details,
        });
      }
      throw Errors.business(
        502,
        "微信支付接口请求失败",
        "WECHAT_PAY_TRANSPORT_FAILED",
        details,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private createNonce() {
    return this.nonceFactory?.() ?? undefined;
  }

  private createTimestamp() {
    return this.timestampFactory?.() ?? undefined;
  }
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireSerialNo(config: WechatPayJsapiConfig) {
  const serialNo = config.serial_no?.trim();
  if (!serialNo) {
    throw Errors.business(
      409,
      "微信支付证书序列号未配置",
      "WECHAT_PAY_SERIAL_NO_REQUIRED",
    );
  }
  return serialNo;
}

function recordDetails(details: unknown) {
  return details && typeof details === "object" && !Array.isArray(details)
    ? details as Record<string, unknown>
    : {};
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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

function buildRefundAmount(input: WechatPayRequestRefundInput) {
  return {
    refund: input.refundAmountFen,
    total: input.totalAmountFen,
    currency: "CNY",
  };
}

export const wechatPayGateway = new WechatPayGateway();
