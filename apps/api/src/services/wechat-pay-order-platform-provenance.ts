import { Errors } from "@/errors/error-factory";
import type { PlatformPaymentConfigRecord } from "@/repositories/platform-payment-configs";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import {
  evaluatePlatformPaymentProfileReadiness,
  PLATFORM_WECHAT_PAY_PROFILE_DEFINITION_BY_CODE,
} from "@/services/platform-payment-readiness";
import { requireMatchingPlatformPaymentSecretBundle } from "@/services/platform-payment-secret-bundle-revision";
import type { WechatPaySecretBundle } from "@/services/wechat-pay-secret-bundles";

export type PlatformPaymentConfigLookupPort = {
  findWechatPayConfigById: (
    configId: string,
  ) => Promise<PlatformPaymentConfigRecord | null>;
};

type SecretBundleLoaderPort = {
  load: (encryptedConfigRef: string | null) => Promise<WechatPaySecretBundle>;
};

const PROVENANCE_FIELDS = [
  "merchant_mode",
  "merchant_id",
  "app_id",
  "sub_app_id",
  "encrypted_config_ref",
  "serial_no",
  "notify_url",
] as const satisfies ReadonlyArray<
  keyof PlatformPaymentConfigRecord & keyof WechatPayConfigRecord
>;

export async function loadWechatPayOrderSecretBundle(input: {
  tenantConfig: WechatPayConfigRecord;
  platformConfigRepository: PlatformPaymentConfigLookupPort;
  secretBundleService: SecretBundleLoaderPort;
}): Promise<WechatPaySecretBundle> {
  if (input.tenantConfig.merchant_mode !== "service_provider_sub_merchant") {
    return input.secretBundleService.load(
      input.tenantConfig.encrypted_config_ref,
    );
  }

  const platformConfigId = input.tenantConfig.platform_payment_config_id;
  if (!hasText(platformConfigId)) {
    throw Errors.business(
      409,
      "租户支付配置缺少平台服务商来源",
      "WECHAT_PAY_PLATFORM_PROFILE_PROVENANCE_REQUIRED",
    );
  }

  const definition =
    PLATFORM_WECHAT_PAY_PROFILE_DEFINITION_BY_CODE.tenant_service_provider;
  const platformConfig = await input.platformConfigRepository
    .findWechatPayConfigById(platformConfigId);
  const readiness = evaluatePlatformPaymentProfileReadiness(
    definition,
    platformConfig,
  );
  if (!platformConfig || !readiness.ready) {
    throw Errors.business(
      409,
      "平台服务商支付配置尚未就绪",
      "WECHAT_PAY_PLATFORM_PROFILE_NOT_READY",
      {
        profile_code: definition.profile_code,
        blocker_codes: readiness.blockers.map((blocker) => blocker.code),
      },
    );
  }

  const mismatchFields: string[] = PROVENANCE_FIELDS.filter((field) =>
    input.tenantConfig[field] !== platformConfig[field]
  );
  if (
    platformConfig.id !== platformConfigId ||
    platformConfig.profile_code !== definition.profile_code
  ) {
    mismatchFields.unshift("platform_payment_config_id");
  }
  if (mismatchFields.length > 0) {
    throw Errors.business(
      409,
      "租户支付配置与平台服务商配置不一致",
      "WECHAT_PAY_PLATFORM_PROFILE_MISMATCH",
      { mismatch_fields: mismatchFields },
    );
  }

  const secretBundle = await input.secretBundleService.load(
    platformConfig.encrypted_config_ref,
  );
  return requireMatchingPlatformPaymentSecretBundle(
    platformConfig,
    secretBundle,
  );
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
