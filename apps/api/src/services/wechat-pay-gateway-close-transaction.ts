import { Errors } from "@/errors/error-factory";
import {
  readVerifiedWechatPayEmptyResponse,
  readVerifiedWechatPayRawResponse,
} from "@/services/wechat-pay-api-response";
import {
  stringField,
} from "@/services/wechat-pay-gateway-response";
import type { WechatPayJsapiConfig } from "@/services/wechat-pay-jsapi-request-builder";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";
import { buildWechatPayAuthorization } from "@/services/wechat-pay-signatures";

export type WechatPayCloseTransactionByOutTradeNoInput = {
  config: WechatPayJsapiConfig;
  outTradeNo: string;
  secretBundle: WechatPaySecretBundle;
};

type CloseTransactionInput = WechatPayCloseTransactionByOutTradeNoInput & {
  fetchImpl: typeof fetch;
  nonce?: string;
  nowSeconds?: number;
  timestamp?: string;
  timeoutMs?: number;
};

const DEFAULT_CLOSE_REQUEST_TIMEOUT_MS = 10_000;
const MAX_CLOSE_REQUEST_TIMEOUT_MS = 60_000;

export async function closeWechatPayTransactionByOutTradeNo(
  input: CloseTransactionInput,
): Promise<void> {
  const serialNo = input.config.serial_no?.trim();
  if (!serialNo) {
    throw Errors.business(
      409,
      "微信支付证书序列号未配置",
      "WECHAT_PAY_SERIAL_NO_REQUIRED",
    );
  }

  const request = buildCloseTransactionRequest(input.config, input.outTradeNo);
  const body = JSON.stringify(request.body);
  const authorization = buildWechatPayAuthorization({
    method: "POST",
    urlPath: request.urlPath,
    body,
    merchantId: input.config.merchant_id || "",
    serialNo,
    privateKeyPem: input.secretBundle.privateKeyPem,
    nonce: input.nonce,
    timestamp: input.timestamp,
  });
  const timeoutMs = normalizeCloseRequestTimeout(input.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let hasResponse = false;
  try {
    const response = await fetchCloseTransaction({
      input,
      urlPath: request.urlPath,
      authorization,
      body,
      signal: controller.signal,
    });
    hasResponse = true;
    const verificationInput = {
      response,
      publicKeyId: input.secretBundle.wechatPayPublicKeyId,
      publicKeyPem: input.secretBundle.wechatPayPublicKeyPem,
      nowSeconds: input.nowSeconds,
    };
    if (response.status === 204) {
      await readVerifiedWechatPayEmptyResponse(verificationInput);
      return;
    }

    const verified = await readVerifiedWechatPayRawResponse(verificationInput);
    const payload = parseVerifiedErrorPayload(verified.rawBody);
    throw Errors.business(
      502,
      "微信支付关单失败",
      "WECHAT_PAY_CLOSE_FAILED",
      {
        status: response.status,
        code: stringField(payload, "code"),
        message: stringField(payload, "message"),
        requestId: verified.requestId,
      },
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throwCloseTransportFailure({ reason: "timeout", timeout_ms: timeoutMs });
    }
    if (!hasResponse) {
      throwCloseTransportFailure({ reason: "network_error" });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseVerifiedErrorPayload(rawBody: string): Record<string, unknown> {
  try {
    const payload: unknown = JSON.parse(rawBody);
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function fetchCloseTransaction(input: {
  input: CloseTransactionInput;
  urlPath: string;
  authorization: string;
  body: string;
  signal: AbortSignal;
}) {
  return input.input.fetchImpl(
    `${input.input.secretBundle.baseUrl}${input.urlPath}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: input.authorization,
        "Content-Type": "application/json",
      },
      body: input.body,
      signal: input.signal,
    },
  );
}

function throwCloseTransportFailure(
  details: { reason: "network_error" } | {
    reason: "timeout";
    timeout_ms: number;
  },
): never {
  throw Errors.business(
    502,
    "微信支付关单失败",
    "WECHAT_PAY_CLOSE_FAILED",
    details,
  );
}

function normalizeCloseRequestTimeout(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return DEFAULT_CLOSE_REQUEST_TIMEOUT_MS;
  }
  return Math.max(
    1,
    Math.min(Math.floor(timeoutMs), MAX_CLOSE_REQUEST_TIMEOUT_MS),
  );
}

function buildCloseTransactionRequest(
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
    return {
      urlPath: `/v3/pay/partner/transactions/out-trade-no/${encodedOutTradeNo}/close`,
      body: {
        sp_mchid: config.merchant_id,
        sub_mchid: config.sub_merchant_id,
      },
    };
  }

  if (!config.merchant_id) {
    throw Errors.business(
      409,
      "微信支付商户号未配置",
      "WECHAT_PAY_CONFIG_INCOMPLETE",
    );
  }
  return {
    urlPath: `/v3/pay/transactions/out-trade-no/${encodedOutTradeNo}/close`,
    body: { mchid: config.merchant_id },
  };
}
