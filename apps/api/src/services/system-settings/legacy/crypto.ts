import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  Errors,
  ENCRYPTED_VALUE_PREFIX,
  type SystemSettingRecord,
  type SettingSource,
} from './shared';
import {
  definitionByKey,
  TENANT_SMS_CHANNEL_MODE_KEY,
  TENANT_SMS_ALIYUN_MODE,
  TENANT_SMS_TENCENT_MODE,
  TENANT_SMS_PLATFORM_MODE,
} from './definitions';
import { isTencentOcrEncryptionPublicKeyPem } from '@/services/ocr/tencent-encryption-key';

const TENCENT_OCR_ENCRYPTION_PUBLIC_KEY = 'TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM';

export function normalizeStoredValue(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function readEnvValue(envNames: string[]) {
  for (const name of envNames) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return null;
}

export function getEncryptionKey() {
  const raw = process.env.APP_CONFIG_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw Errors.business(
      503,
      "缺少配置加密密钥 APP_CONFIG_ENCRYPTION_KEY",
      "CONFIG_ENCRYPTION_KEY_MISSING",
    );
  }

  return createHash("sha256").update(raw).digest();
}

export function encryptSecretValue(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_VALUE_PREFIX.slice(0, -1),
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecretValue(value: string) {
  if (!value.startsWith(ENCRYPTED_VALUE_PREFIX)) {
    return value;
  }

  const [, , ivText, tagText, encryptedText] = value.split(":");
  if (!ivText || !tagText || !encryptedText) {
    throw Errors.business(500, "系统配置密文格式错误", "CONFIG_SECRET_DECRYPT_FAILED");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivText, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw Errors.business(
      500,
      "系统配置密文解密失败",
      "CONFIG_SECRET_DECRYPT_FAILED",
      error instanceof Error ? { message: error.message } : undefined,
    );
  }
}

export function resolveEffectiveValue(record: SystemSettingRecord): {
  value: string | null;
  source: SettingSource;
} {
  const storedValue = normalizeStoredValue(record.value_text);
  if (record.status === "active" && storedValue) {
    return { value: storedValue, source: "database" };
  }

  const definition = definitionByKey.get(record.key);
  const envValue = definition ? readEnvValue(definition.envNames) : readEnvValue([record.key]);
  if (envValue) {
    return { value: envValue, source: "env" };
  }

  if (definition?.defaultValue) {
    return { value: definition.defaultValue, source: "default" };
  }

  return { value: null, source: "empty" };
}

export function validateSettingValue(record: SystemSettingRecord, value: string | null) {
  if (!value) return null;

  if (
    record.key === TENCENT_OCR_ENCRYPTION_PUBLIC_KEY &&
    !isTencentOcrEncryptionPublicKeyPem(value)
  ) {
    throw Errors.badRequest(
      '身份证识别加密公钥必须是腾讯OCR提供的1024位PKCS#1 RSA公钥PEM',
    );
  }

  if (record.key === TENANT_SMS_CHANNEL_MODE_KEY) {
    return normalizeTenantSmsChannelMode(value);
  }

  if (record.value_type === "number" && !Number.isFinite(Number(value))) {
    throw Errors.badRequest("配置值必须是数字");
  }

  if (record.value_type === "boolean" && !["true", "false"].includes(value.toLowerCase())) {
    throw Errors.badRequest("配置值必须选择是或否");
  }

  if (record.value_type === "json") {
    try {
      JSON.parse(value);
    } catch {
      throw Errors.badRequest("配置值必须是合法 JSON");
    }
  }

  return value;
}

export function normalizeTenantSmsChannelMode(value: string | null | undefined) {
  const normalized = value?.trim();
  if (
    normalized === TENANT_SMS_ALIYUN_MODE ||
    normalized === TENANT_SMS_TENCENT_MODE ||
    normalized === TENANT_SMS_PLATFORM_MODE
  ) {
    return normalized;
  }

  return TENANT_SMS_PLATFORM_MODE;
}
