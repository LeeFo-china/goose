import { z } from "zod";

import { Errors } from "@/errors/error-factory";

export type WechatPayTradeState =
  | "SUCCESS"
  | "REFUND"
  | "NOTPAY"
  | "CLOSED"
  | "REVOKED"
  | "USERPAYING"
  | "PAYERROR";

type DirectMerchantBinding = {
  merchantMode: "direct_merchant";
  merchantId: string;
};

type PartnerMerchantBinding = {
  merchantMode: "service_provider_sub_merchant";
  merchantId: string;
  subMerchantId: string;
};

export type WechatPayTransactionExpectedBinding =
  (DirectMerchantBinding | PartnerMerchantBinding) & {
    outTradeNo: string;
    amountFen: number;
    transactionId: string | null;
  };

export type WechatPayTransactionLocalBinding = {
  merchantMode: "direct_merchant" | "service_provider_sub_merchant";
  merchantId: string | null;
  subMerchantId: string | null;
  outTradeNo: string | null;
  amountFen: number;
  transactionId: string | null;
};

type WhitelistedTransaction = {
  appid?: unknown;
  mchid?: unknown;
  sp_mchid?: unknown;
  sub_mchid?: unknown;
  out_trade_no?: unknown;
  transaction_id?: unknown;
  trade_state?: unknown;
  success_time?: unknown;
  amount?: {
    total?: unknown;
    currency?: unknown;
  };
};

export type WechatPayTransactionQueryPayload = WhitelistedTransaction & {
  requestId?: string | null;
};

export type WechatPayTransactionCallbackResource = WhitelistedTransaction;

export type WechatPayValidatedTransaction = {
  appid: string | null;
  merchantMode: "direct_merchant" | "service_provider_sub_merchant";
  merchantId: string;
  subMerchantId: string | null;
  outTradeNo: string;
  transactionId: string | null;
  tradeState: WechatPayTradeState;
  successTime: string | null;
  amountFen: number | null;
  currency: "CNY" | null;
  requestId: string | null;
};

export type WechatPayValidatedSuccessTransaction =
  WechatPayValidatedTransaction & {
    transactionId: string;
    tradeState: "SUCCESS";
    successTime: string;
    amountFen: number;
    currency: "CNY";
  };

const TRADE_STATES = new Set<WechatPayTradeState>([
  "SUCCESS",
  "REFUND",
  "NOTPAY",
  "CLOSED",
  "REVOKED",
  "USERPAYING",
  "PAYERROR",
]);
const rfc3339Schema = z.iso.datetime({ offset: true });

export function buildWechatPayTransactionExpectedBinding(
  input: WechatPayTransactionLocalBinding,
): WechatPayTransactionExpectedBinding {
  const merchantId = exactString(input.merchantId);
  if (!merchantId) throwInvalidLocalBinding("merchant_id");
  const outTradeNo = exactString(input.outTradeNo);
  if (!outTradeNo) throwInvalidLocalBinding("out_trade_no");
  const amountFen = positiveSafeInteger(input.amountFen);
  if (!amountFen) throwInvalidLocalBinding("amount_fen");
  const transactionId = input.transactionId === null
    ? null
    : exactString(input.transactionId);
  if (input.transactionId !== null && !transactionId) {
    throwInvalidLocalBinding("transaction_id");
  }
  const common = { merchantId, outTradeNo, amountFen, transactionId };
  if (input.merchantMode === "direct_merchant") {
    return { merchantMode: "direct_merchant", ...common };
  }
  const subMerchantId = exactString(input.subMerchantId);
  if (!subMerchantId) throwInvalidLocalBinding("sub_merchant_id");
  return {
    merchantMode: "service_provider_sub_merchant",
    subMerchantId,
    ...common,
  };
}

export function convertWechatPayTransactionQueryPayload(
  payload: Record<string, unknown>,
  requestId: string | null,
): WechatPayTransactionQueryPayload {
  return { ...convertTransaction(payload), requestId };
}

export function convertWechatPayTransactionCallbackResource(
  resource: Record<string, unknown>,
): WechatPayTransactionCallbackResource {
  return convertTransaction(resource);
}

export function parseAndAssertWechatPayTransactionQuery(
  payload: WechatPayTransactionQueryPayload,
  expected: WechatPayTransactionExpectedBinding,
): WechatPayValidatedTransaction {
  if (!isRequestId(payload.requestId)) throwMismatch("request_id");
  return parseAndAssertCore(payload, expected, payload.requestId);
}

