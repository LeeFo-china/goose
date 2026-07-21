import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { Errors } from "@/errors/error-factory";
import { z } from "zod";

const CIPHERTEXT_PREFIX = "wpa:v1";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_SALT = Buffer.from("gooes:wechat-pay-applyment:v1", "utf8");
const KEY_PURPOSE = Buffer.from("sensitive-payload", "utf8");

const ApplymentSensitivePayloadSchema = z.object({
  identity_name: z.string().trim().min(1),
  identity_number: z.string().trim().min(1),
  identity_address: z.string().trim().min(1).nullable().optional(),
  contact_name: z.string().trim().min(1),
  contact_phone: z.string().trim().min(1),
  contact_email: z.string().trim().email(),
  contact_identity_number: z.string().trim().min(1).nullable().optional(),
  contact_identity_address: z.string().trim().min(1).nullable().optional(),
  bank_account_name: z.string().trim().min(1),
  bank_account_number: z.string().trim().min(1),
}).strict();

export type ApplymentSensitivePayload = z.infer<
  typeof ApplymentSensitivePayloadSchema
>;

export type ApplymentSensitivePayloadContext = {
  tenantId: string;
  applymentId: string;
  version: number;
};

export function encryptApplymentSensitivePayload(input: {
  context: ApplymentSensitivePayloadContext;
  payload: ApplymentSensitivePayload;
  rootSecret: string | null | undefined;
}): string {
  const payload = parsePayload(input.payload);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveKey(input.rootSecret),
    iv,
  );
  cipher.setAAD(buildAad(input.context));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    CIPHERTEXT_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptApplymentSensitivePayload(input: {
  context: ApplymentSensitivePayloadContext;
  ciphertext: string;
  rootSecret: string | null | undefined;
}): ApplymentSensitivePayload {
  const parts = input.ciphertext.split(":");
  const [namespace, version, ivText, authTagText, encryptedText] = parts;
  if (
    parts.length !== 5 ||
    namespace !== "wpa" ||
    version !== "v1" ||
    !ivText ||
    !authTagText ||
    !encryptedText
  ) {
    throw Errors.business(
      500,
      "微信支付进件敏感资料密文格式错误",
      "WECHAT_PAY_APPLYMENT_SENSITIVE_PAYLOAD_INVALID",
    );
  }

  try {
    const iv = Buffer.from(ivText, "base64url");
    const authTag = Buffer.from(authTagText, "base64url");
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw Errors.business(
        500,
        "微信支付进件敏感资料密文格式错误",
        "WECHAT_PAY_APPLYMENT_SENSITIVE_PAYLOAD_INVALID",
      );
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(input.rootSecret),
      iv,
    );
    decipher.setAAD(buildAad(input.context));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return parsePayload(JSON.parse(plaintext));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "WECHAT_PAY_APPLYMENT_SENSITIVE_PAYLOAD_INVALID"
    ) {
      throw error;
    }
    throw Errors.business(
      500,
      "微信支付进件敏感资料解密失败",
      "WECHAT_PAY_APPLYMENT_SENSITIVE_PAYLOAD_DECRYPT_FAILED",
    );
  }
}

function deriveKey(rootSecret: string | null | undefined): Buffer {
  if (!rootSecret?.trim()) {
    throw Errors.business(
      503,
      "缺少微信支付进件敏感资料加密密钥",
      "WECHAT_PAY_APPLYMENT_ENCRYPTION_KEY_MISSING",
    );
  }
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(rootSecret, "utf8"),
      KEY_SALT,
      KEY_PURPOSE,
      KEY_LENGTH,
    ),
  );
}

function buildAad(context: ApplymentSensitivePayloadContext): Buffer {
  if (
    !context.tenantId.trim() ||
    !context.applymentId.trim() ||
    !Number.isInteger(context.version) ||
    context.version <= 0
  ) {
    throw Errors.business(
      500,
      "微信支付进件敏感资料加密上下文无效",
      "WECHAT_PAY_APPLYMENT_ENCRYPTION_CONTEXT_INVALID",
    );
  }
  return Buffer.from(
    `wechat-pay-applyment:${context.tenantId}:${context.applymentId}:v${context.version}`,
    "utf8",
  );
}

function parsePayload(value: unknown): ApplymentSensitivePayload {
  const parsed = ApplymentSensitivePayloadSchema.safeParse(value);
  if (!parsed.success) {
    throw Errors.business(
      500,
      "微信支付进件敏感资料内容无效",
      "WECHAT_PAY_APPLYMENT_SENSITIVE_PAYLOAD_INVALID",
    );
  }
  return parsed.data;
}
