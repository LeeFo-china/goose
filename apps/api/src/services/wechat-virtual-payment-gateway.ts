import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED,
  MAX_WECHAT_VIRTUAL_PAYMENT_SECRET_LENGTH,
} from "@/services/branding-virtual-payment-contracts";

import type {
  CredentialInvalidationPort,
  ProvideVirtualGoodsInput,
  ProvideVirtualGoodsResult,
  QueryVirtualGoodsPublishResult,
  QueryVirtualGoodsTaskInput,
  QueryVirtualGoodsUploadResult,
  QueryVirtualOrderInput,
  QueryVirtualOrderResult,
  RefundVirtualOrderInput,
  RefundVirtualOrderResult,
  StartVirtualGoodsPublishInput,
  StartVirtualGoodsTaskResult,
  StartVirtualGoodsUploadInput,
  VirtualOrderReference,
  WechatVirtualPaymentFetch,
  WechatVirtualPaymentGatewayPort,
} from "./wechat-virtual-payment-gateway-contracts";
import {
  assertSuccessfulWechatResponse,
  normalizeQueryGoodsPublish,
  normalizeQueryGoodsUpload,
  normalizeQueryOrder,
  normalizeRefundSubmission,
  parseJsonRecord,
  parseWechatResponseEnvelope,
  throwInvalidResponse,
  throwWechatRejected,
  type WechatVirtualPaymentJsonResponse,
} from "./wechat-virtual-payment-gateway-response";
import {
  normalizeWechatVirtualPaymentRequestId,
  readWechatVirtualPaymentResponseBody,
} from "./wechat-virtual-payment-response-reader";
import {
  isValidVirtualGoodsId,
  isValidVirtualGoodsUploadItem,
} from "./wechat-virtual-payment-goods-input";
import {
  assertSigningSecret,
  calculateVirtualPaymentPaySig,
  calculateVirtualPaymentUserSignature,
  MAX_WECHAT_VIRTUAL_PAYMENT_AMOUNT_FEN,
  virtualPaymentEnv,
} from "./wechat-virtual-payment-signatures";

const DEFAULT_BASE_URL = "https://api.weixin.qq.com";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ACCESS_TOKEN_LENGTH = 4_096;
const MAX_OPENID_LENGTH = 128;
const MAX_WECHAT_ORDER_ID_LENGTH = 128;
const OUT_TRADE_NO_PATTERN = /^(?!_)[A-Za-z0-9_|*@-]{8,32}$/;
const REFUND_ORDER_NO_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;
const REFUND_REASONS = new Set(["0", "1", "2", "3", "4", "5"]);
const REQUEST_SOURCES = new Set(["1", "2", "3"]);

type GatewayDependencies = {
  fetchImpl?: WechatVirtualPaymentFetch;
  baseUrl?: string;
  credentialInvalidation: CredentialInvalidationPort;
};

type RequestMetadata = {
  httpStatus: number | null;
  wechatErrcode: number | null;
  requestId: string | null;
};

