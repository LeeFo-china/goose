import { Errors } from "@/errors/error-factory";
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
import { buildWechatPayAuthorization } from "@/services/wechat-pay-signatures";

export type WechatPayCreateJsapiPrepayTransportInput = {
  config: WechatPayJsapiConfig;
  order: WechatPayJsapiOrder;
  description: string;
  secretBundle: WechatPaySecretBundle;
  fetchImpl: typeof fetch;
  nonce?: string;
  timestamp?: string;
  timeoutMs?: number;
};

const DEFAULT_PREPAY_REQUEST_TIMEOUT_MS = 10_000;
const MIN_PREPAY_REQUEST_TIMEOUT_MS = 1;
const MAX_PREPAY_REQUEST_TIMEOUT_MS = 60_000;

export async function createWechatPayJsapiPrepay(
  input: WechatPayCreateJsapiPrepayTransportInput,
): Promise<string> {
  const serialNo = input.config.serial_no?.trim();
  if (!serialNo) {
    throw Errors.business(
      409,
      "微信支付证书序列号未配置",
      "WECHAT_PAY_SERIAL_NO_REQUIRED",
    );
  }

  const request = buildWechatPayJsapiPrepayRequest({
    config: input.config,
    order: input.order,
    description: input.description,
  });
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
  const response = await fetchPrepay({ input, request, body, authorization });
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
  return prepayId;
}

async function fetchPrepay(input: {
  input: WechatPayCreateJsapiPrepayTransportInput;
  request: ReturnType<typeof buildWechatPayJsapiPrepayRequest>;
  body: string;
  authorization: string;
}): Promise<Response> {
  const timeoutMs = normalizeWechatPayPrepayRequestTimeout(input.input.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await input.input.fetchImpl(
      `${input.input.secretBundle.baseUrl}${input.request.urlPath}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: input.authorization,
          "Content-Type": "application/json",
        },
        body: input.body,
        signal: controller.signal,
      },
    );
  } catch {
    const details = controller.signal.aborted
      ? { reason: "timeout", timeout_ms: timeoutMs }
      : { reason: "network_error" };
    throw Errors.business(
      502,
      "微信支付预下单失败",
      "WECHAT_PAY_PREPAY_FAILED",
      details,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeWechatPayPrepayRequestTimeout(
  timeoutMs: number | undefined,
): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return DEFAULT_PREPAY_REQUEST_TIMEOUT_MS;
  }
  return Math.max(
    MIN_PREPAY_REQUEST_TIMEOUT_MS,
    Math.min(Math.floor(timeoutMs), MAX_PREPAY_REQUEST_TIMEOUT_MS),
  );
}
