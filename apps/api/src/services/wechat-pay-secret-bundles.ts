import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";

export type WechatPaySecretBundle = {
  privateKeyPem: string;
  apiV3Key: string;
  wechatPayPublicKeyId: string | null;
  wechatPayPublicKeyPem: string | null;
  baseUrl: string;
};

type SettingsServicePort = {
  getSecretString: (key: string) => Promise<string>;
};

type WechatPaySecretBundleServiceDependencies = {
  settingsService?: SettingsServicePort;
};

const DEFAULT_WECHAT_PAY_BASE_URL = "https://api.mch.weixin.qq.com";

export class WechatPaySecretBundleService {
  private readonly settingsService: SettingsServicePort;

  constructor(dependencies: WechatPaySecretBundleServiceDependencies = {}) {
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
  }

  async load(encryptedConfigRef: string | null): Promise<WechatPaySecretBundle> {
    const ref = encryptedConfigRef?.trim();
    if (!ref) {
      throw Errors.business(
        409,
        "微信支付密钥引用未配置",
        "WECHAT_PAY_SECRET_REF_REQUIRED",
      );
    }

    const raw = await this.loadRawSecret(ref);
    return parseWechatPaySecretBundle(raw);
  }

  private async loadRawSecret(ref: string) {
    if (ref.startsWith("env://")) {
      const envName = ref.slice("env://".length).trim();
      return process.env[envName]?.trim() || "";
    }

    const settingKey = ref
      .replace(/^secret:\/\//, "")
      .replace(/^setting:\/\//, "")
      .trim();
    return this.settingsService.getSecretString(settingKey);
  }
}

export function parseWechatPaySecretBundle(raw: string): WechatPaySecretBundle {
  const trimmed = raw.trim();
  if (!trimmed) {
    throwInvalidSecretBundle();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throwInvalidSecretBundle();
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throwInvalidSecretBundle();
  }

  const record = parsed as Record<string, unknown>;
  const privateKeyPem = stringField(record, "private_key_pem");
  const apiV3Key = stringField(record, "api_v3_key");
  if (!privateKeyPem || !apiV3Key) {
    throwInvalidSecretBundle();
  }

  return {
    privateKeyPem,
    apiV3Key,
    wechatPayPublicKeyId: stringField(record, "wechat_pay_public_key_id"),
    wechatPayPublicKeyPem: stringField(record, "wechat_pay_public_key_pem"),
    baseUrl: stringField(record, "base_url") || DEFAULT_WECHAT_PAY_BASE_URL,
  };
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function throwInvalidSecretBundle(): never {
  throw Errors.business(
    409,
    "微信支付密钥配置格式不正确",
    "WECHAT_PAY_SECRET_BUNDLE_INVALID",
  );
}

export const wechatPaySecretBundleService = new WechatPaySecretBundleService();