export class WechatVirtualPaymentGateway
  implements WechatVirtualPaymentGatewayPort {
  private readonly fetchImpl: WechatVirtualPaymentFetch;
  private readonly baseUrl: string;
  private readonly credentialInvalidation: CredentialInvalidationPort;

  constructor(dependencies: GatewayDependencies) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch;
    this.baseUrl = (dependencies.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.credentialInvalidation = dependencies.credentialInvalidation;
  }

  async startUploadGoods(
    input: StartVirtualGoodsUploadInput,
  ): Promise<StartVirtualGoodsTaskResult> {
    assertUploadGoodsInput(input);
    const body = JSON.stringify({
      upload_item: [{
        id: input.item.id,
        name: input.item.name,
        price: input.item.price,
        remark: input.item.remark,
        item_url: input.item.itemUrl,
      }],
      env: virtualPaymentEnv(input.environment),
    });
    return await this.startGoodsTask("/xpay/start_upload_goods", body, input);
  }

  async startPublishGoods(
    input: StartVirtualGoodsPublishInput,
  ): Promise<StartVirtualGoodsTaskResult> {
    assertGoodsTaskInput(input);
    if (!isValidVirtualGoodsId(input.providerProductId)) {
      throwInvalidRequest();
    }
    const body = JSON.stringify({
      publish_item: [{ id: input.providerProductId }],
      env: virtualPaymentEnv(input.environment),
    });
    return await this.startGoodsTask("/xpay/start_publish_goods", body, input);
  }

  async queryUploadGoods(
    input: QueryVirtualGoodsTaskInput,
  ): Promise<QueryVirtualGoodsUploadResult> {
    const response = await this.queryGoodsTask(
      "/xpay/query_upload_goods",
      input,
    );
    return normalizeQueryGoodsUpload(response, input);
  }

  async queryPublishGoods(
    input: QueryVirtualGoodsTaskInput,
  ): Promise<QueryVirtualGoodsPublishResult> {
    const response = await this.queryGoodsTask(
      "/xpay/query_publish_goods",
      input,
    );
    return normalizeQueryGoodsPublish(response, input);
  }

  async queryOrder(
    input: QueryVirtualOrderInput,
  ): Promise<QueryVirtualOrderResult> {
    assertSignedInput(input);
    const reference = buildOrderReference(input);
    const body = JSON.stringify({
      openid: input.openid,
      env: virtualPaymentEnv(input.environment),
      ...reference,
    });
    const paySig = calculateVirtualPaymentPaySig(
      "/xpay/query_order",
      body,
      input.signingSecret.appKey,
    );
    const response = await this.requestJson({
      path: "/xpay/query_order",
      query: { access_token: input.accessToken, pay_sig: paySig },
      body,
    });
    assertSuccessfulWechatResponse(response);
    return normalizeQueryOrder(response, input);
  }

  async refundOrder(
    input: RefundVirtualOrderInput,
  ): Promise<RefundVirtualOrderResult> {
    assertRefundInput(input);
    const reference = buildOrderReference(input);
    const body = JSON.stringify({
      openid: input.openid,
      ...reference,
      refund_order_id: input.refundOrderId,
      left_fee: input.leftFee,
      refund_fee: input.refundFee,
      biz_meta: input.bizMeta,
      refund_reason: input.refundReason,
      req_from: input.requestSource,
      env: virtualPaymentEnv(input.environment),
    });
    const paySig = calculateVirtualPaymentPaySig(
      "/xpay/refund_order",
      body,
      input.signingSecret.appKey,
    );
    const signature = calculateVirtualPaymentUserSignature(
      body,
      input.sessionKey,
    );
    const response = await this.requestJson({
      path: "/xpay/refund_order",
      query: {
        access_token: input.accessToken,
        pay_sig: paySig,
        signature,
      },
      body,
    });
    const errcode = parseWechatResponseEnvelope(response);
    if (errcode === 268490009) {
      await this.invalidateRejectedCredential(input);
      throw Errors.business(
        409,
        "微信会话已失效，请重新登录",
        BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED,
      );
    }
    if (errcode !== 0) throwWechatRejected(errcode, response);
    return normalizeRefundSubmission(response, input);
  }

  async notifyProvideGoods(
    input: ProvideVirtualGoodsInput,
  ): Promise<ProvideVirtualGoodsResult> {
    assertAccessToken(input.accessToken);
    const reference = buildOrderReference(input);
    const body = JSON.stringify({
      ...reference,
      env: virtualPaymentEnv(input.environment),
    });
    const response = await this.request({
      path: "/xpay/notify_provide_goods",
      query: { access_token: input.accessToken },
      body,
      allowEmpty: true,
    });
    if (response.payload) {
      assertSuccessfulWechatResponse({
        payload: response.payload,
        requestId: response.requestId,
        httpStatus: response.httpStatus,
      });
    }
    return { accepted: true, requestId: response.requestId };
  }

  private async queryGoodsTask(
    path: "/xpay/query_upload_goods" | "/xpay/query_publish_goods",
    input: QueryVirtualGoodsTaskInput,
  ): Promise<WechatVirtualPaymentJsonResponse> {
    assertGoodsTaskInput(input);
    const body = JSON.stringify({ env: virtualPaymentEnv(input.environment) });
    const paySig = calculateVirtualPaymentPaySig(
      path,
      body,
      input.signingSecret.appKey,
    );
    const response = await this.requestJson({
      path,
      query: { access_token: input.accessToken, pay_sig: paySig },
      body,
    });
    assertSuccessfulWechatResponse(response);
    return response;
  }

  private async startGoodsTask(
    path: "/xpay/start_upload_goods" | "/xpay/start_publish_goods",
    body: string,
    input: QueryVirtualGoodsTaskInput,
  ): Promise<StartVirtualGoodsTaskResult> {
    const paySig = calculateVirtualPaymentPaySig(
      path,
      body,
      input.signingSecret.appKey,
    );
    const response = await this.requestJson({
      path,
      query: { access_token: input.accessToken, pay_sig: paySig },
      body,
    });
    assertSuccessfulWechatResponse(response);
    return {
      accepted: true,
      requestId: response.requestId,
      environment: input.environment,
    };
  }

  private async invalidateRejectedCredential(
    input: RefundVirtualOrderInput,
  ): Promise<void> {
    try {
      await this.credentialInvalidation.invalidate({
        userId: input.credential.userId,
        openid: input.openid,
        credentialId: input.credential.credentialId,
        sessionRevision: input.credential.sessionRevision,
      });
    } catch (error) {
      if (
        error instanceof AppError &&
        error.statusCode === 409 &&
        error.code === BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED
      ) return;
      throw Errors.business(
        500,
        "微信会话失效状态保存失败",
        "WECHAT_VIRTUAL_PAYMENT_SESSION_INVALIDATION_FAILED",
      );
    }
  }

  private async requestJson(input: {
    path: string;
    query: Record<string, string>;
    body: string;
  }): Promise<WechatVirtualPaymentJsonResponse> {
    const response = await this.request({ ...input, allowEmpty: false });
    const payload = response.payload;
    if (!payload) {
      throwInvalidResponse(response.requestId, response.httpStatus);
    }
    return { ...response, payload };
  }

  private async request(input: {
    path: string;
    query: Record<string, string>;
    body: string;
    allowEmpty: boolean;
  }): Promise<{
    payload: Record<string, unknown> | null;
    requestId: string | null;
    httpStatus: number;
  }> {
    const query = new URLSearchParams(input.query);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${input.path}?${query}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: input.body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const details = emptyRequestMetadata();
      if (isTimeoutError(error)) {
        throw Errors.business(
          504,
          "微信虚拟支付接口请求超时",
          "WECHAT_VIRTUAL_PAYMENT_GATEWAY_TIMEOUT",
          details,
        );
      }
      throw Errors.business(
        502,
        "微信虚拟支付接口请求失败",
        "WECHAT_VIRTUAL_PAYMENT_TRANSPORT_FAILED",
        details,
      );
    }

    const requestId = boundedRequestId(response);
    const rawBody = await readWechatVirtualPaymentResponseBody(
      response,
      requestId,
    );
    const payload = parseJsonRecord(rawBody);
    const wechatErrcode = payload && Number.isSafeInteger(payload.errcode)
      ? Number(payload.errcode)
      : null;
    if (!response.ok) {
      throw Errors.business(
        502,
        "微信虚拟支付接口返回异常状态",
        "WECHAT_VIRTUAL_PAYMENT_HTTP_ERROR",
        {
          httpStatus: response.status,
          wechatErrcode,
          requestId,
        } satisfies RequestMetadata,
      );
    }
    if (rawBody === "" && input.allowEmpty) {
      return { payload: null, requestId, httpStatus: response.status };
    }
    if (!payload) throwInvalidResponse(requestId, response.status);
    return { payload, requestId, httpStatus: response.status };
  }
}

