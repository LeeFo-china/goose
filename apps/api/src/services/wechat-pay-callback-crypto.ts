import { createDecipheriv, verify } from "node:crypto";
import { Errors } from "@/errors/error-factory";

export type VerifyWechatPayCallbackSignatureInput = {
  timestamp: string;
  nonce: string;
  rawBody: string;
  signature: string;
  publicKeyPem: string;
};

export type DecryptWechatPayResourceInput = {
  apiV3Key: string;
  nonce: string;
  associatedData: string;
  ciphertext: string;
};

const AUTH_TAG_LENGTH = 16;

export function verifyWechatPayCallbackSignature(
  input: VerifyWechatPayCallbackSignatureInput,
) {
  const message = `${input.timestamp}\n${input.nonce}\n${input.rawBody}\n`;
  try {
    return verify(
      "RSA-SHA256",
      Buffer.from(message),
      input.publicKeyPem,
      Buffer.from(input.signature, "base64"),
    );
  } catch {
    return false;
  }
}

export function decryptWechatPayResource(
  input: DecryptWechatPayResourceInput,
): Record<string, unknown> {
  const apiV3Key = input.apiV3Key.trim();
  if (Buffer.byteLength(apiV3Key) !== 32) {
    throw Errors.business(
      409,
      "微信支付 APIv3 key 长度不正确",
      "WECHAT_PAY_API_V3_KEY_INVALID",
    );
  }

  try {
    const ciphertext = Buffer.from(input.ciphertext, "base64");
    const encrypted = ciphertext.subarray(0, ciphertext.length - AUTH_TAG_LENGTH);
    const authTag = ciphertext.subarray(ciphertext.length - AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(apiV3Key),
      Buffer.from(input.nonce),
    );
    if (input.associatedData) {
      decipher.setAAD(Buffer.from(input.associatedData));
    }
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    const payload: unknown = JSON.parse(plaintext);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw Errors.business(
        400,
        "微信支付回调资源格式不正确",
        "WECHAT_PAY_CALLBACK_RESOURCE_INVALID",
      );
    }

    return payload as Record<string, unknown>;
  } catch (error) {
    if (isAppErrorLike(error)) {
      throw error;
    }
    throw Errors.business(
      400,
      "微信支付回调资源解密失败",
      "WECHAT_PAY_CALLBACK_DECRYPT_FAILED",
    );
  }
}

function isAppErrorLike(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "statusCode" in error &&
      "code" in error,
  );
}
