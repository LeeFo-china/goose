import { Errors } from "@/errors/error-factory";

import type {
  QueryVirtualOrderInput,
  QueryVirtualOrderResult,
  RefundVirtualOrderInput,
  RefundVirtualOrderResult,
  VirtualOrderStatus,
  VirtualOrderType,
  VirtualSettlementState,
} from "./wechat-virtual-payment-gateway-contracts";

export type WechatVirtualPaymentJsonResponse = {
  payload: Record<string, unknown>;
  requestId: string | null;
  httpStatus: number;
};

type RequestMetadata = {
  httpStatus: number | null;
  wechatErrcode: number | null;
  requestId: string | null;
};

export function assertSuccessfulWechatResponse(
  response: WechatVirtualPaymentJsonResponse,
): void {
  const errcode = parseWechatResponseEnvelope(response);
  if (errcode !== 0) throwWechatRejected(errcode, response);
}

export function parseWechatResponseEnvelope(
  response: WechatVirtualPaymentJsonResponse,
): number {
  if (
    !Number.isSafeInteger(response.payload.errcode) ||
    typeof response.payload.errmsg !== "string"
  ) throwInvalidResponse(response.requestId, response.httpStatus);
  return Number(response.payload.errcode);
}

export function normalizeQueryOrder(
  response: WechatVirtualPaymentJsonResponse,
  input: QueryVirtualOrderInput,
): QueryVirtualOrderResult {
  const order = requireRecord(
    response.payload.order,
    response.requestId,
    response.httpStatus,
  );
  const orderId = requireNonBlankString(order, "order_id", response);
  const wechatOrderId = optionalProviderId(order, "wx_order_id", response);
  const environment = parseEnvironmentType(order.env_type, response);
  if (
    environment !== input.environment ||
    (input.orderId && orderId !== input.orderId) ||
    (input.wechatOrderId && wechatOrderId !== input.wechatOrderId)
  ) throwInvalidResponse(response.requestId, response.httpStatus);

  return {
    requestId: response.requestId,
    environment,
    orderId,
    status: parseOrderStatus(order.status, response),
    businessType: parseBusinessType(order.biz_type, response),
    orderType: parseOrderType(order.order_type, response),
    orderFee: requireUnsignedInteger(order, "order_fee", response),
    couponFee: optionalUnsignedInteger(order, "coupon_fee", response),
    paidFee: requireUnsignedInteger(order, "paid_fee", response),
    refundFee: requireUnsignedInteger(order, "refund_fee", response),
    leftFee: requireUnsignedInteger(order, "left_fee", response),
    createdAt: requireUnsignedInteger(order, "create_time", response),
    updatedAt: requireUnsignedInteger(order, "update_time", response),
    paidAt: requireUnsignedInteger(order, "paid_time", response),
    providedAt: requireUnsignedInteger(order, "provide_time", response),
    wechatOrderId,
    channelOrderId: optionalProviderId(order, "channel_order_id", response),
    wechatPayOrderId: optionalProviderId(order, "wxpay_order_id", response),
    settledAt: optionalUnsignedInteger(order, "sett_time", response),
    settlementState: parseOptionalSettlementState(order.sett_state, response),
    platformFeeFen: optionalUnsignedInteger(
      order,
      "platform_fee_fen",
      response,
    ),
    cpsFeeFen: optionalUnsignedInteger(order, "cps_fee_fen", response),
  };
}

export function normalizeRefundSubmission(
  response: WechatVirtualPaymentJsonResponse,
  input: RefundVirtualOrderInput,
): RefundVirtualOrderResult {
  const refundOrderId = requireNonBlankString(
    response.payload,
    "refund_order_id",
    response,
  );
  const payOrderId = requireNonBlankString(
    response.payload,
    "pay_order_id",
    response,
  );
  const payWechatOrderId = optionalProviderId(
    response.payload,
    "pay_wx_order_id",
    response,
  );
  if (
    refundOrderId !== input.refundOrderId ||
    (input.orderId && payOrderId !== input.orderId) ||
    (input.wechatOrderId && payWechatOrderId !== input.wechatOrderId)
  ) throwInvalidResponse(response.requestId, response.httpStatus);
  return {
    status: "submitted",
    requestId: response.requestId,
    refundOrderId,
    refundWechatOrderId: optionalProviderId(
      response.payload,
      "refund_wx_order_id",
      response,
    ),
    payOrderId,
    payWechatOrderId,
  };
}

