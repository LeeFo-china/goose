import type { WechatPayJsapiConfig } from "@/services/wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";
import type { WechatPayTransactionQueryPayload } from "@/services/wechat-pay-transaction-contract";

export type WechatPayQueryTransactionByOutTradeNoInput = {
  config: WechatPayJsapiConfig;
  outTradeNo: string;
  secretBundle: WechatPaySecretBundle;
};

export type WechatPayTransactionQueryResult = WechatPayTransactionQueryPayload;

const DEFAULT_QUERY_REQUEST_TIMEOUT_MS = 10_000;
const MIN_QUERY_REQUEST_TIMEOUT_MS = 1_000;
const MAX_QUERY_REQUEST_TIMEOUT_MS = 60_000;

export function normalizeWechatPayQueryRequestTimeout(
  timeoutMs: number | undefined,
): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return DEFAULT_QUERY_REQUEST_TIMEOUT_MS;
  }
  return Math.max(
    MIN_QUERY_REQUEST_TIMEOUT_MS,
    Math.min(Math.floor(timeoutMs), MAX_QUERY_REQUEST_TIMEOUT_MS),
  );
}
