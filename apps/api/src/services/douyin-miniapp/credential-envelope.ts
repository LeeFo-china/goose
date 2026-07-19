import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";

const CREDENTIAL_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const STANDARD_BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type DouyinCredentialKeyring = {
  readonly activeKeyVersion: string;
  readonly keys: Readonly<Record<string, Buffer>>;
};

export type DouyinCredentialEnvelope = {
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly keyVersion: string;
};

export function sealDouyinCredential(
  plaintext: string,
  keyring: DouyinCredentialKeyring,
): DouyinCredentialEnvelope {
  const key = keyring.keys[keyring.activeKeyVersion];
  if (!key || key.length !== CREDENTIAL_KEY_BYTES) {
    throw Errors.business(
      503,
      "抖音授权凭证活动密钥不可用",
      "DOUYIN_CREDENTIAL_ACTIVE_KEY_MISSING",
    );
  }

  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: keyring.activeKeyVersion,
  };
}

export function openDouyinCredential(
  envelope: DouyinCredentialEnvelope,
  keyring: DouyinCredentialKeyring,
): string {
  const key = keyring.keys[envelope.keyVersion];
  if (!key || key.length !== CREDENTIAL_KEY_BYTES) {
    throw Errors.business(
      500,
      "抖音授权凭证密钥版本不可用",
      "DOUYIN_CREDENTIAL_KEY_VERSION_MISSING",
    );
  }

  try {
    const iv = decodeBase64(envelope.iv);
    const tag = decodeBase64(envelope.tag);
    const ciphertext = decodeBase64(envelope.ciphertext);
    if (iv.length !== GCM_IV_BYTES || tag.length !== GCM_TAG_BYTES) {
      throw credentialDecryptError();
    }

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw credentialDecryptError();
  }
}

function decodeBase64(value: string): Buffer {
  if (!STANDARD_BASE64_PATTERN.test(value)) {
    throw credentialDecryptError();
  }

  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw credentialDecryptError();
  }
  return decoded;
}

function credentialDecryptError(): AppError {
  return Errors.business(
    400,
    "抖音授权凭证解密失败",
    "DOUYIN_CREDENTIAL_DECRYPT_FAILED",
  );
}
