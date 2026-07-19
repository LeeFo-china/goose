import { z } from "zod";

import { Errors } from "@/errors/error-factory";

export type WechatRefundStatus =
  | "PROCESSING"
  | "SUCCESS"
  | "CLOSED"
  | "ABNORMAL";

export type WechatRefundApiPayload = Record<string, unknown> & {
  requestId: string | null;
};

export type WechatRefundExpectedBinding = {
  outRefundNo: string;
  wechatRefundId: string | null;
  transactionId: string;
  outTradeNo: string;
  refundAmountFen: number;
  totalAmountFen: number;
  currency: "CNY";
};

type DirectMerchantCallbackBinding = {
  merchantMode: "direct_merchant";
  merchantId: string;
};

type ServiceProviderCallbackBinding = {
  merchantMode: "service_provider_sub_merchant";
  merchantId: string;
  subMerchantId: string;
};

export type WechatRefundCallbackExpectedBinding =
  WechatRefundExpectedBinding &
    (DirectMerchantCallbackBinding | ServiceProviderCallbackBinding);

export type WechatRefundValidatedResult = {
  outRefundNo: string;
  wechatRefundId: string;
  transactionId: string;
  outTradeNo: string;
  status: WechatRefundStatus;
  refundAmountFen: number;
  totalAmountFen: number;
  currency: "CNY";
  requestId: string | null;
  successTime: string | null;
};

const WECHAT_REFUND_STATUSES = new Set<WechatRefundStatus>([
  "PROCESSING",
  "SUCCESS",
  "CLOSED",
  "ABNORMAL",
]);

const REFUND_EVENT_BY_STATUS = {
  SUCCESS: "REFUND.SUCCESS",
  CLOSED: "REFUND.CLOSED",
  ABNORMAL: "REFUND.ABNORMAL",
} as const;
const rfc3339Schema = z.iso.datetime({ offset: true });

export function parseAndAssertWechatRefund(
  payload: WechatRefundApiPayload,
  expected: WechatRefundExpectedBinding,
): WechatRefundValidatedResult {
  if (
    !Object.hasOwn(payload, "requestId") ||
    !isRequestId(payload.requestId)
  ) {
    throwRefundMismatch("request_id");
  }

  return parseAndAssertRefundCore({
    payload,
    expected,
    statusField: "status",
    currencyRequired: true,
    requestId: payload.requestId,
  });
}

export function parseAndAssertWechatRefundCallback(
  resource: Record<string, unknown>,
  expected: WechatRefundCallbackExpectedBinding,
): WechatRefundValidatedResult {
  assertCallbackMerchantMatches(resource, expected);
  return parseAndAssertRefundCore({
    payload: resource,
    expected,
    statusField: "refund_status",
    currencyRequired: false,
    requestId: null,
  });
}

export function assertWechatRefundEventMatches(
  eventType: string,
  status: WechatRefundStatus,
): void {
  const expectedEvent = status === "PROCESSING"
    ? undefined
    : REFUND_EVENT_BY_STATUS[status as keyof typeof REFUND_EVENT_BY_STATUS];
  if (!expectedEvent || eventType !== expectedEvent) {
    throw Errors.business(
      409,
      "微信退款回调事件与退款状态不一致",
      "BILLING_RECHARGE_WECHAT_REFUND_EVENT_MISMATCH",
      { field: "event_type_refund_status" },
    );
  }
}

function parseAndAssertRefundCore(input: {
  payload: Record<string, unknown>;
  expected: WechatRefundExpectedBinding;
  statusField: "status" | "refund_status";
  currencyRequired: boolean;
  requestId: string | null;
}): WechatRefundValidatedResult {
  const outRefundNo = exactString(input.payload.out_refund_no);
  assertMatches("out_refund_no", outRefundNo, input.expected.outRefundNo);

  const wechatRefundId = exactString(input.payload.refund_id);
  if (!wechatRefundId) throwRefundMismatch("refund_id");
  if (
    input.expected.wechatRefundId !== null &&
    wechatRefundId !== input.expected.wechatRefundId
  ) {
    throwRefundMismatch("refund_id");
  }

  const transactionId = exactString(input.payload.transaction_id);
  assertMatches("transaction_id", transactionId, input.expected.transactionId);

  const outTradeNo = exactString(input.payload.out_trade_no);
  assertMatches("out_trade_no", outTradeNo, input.expected.outTradeNo);

  const amount = recordField(input.payload.amount);
  const refundAmountFen = positiveIntegerField(amount, "refund");
  assertMatches(
    "amount.refund",
    refundAmountFen,
    input.expected.refundAmountFen,
  );
  const totalAmountFen = positiveIntegerField(amount, "total");
  assertMatches("amount.total", totalAmountFen, input.expected.totalAmountFen);
  if (
    input.currencyRequired ||
    Boolean(amount && Object.hasOwn(amount, "currency"))
  ) {
    const currency = exactString(amount?.currency);
    assertMatches("amount.currency", currency, input.expected.currency);
  }

  const status = exactString(input.payload[input.statusField]);
  if (!isWechatRefundStatus(status)) throwRefundMismatch(input.statusField);
  const successTime = status === "SUCCESS"
    ? validatedSuccessTime(input.payload.success_time)
    : null;

  return {
    outRefundNo,
    wechatRefundId,
    transactionId,
    outTradeNo,
    status,
    refundAmountFen,
    totalAmountFen,
    currency: "CNY",
    requestId: input.requestId,
    successTime,
  };
}

function validatedSuccessTime(value: unknown): string {
  const result = rfc3339Schema.safeParse(value);
  if (!result.success) throwRefundMismatch("success_time");
  return result.data;
}

function assertCallbackMerchantMatches(
  resource: Record<string, unknown>,
  expected: WechatRefundCallbackExpectedBinding,
): void {
  if (expected.merchantMode === "direct_merchant") {
    assertMatches(
      "mchid",
      exactString(resource.mchid),
      expected.merchantId,
    );
    return;
  }

  assertMatches(
    "sp_mchid",
    exactString(resource.sp_mchid),
    expected.merchantId,
  );
  assertMatches(
    "sub_mchid",
    exactString(resource.sub_mchid),
    expected.subMerchantId,
  );
}

function assertMatches(
  field: string,
  actual: string | number | null,
  expected: string | number,
): asserts actual is string | number {
  if (actual !== expected) throwRefundMismatch(field);
}

function throwRefundMismatch(field: string): never {
  throw Errors.business(
    502,
    "微信退款结果与本地退款申请不一致",
    "BILLING_RECHARGE_WECHAT_REFUND_MISMATCH",
    { field },
  );
}

function exactString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    ? value
    : null;
}

function recordField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveIntegerField(
  record: Record<string, unknown> | null,
  field: string,
): number | null {
  const value = record?.[field];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function isWechatRefundStatus(value: string | null): value is WechatRefundStatus {
  return value !== null && WECHAT_REFUND_STATUSES.has(value as WechatRefundStatus);
}

function isRequestId(value: unknown): value is string | null {
  return value === null || exactString(value) !== null;
}
