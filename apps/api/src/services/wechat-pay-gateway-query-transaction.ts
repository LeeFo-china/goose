import { Errors } from "@/errors/error-factory";
import {
  parseWechatPayJson,
  stringField,
} from "@/services/wechat-pay-gateway-response";
import type { WechatPayJsapiConfig } from "@/services/wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";
import { buildWechatPayAuthorization } from "@/services/wechat-pay-signatures";

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

type QueryTransactionInput = WechatPayQueryTransactionByOutTradeNoInput & {
  fetchImpl: typeof fetch;
  nonce?: string;
  timestamp?: string;
  timeoutMs?: number;
};

const DEFAULT_QUERY_REQUEST_TIMEOUT_MS = 10_000;
const MAX_QUERY_REQUEST_TIMEOUT_MS = 60_000;

export async function queryWechatPayTransactionByOutTradeNo(
  input: QueryTransactionInput,
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
  const authorization = buildWechatPayAuthorization({
    method: "GET",
    urlPath,
    body: "",
    merchantId: input.config.merchant_id || "",
    serialNo,
    privateKeyPem: input.secretBundle.privateKeyPem,
    nonce: input.nonce,
    timestamp: input.timestamp,
  });
  const response = await fetchTransaction({ input, urlPath, authorization });
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

async function fetchTransaction(input: {
  input: QueryTransactionInput;
  urlPath: string;
  authorization: string;
}) {
  const timeoutMs = normalizeQueryRequestTimeout(input.input.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await input.input.fetchImpl(
      `${input.input.secretBundle.baseUrl}${input.urlPath}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: input.authorization,
        },
        signal: controller.signal,
      },
    );
  } catch {
    const details = controller.signal.aborted
      ? { reason: "timeout", timeout_ms: timeoutMs }
      : { reason: "network_error" };
    throw Errors.business(
      502,
      "微信支付查单失败",
      "WECHAT_PAY_TRANSACTION_QUERY_FAILED",
      details,
    );
  } finally {
    clearTimeout(timer);
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

function normalizeQueryRequestTimeout(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return DEFAULT_QUERY_REQUEST_TIMEOUT_MS;
  }
  return Math.max(
    1,
    Math.min(Math.floor(timeoutMs), MAX_QUERY_REQUEST_TIMEOUT_MS),
  );
}
