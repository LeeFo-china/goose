import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { Errors } from "@/errors/error-factory";

const ENVELOPE_PREFIX = "wmss:v1";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SESSION_REFRESH_REQUIRED_CODE =
  "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED";

function keyFor(version: number): Buffer {
  const raw = process.env[
    `WECHAT_MINI_SESSION_ENCRYPTION_KEY_V${version}`
  ]?.trim();
  if (!raw) {
    throw Errors.business(
      503,
      "微信会话加密密钥未配置",
      "WECHAT_MINI_SESSION_ENCRYPTION_KEY_MISSING",
    );
  }

  return createHash("sha256").update(raw).digest();
}

export function encryptWechatMiniSessionKey(
  value: string,
  version: number,
): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", keyFor(version), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return [
    ENVELOPE_PREFIX,
    version,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptWechatMiniSessionKey(
  value: string,
  version: number,
): string {
  try {
    const [family, format, storedVersion, ivText, tagText, ciphertextText] =
      value.split(":");
    if (
      `${family}:${format}` !== ENVELOPE_PREFIX
      || Number(storedVersion) !== version
      || !ivText
      || !tagText
      || !ciphertextText
    ) {
      throw new TypeError("invalid credential envelope");
    }

    const iv = Buffer.from(ivText, "base64url");
    const authTag = Buffer.from(tagText, "base64url");
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      throw new TypeError("invalid credential envelope lengths");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFor(version),
      iv,
    );
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw Errors.business(
      409,
      "微信会话已失效，请重新登录",
      SESSION_REFRESH_REQUIRED_CODE,
    );
  }
}
