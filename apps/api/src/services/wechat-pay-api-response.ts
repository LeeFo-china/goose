import { Errors } from "@/errors/error-factory";
import { verifyWechatPayCallbackSignature } from "@/services/wechat-pay-callback-crypto";

const MAX_RESPONSE_CLOCK_SKEW_SECONDS = 300;

export type VerifiedWechatPayRawResponse = {
  requestId: string | null;
  rawBody: string;
};

type ReadVerifiedWechatPayResponseInput = {
  response: Response;
  publicKeyId: string | null;
  publicKeyPem: string | null;
  nowSeconds?: number;
};

export type VerifiedWechatPayJson = VerifiedWechatPayRawResponse & {
  payload: Record<string, unknown>;
};

export async function readVerifiedWechatPayRawResponse(
  input: ReadVerifiedWechatPayResponseInput,
): Promise<VerifiedWechatPayRawResponse> {
  let rawBody: string;
  try {
    rawBody = await input.response.text();
  } catch {
    throw Errors.business(
      502,
      "微信支付应答正文读取失败",
      "WECHAT_PAY_TRANSPORT_FAILED",
    );
  }
  const publicKeyId = input.publicKeyId?.trim();
  const publicKeyPem = input.publicKeyPem?.trim();
  if (!publicKeyId || !publicKeyPem) {
    throw Errors.business(
      502,
      "微信支付应答验签配置缺失",
      "WECHAT_PAY_RESPONSE_SIGNATURE_REQUIRED",
    );
  }

  const timestamp = requiredHeader(input.response, "wechatpay-timestamp");
  const nonce = requiredHeader(input.response, "wechatpay-nonce");
  const serial = requiredHeader(input.response, "wechatpay-serial");
  const signature = requiredHeader(input.response, "wechatpay-signature");
  if (serial !== publicKeyId) {
    throw Errors.business(
      502,
      "微信支付应答公钥标识不匹配",
      "WECHAT_PAY_RESPONSE_SERIAL_MISMATCH",
    );
  }

  const responseTimestamp = parseTimestamp(timestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (Math.abs(nowSeconds - responseTimestamp) > MAX_RESPONSE_CLOCK_SKEW_SECONDS) {
    throw Errors.business(
      502,
      "微信支付应答时间戳无效",
      "WECHAT_PAY_RESPONSE_TIMESTAMP_INVALID",
    );
  }

  const isVerified = verifyWechatPayCallbackSignature({
    timestamp,
    nonce,
    rawBody,
    signature,
    publicKeyPem,
  });
  if (!isVerified) {
    throw Errors.business(
      502,
      "微信支付应答签名无效",
      "WECHAT_PAY_RESPONSE_SIGNATURE_INVALID",
    );
  }

  return {
    requestId: input.response.headers.get("request-id")?.trim() || null,
    rawBody,
  };
}

export async function readVerifiedWechatPayEmptyResponse(
  input: ReadVerifiedWechatPayResponseInput,
): Promise<VerifiedWechatPayRawResponse> {
  const verified = await readVerifiedWechatPayRawResponse(input);
  if (verified.rawBody !== "") {
    throwInvalidBody();
  }
  return verified;
}

export async function readVerifiedWechatPayJson(
  input: ReadVerifiedWechatPayResponseInput,
): Promise<VerifiedWechatPayJson> {
  const verified = await readVerifiedWechatPayRawResponse(input);
  let payload: unknown;
  try {
    payload = JSON.parse(verified.rawBody);
  } catch {
    throwInvalidBody();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throwInvalidBody();
  }

  return {
    payload: payload as Record<string, unknown>,
    ...verified,
  };
}

function requiredHeader(response: Response, header: string) {
  const value = response.headers.get(header)?.trim();
  if (!value) {
    throw Errors.business(
      502,
      "微信支付应答缺少验签头",
      "WECHAT_PAY_RESPONSE_SIGNATURE_REQUIRED",
      { header },
    );
  }
  return value;
}

function parseTimestamp(timestamp: string) {
  if (!/^\d+$/.test(timestamp)) {
    throwInvalidTimestamp();
  }
  const parsed = Number(timestamp);
  if (!Number.isSafeInteger(parsed)) {
    throwInvalidTimestamp();
  }
  return parsed;
}

function throwInvalidTimestamp(): never {
  throw Errors.business(
    502,
    "微信支付应答时间戳无效",
    "WECHAT_PAY_RESPONSE_TIMESTAMP_INVALID",
  );
}

function throwInvalidBody(): never {
  throw Errors.business(
    502,
    "微信支付应答正文格式不正确",
    "WECHAT_PAY_RESPONSE_BODY_INVALID",
  );
}