function assertSignedInput(input: QueryVirtualOrderInput): void {
  assertAccessToken(input.accessToken);
  if (
    !isNonBlankString(input.openid) ||
    input.openid.length > MAX_OPENID_LENGTH
  ) throwInvalidRequest();
  assertSigningSecret(input.environment, input.signingSecret);
  buildOrderReference(input);
}

function assertGoodsTaskInput(input: QueryVirtualGoodsTaskInput): void {
  assertAccessToken(input.accessToken);
  if (!input.signingSecret) throwInvalidRequest();
  assertSigningSecret(input.environment, input.signingSecret);
}

function assertUploadGoodsInput(input: StartVirtualGoodsUploadInput): void {
  assertGoodsTaskInput(input);
  if (!isValidVirtualGoodsUploadItem(input.item)) throwInvalidRequest();
}

function assertRefundInput(input: RefundVirtualOrderInput): void {
  assertSignedInput(input);
  if (
    !isNonBlankString(input.sessionKey) ||
    input.sessionKey.length > MAX_WECHAT_VIRTUAL_PAYMENT_SECRET_LENGTH ||
    !input.credential ||
    !isNonBlankString(input.credential.userId) ||
    !isNonBlankString(input.credential.credentialId) ||
    !Number.isSafeInteger(input.credential.sessionRevision) ||
    input.credential.sessionRevision <= 0 ||
    !REFUND_ORDER_NO_PATTERN.test(input.refundOrderId) ||
    !Number.isSafeInteger(input.leftFee) ||
    input.leftFee <= 0 ||
    input.leftFee > MAX_WECHAT_VIRTUAL_PAYMENT_AMOUNT_FEN ||
    !Number.isSafeInteger(input.refundFee) ||
    input.refundFee <= 0 ||
    input.refundFee > MAX_WECHAT_VIRTUAL_PAYMENT_AMOUNT_FEN ||
    input.refundFee > input.leftFee ||
    typeof input.bizMeta !== "string" ||
    input.bizMeta.length > 1_024 ||
    !REFUND_REASONS.has(input.refundReason) ||
    !REQUEST_SOURCES.has(input.requestSource)
  ) throwInvalidRequest();
}