export function parseJsonRecord(rawBody: string): Record<string, unknown> | null {
  if (!rawBody) return null;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function throwWechatRejected(
  errcode: number,
  response: Pick<WechatVirtualPaymentJsonResponse, "httpStatus" | "requestId">,
): never {
  throw Errors.business(
    502,
    "微信虚拟支付接口拒绝请求",
    "WECHAT_VIRTUAL_PAYMENT_UPSTREAM_REJECTED",
    {
      httpStatus: response.httpStatus,
      wechatErrcode: errcode,
      requestId: response.requestId,
    } satisfies RequestMetadata,
  );
}

export function throwInvalidResponse(
  requestId: string | null,
  httpStatus: number,
): never {
  throw Errors.business(
    502,
    "微信虚拟支付接口应答格式不正确",
    "WECHAT_VIRTUAL_PAYMENT_RESPONSE_INVALID",
    { httpStatus, wechatErrcode: null, requestId } satisfies RequestMetadata,
  );
}

function requireRecord(
  value: unknown,
  requestId: string | null,
  httpStatus: number,
): Record<string, unknown> {
  if (!isRecord(value)) throwInvalidResponse(requestId, httpStatus);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireNonBlankString(
  record: Record<string, unknown>,
  key: string,
  response: WechatVirtualPaymentJsonResponse,
): string {
  const value = record[key];
  if (!isNonBlankString(value)) {
    throwInvalidResponse(response.requestId, response.httpStatus);
  }
  return value;
}

function optionalProviderId(
  record: Record<string, unknown>,
  key: string,
  response: WechatVirtualPaymentJsonResponse,
): string | null {
  const value = record[key];
  if (typeof value !== "string") {
    throwInvalidResponse(response.requestId, response.httpStatus);
  }
  return value.trim() ? value : null;
}

function requireUnsignedInteger(
  record: Record<string, unknown>,
  key: string,
  response: WechatVirtualPaymentJsonResponse,
): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throwInvalidResponse(response.requestId, response.httpStatus);
  }
  return Number(value);
}

function optionalUnsignedInteger(
  record: Record<string, unknown>,
  key: string,
  response: WechatVirtualPaymentJsonResponse,
): number | null {
  if (!(key in record)) return null;
  return requireUnsignedInteger(record, key, response);
}

function parseOrderStatus(
  value: unknown,
  response: WechatVirtualPaymentJsonResponse,
): VirtualOrderStatus {
  if (
    value === 0 || value === 1 || value === 2 || value === 3 || value === 4 ||
    value === 5 || value === 6 || value === 7 || value === 8 || value === 9 ||
    value === 10
  ) return value;
  throwInvalidResponse(response.requestId, response.httpStatus);
}

function parseOrderType(
  value: unknown,
  response: WechatVirtualPaymentJsonResponse,
): VirtualOrderType {
  if (value === 0 || value === 1 || value === 7 || value === 8) return value;
  throwInvalidResponse(response.requestId, response.httpStatus);
}

function parseBusinessType(
  value: unknown,
  response: WechatVirtualPaymentJsonResponse,
): 0 {
  if (value === 0) return value;
  throwInvalidResponse(response.requestId, response.httpStatus);
}

function parseEnvironmentType(
  value: unknown,
  response: WechatVirtualPaymentJsonResponse,
): "production" | "sandbox" {
  if (value === 1) return "production";
  if (value === 2) return "sandbox";
  throwInvalidResponse(response.requestId, response.httpStatus);
}

function parseOptionalSettlementState(
  value: unknown,
  response: WechatVirtualPaymentJsonResponse,
): VirtualSettlementState | null {
  if (value === undefined) return null;
  if (value === 0 || value === 1 || value === 2 || value === 3) return value;
  throwInvalidResponse(response.requestId, response.httpStatus);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
