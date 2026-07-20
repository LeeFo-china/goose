import {
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
import { Errors } from "@/errors/error-factory";
import type {
  PlatformPaymentMerchantMode,
  PlatformPaymentProfileCode,
} from "@/repositories/platform-payment-configs";
import { requireMatchingPlatformPaymentSecretBundle } from "@/services/platform-payment-secret-bundle-revision";
import {
  wechatPayProfileValidationGateway,
  type WechatPayProfileProbeResult,
} from "@/services/wechat-pay-profile-validation-gateway";
import {
  wechatPaySecretBundleService,
  type WechatPaySecretBundle,
} from "@/services/wechat-pay-secret-bundles";

const OFFICIAL_WECHAT_PAY_API_ORIGINS = new Set([
  "https://api.mch.weixin.qq.com",
  "https://api2.mch.weixin.qq.com",
]);

export type WechatPayProfileValidationConfig = {
  profile_code: PlatformPaymentProfileCode;
  merchant_mode: PlatformPaymentMerchantMode;
  merchant_id: string | null;
  serial_no: string | null;
  encrypted_config_ref: string | null;
  secret_bundle_revision?: string | null;
  notify_url: string | null;
};

type SecretBundleServicePort = {
  load: (encryptedConfigRef: string | null) => Promise<WechatPaySecretBundle>;
};

type ProfileValidationGatewayPort = {
  probe: (
    input: Parameters<typeof wechatPayProfileValidationGateway.probe>[0],
  ) => Promise<WechatPayProfileProbeResult>;
};

type WechatPayProfileValidatorDependencies = {
  secretBundleService?: SecretBundleServicePort;
  gateway?: ProfileValidationGatewayPort;
};

export class WechatPayProfileValidator {
  private readonly secretBundleService: SecretBundleServicePort;
  private readonly gateway: ProfileValidationGatewayPort;

  constructor(dependencies: WechatPayProfileValidatorDependencies = {}) {
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.gateway = dependencies.gateway ?? wechatPayProfileValidationGateway;
  }

  async validate(
    config: WechatPayProfileValidationConfig,
  ): Promise<WechatPayProfileProbeResult> {
    this.assertProfileMode(config);
    const merchantId = requireText(
      config.merchant_id,
      "微信支付商户号未配置",
      "WECHAT_PAY_MERCHANT_ID_REQUIRED",
    );
    const serialNo = requireText(
      config.serial_no,
      "微信支付商户 API 证书序列号未配置",
      "WECHAT_PAY_SERIAL_NO_REQUIRED",
    );
    const encryptedConfigRef = requireText(
      config.encrypted_config_ref,
      "微信支付密钥引用未配置",
      "WECHAT_PAY_SECRET_REF_REQUIRED",
    );
    requireText(
      config.secret_bundle_revision,
      "微信支付密钥版本未配置",
      "WECHAT_PAY_SECRET_BUNDLE_REVISION_REQUIRED",
    );
    assertHttpsUrl(
      config.notify_url,
      "微信支付回调地址必须是 HTTPS URL",
      "WECHAT_PAY_NOTIFY_URL_INVALID",
    );

    const bundle = requireMatchingPlatformPaymentSecretBundle(
      config,
      await this.secretBundleService.load(encryptedConfigRef),
    );
    assertApiV3Key(bundle.apiV3Key);
    assertRsaPrivateKey(bundle.privateKeyPem);
    const publicKeyId = requireText(
      bundle.wechatPayPublicKeyId,
      "微信支付公钥配置不完整",
      "WECHAT_PAY_PUBLIC_KEY_REQUIRED",
    );
    const publicKeyPem = requireText(
      bundle.wechatPayPublicKeyPem,
      "微信支付公钥配置不完整",
      "WECHAT_PAY_PUBLIC_KEY_REQUIRED",
    );
    assertRsaPublicKey(publicKeyPem);
    const baseUrl = assertOfficialWechatPayBaseUrl(
      bundle.baseUrl,
      "微信支付 API 地址必须是 HTTPS URL",
      "WECHAT_PAY_BASE_URL_INVALID",
    );

    return this.gateway.probe({
      merchantId,
      serialNo,
      privateKeyPem: bundle.privateKeyPem,
      apiV3Key: bundle.apiV3Key,
      wechatPayPublicKeyId: publicKeyId,
      wechatPayPublicKeyPem: publicKeyPem,
      baseUrl,
    });
  }

  private assertProfileMode(config: WechatPayProfileValidationConfig) {
    const expected = config.profile_code === "platform_direct_recharge"
      ? "direct_merchant"
      : "service_provider_sub_merchant";
    if (config.merchant_mode !== expected) {
      throw Errors.business(
        409,
        "微信支付 Profile 与商户模式不匹配",
        "WECHAT_PAY_PROFILE_MODE_INVALID",
      );
    }
  }
}

function assertOfficialWechatPayBaseUrl(
  value: string | null,
  message: string,
  code: string,
) {
  const normalized = value?.trim();
  if (!normalized) throw Errors.business(409, message, code);
  try {
    const parsed = new URL(normalized);
    if (
      !OFFICIAL_WECHAT_PAY_API_ORIGINS.has(parsed.origin) ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw Errors.business(409, message, code);
    }
    return parsed.origin;
  } catch (error) {
    if (isAppErrorLike(error)) throw error;
    throw Errors.business(409, message, code);
  }
}

function requireText(
  value: string | null | undefined,
  message: string,
  code: string,
) {
  const normalized = value?.trim();
  if (!normalized) throw Errors.business(409, message, code);
  return normalized;
}

function assertHttpsUrl(value: string | null, message: string, code: string) {
  const normalized = value?.trim();
  if (!normalized) throw Errors.business(409, message, code);
  try {
    const parsed = new URL(normalized);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      throw Errors.business(409, message, code);
    }
    return normalized.replace(/\/+$/, "");
  } catch (error) {
    if (isAppErrorLike(error)) throw error;
    throw Errors.business(409, message, code);
  }
}

function assertApiV3Key(apiV3Key: string) {
  if (Buffer.byteLength(apiV3Key) !== 32) {
    throw Errors.business(
      409,
      "微信支付 APIv3 Key 必须为 32 字节",
      "WECHAT_PAY_API_V3_KEY_INVALID",
    );
  }
}

function assertRsaPrivateKey(privateKeyPem: string) {
  try {
    if (createPrivateKey(privateKeyPem).asymmetricKeyType !== "rsa") {
      throwInvalidPrivateKey();
    }
  } catch (error) {
    if (isAppErrorLike(error)) throw error;
    throwInvalidPrivateKey();
  }
}

function assertRsaPublicKey(publicKeyPem: string) {
  try {
    if (createPublicKey(publicKeyPem).asymmetricKeyType !== "rsa") {
      throwInvalidPublicKey();
    }
  } catch (error) {
    if (isAppErrorLike(error)) throw error;
    throwInvalidPublicKey();
  }
}

function throwInvalidPrivateKey(): never {
  throw Errors.business(
    409,
    "微信支付商户私钥必须是 RSA PEM",
    "WECHAT_PAY_PRIVATE_KEY_INVALID",
  );
}

function throwInvalidPublicKey(): never {
  throw Errors.business(
    409,
    "微信支付公钥必须是 RSA PEM",
    "WECHAT_PAY_PUBLIC_KEY_INVALID",
  );
}

function isAppErrorLike(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "statusCode" in error &&
      "code" in error,
  );
}

export const wechatPayProfileValidator = new WechatPayProfileValidator();