function assertAccessToken(accessToken: string): void {
  if (
    !isNonBlankString(accessToken) ||
    accessToken.length > MAX_ACCESS_TOKEN_LENGTH
  ) throwInvalidRequest();
}

function buildOrderReference(
  input: VirtualOrderReference,
): { order_id: string } | { wx_order_id: string } {
  const hasOrderId = isNonBlankString(input.orderId);
  const hasWechatOrderId = isNonBlankString(input.wechatOrderId);
  if (hasOrderId === hasWechatOrderId) throwInvalidRequest();
  if (hasOrderId && input.orderId) {
    if (!OUT_TRADE_NO_PATTERN.test(input.orderId)) throwInvalidRequest();
    return { order_id: input.orderId };
  }
  if (input.wechatOrderId) {
    if (
      input.wechatOrderId !== input.wechatOrderId.trim() ||
      input.wechatOrderId.length > MAX_WECHAT_ORDER_ID_LENGTH
    ) throwInvalidRequest();
    return { wx_order_id: input.wechatOrderId };
  }
  throwInvalidRequest();
}

function boundedRequestId(response: Response): string | null {
  return normalizeWechatVirtualPaymentRequestId(
    response.headers.get("request-id"),
  ) ?? normalizeWechatVirtualPaymentRequestId(
    response.headers.get("x-request-id"),
  );
}

function emptyRequestMetadata(): RequestMetadata {
  return { httpStatus: null, wechatErrcode: null, requestId: null };
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  return error.name === "TimeoutError" || error.name === "AbortError";
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function throwInvalidRequest(): never {
  throw Errors.business(
    400,
    "微信虚拟支付请求参数不正确",
    "WECHAT_VIRTUAL_PAYMENT_REQUEST_INVALID",
  );
}
