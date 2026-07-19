import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import { readVerifiedWechatPayJson } from "@/services/wechat-pay-api-response";
import {
  closeWechatPayTransactionByOutTradeNo,
  type WechatPayCloseTransactionByOutTradeNoInput,
} from "@/services/wechat-pay-gateway-close-transaction";
import {
  buildWechatPayRefundQueryUrlPath,
  buildWechatPayRefundRequestBody,
  buildWechatPayTransactionQueryUrlPath,
} from "@/services/wechat-pay-gateway-request-builders";
import { normalizeWechatPayPrepayRequestTimeout } from "@/services/wechat-pay-gateway-create-prepay";
import type {
  WechatPayQueryTransactionByOutTradeNoInput,
  WechatPayTransactionQueryResult,
} from "@/services/wechat-pay-gateway-query-transaction";
import { normalizeWechatPayQueryRequestTimeout } from "@/services/wechat-pay-gateway-query-transaction";
import { stringField } from "@/services/wechat-pay-gateway-response";
import {
  buildWechatPayJsapiPrepayRequest,
  type WechatPayJsapiConfig,
  type WechatPayJsapiOrder,
} from "@/services/wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";
import { convertWechatPayTransactionQueryPayload } from "@/services/wechat-pay-transaction-contract";
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
  closeRequestTimeoutMs?: number;
  prepayRequestTimeoutMs?: number;
  queryRequestTimeoutMs?: number;
};
type WechatPayOperation = "jsapi_prepay" | "transaction_query" | "refund_request" | "refund_query";
export const DEFAULT_WECHAT_PAY_REQUEST_TIMEOUT_MS = 10_000;
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
export type {
  WechatPayQueryTransactionByOutTradeNoInput,
  WechatPayTransactionQueryResult,
} from "@/services/wechat-pay-gateway-query-transaction";
export type WechatPayQueryRefundByOutRefundNoInput = {
  config: WechatPayJsapiConfig;
  outRefundNo: string;
  secretBundle: WechatPaySecretBundle;
};
export type WechatPayRefundQueryResult = Record<string, unknown> & {
  out_refund_no?: string;
  refund_id?: string;
  transaction_id?: string;
  out_trade_no?: string;
  status?: string;
  success_time?: string;
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
  private readonly closeRequestTimeoutMs?: number;
  private readonly prepayRequestTimeoutMs?: number;
  private readonly queryRequestTimeoutMs?: number;

  constructor(dependencies: WechatPayGatewayDependencies = {}) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.nonceFactory = dependencies.nonceFactory;
    this.timestampFactory = dependencies.timestampFactory;
    this.requestTimeoutMs = dependencies.requestTimeoutMs ??
      DEFAULT_WECHAT_PAY_REQUEST_TIMEOUT_MS;
    this.nowSecondsFactory = dependencies.nowSecondsFactory ??
      (() => Math.floor(Date.now() / 1_000));
    this.closeRequestTimeoutMs = dependencies.closeRequestTimeoutMs;
    this.prepayRequestTimeoutMs = dependencies.prepayRequestTimeoutMs;
    this.queryRequestTimeoutMs = dependencies.queryRequestTimeoutMs;
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
      timeoutMs: normalizeWechatPayPrepayRequestTimeout(this.prepayRequestTimeoutMs),
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
      nowSeconds: this.nowSecondsFactory(),
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
    const serialNo = requireSerialNo(input.config);
    const urlPath = buildWechatPayTransactionQueryUrlPath(input.config, input.outTradeNo);
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
      timeoutMs: normalizeWechatPayQueryRequestTimeout(
        this.queryRequestTimeoutMs,
      ),
    });
    return convertWechatPayTransactionQueryPayload(
      result.payload,
      result.requestId,
    );
  }

  async requestRefund(
    input: WechatPayRequestRefundInput,
  ): Promise<WechatPayRequestRefundResult> {
    const serialNo = requireSerialNo(input.config);
    const body = JSON.stringify(buildWechatPayRefundRequestBody(input));
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

    const urlPath = buildWechatPayRefundQueryUrlPath(input.config, input.outRefundNo);
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
    timeoutMs?: number;
  }) {
    const controller = new AbortController();
    const timeoutMs = normalizeWechatPayPrepayRequestTimeout(
      input.timeoutMs ?? this.requestTimeoutMs,
    );
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
          { ...details, reason: "timeout", timeout_ms: timeoutMs },
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
        { ...details, reason: "network_error" },
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

export { normalizeWechatPayPrepayRequestTimeout };

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

export const wechatPayGateway = new WechatPayGateway();