export function parseAndAssertWechatPayTransactionCallback(
  eventType: string,
  resource: WechatPayTransactionCallbackResource,
  expected: WechatPayTransactionExpectedBinding,
): WechatPayValidatedSuccessTransaction {
  if (eventType !== "TRANSACTION.SUCCESS") {
    throw Errors.business(
      409,
      "微信支付回调事件类型无效",
      "BILLING_RECHARGE_WECHAT_TRANSACTION_EVENT_MISMATCH",
      { field: "event_type" },
    );
  }
  const transaction = parseAndAssertCore(resource, expected, null);
  if (transaction.tradeState !== "SUCCESS") throwMismatch("trade_state");
  return transaction as WechatPayValidatedSuccessTransaction;
}

export function assertWechatPaySuccessTransaction(
  transaction: WechatPayValidatedTransaction,
): asserts transaction is WechatPayValidatedSuccessTransaction {
  if (transaction.tradeState !== "SUCCESS") throwMismatch("trade_state");
}

function parseAndAssertCore(
  payload: WhitelistedTransaction,
  expected: WechatPayTransactionExpectedBinding,
  requestId: string | null,
): WechatPayValidatedTransaction {
  const appid = exactString(payload.appid);
  const merchant = assertMerchant(payload, expected);
  const outTradeNo = exactString(payload.out_trade_no);
  assertMatches("out_trade_no", outTradeNo, expected.outTradeNo);

  const tradeState = exactString(payload.trade_state);
  if (!isTradeState(tradeState)) throwMismatch("trade_state");

  if (tradeState !== "SUCCESS") {
    return {
      appid,
      ...merchant,
      outTradeNo,
      transactionId: null,
      tradeState,
      successTime: null,
      amountFen: null,
      currency: null,
      requestId,
    };
  }

  const transactionId = exactString(payload.transaction_id);
  if (!transactionId) throwMismatch("transaction_id");
  if (expected.transactionId && transactionId !== expected.transactionId) {
    throwMismatch("transaction_id");
  }

  const amountFen = positiveSafeInteger(payload.amount?.total);
  assertMatches("amount.total", amountFen, expected.amountFen);
  const currency = exactString(payload.amount?.currency);
  assertMatches("amount.currency", currency, "CNY");
  const successTime = rfc3339Schema.safeParse(payload.success_time);
  if (!successTime.success) throwMismatch("success_time");

  return {
    appid,
    ...merchant,
    outTradeNo,
    transactionId,
    tradeState,
    successTime: successTime.data,
    amountFen,
    currency: "CNY",
    requestId,
  };
}

function assertMerchant(
  payload: WhitelistedTransaction,
  expected: WechatPayTransactionExpectedBinding,
): Pick<WechatPayValidatedTransaction, "merchantMode" | "merchantId" | "subMerchantId"> {
  if (expected.merchantMode === "direct_merchant") {
    const merchantId = exactString(payload.mchid);
    assertMatches("mchid", merchantId, expected.merchantId);
    return {
      merchantMode: expected.merchantMode,
      merchantId,
      subMerchantId: null,
    };
  }

  const merchantId = exactString(payload.sp_mchid);
  assertMatches("sp_mchid", merchantId, expected.merchantId);
  const subMerchantId = exactString(payload.sub_mchid);
  assertMatches("sub_mchid", subMerchantId, expected.subMerchantId);
  return { merchantMode: expected.merchantMode, merchantId, subMerchantId };
}

function convertTransaction(payload: Record<string, unknown>): WhitelistedTransaction {
  const amount = recordField(payload.amount);
  return {
    appid: payload.appid,
    mchid: payload.mchid,
    sp_mchid: payload.sp_mchid,
    sub_mchid: payload.sub_mchid,
    out_trade_no: payload.out_trade_no,
    transaction_id: payload.transaction_id,
    trade_state: payload.trade_state,
    success_time: payload.success_time,
    amount: { total: amount?.total, currency: amount?.currency },
  };
}

function assertMatches<T extends string | number>(
  field: string,
  actual: T | null,
  expected: T,
): asserts actual is T {
  if (actual !== expected) throwMismatch(field);
}

function throwMismatch(field: string): never {
  throw Errors.business(
    502,
    "微信支付交易与本地充值订单不一致",
    "BILLING_RECHARGE_WECHAT_TRANSACTION_MISMATCH",
    { field },
  );
}

function throwInvalidLocalBinding(field: string): never {
  throw Errors.business(
    409,
    "本地微信支付交易绑定信息不完整",
    "BILLING_RECHARGE_WECHAT_TRANSACTION_BINDING_INVALID",
    { field },
  );
}

function exactString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    ? value
    : null;
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function recordField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isTradeState(value: string | null): value is WechatPayTradeState {
  return value !== null && TRADE_STATES.has(value as WechatPayTradeState);
}

function isRequestId(value: unknown): value is string {
  return exactString(value) !== null;
}
