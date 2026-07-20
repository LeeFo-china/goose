import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
  type PlatformPaymentMerchantMode,
  type PlatformPaymentProfileCode,
  type PlatformPaymentValidationStatus,
} from "@/repositories/platform-payment-configs";
import { isValidWechatPayNotifyUrl } from "@/services/wechat-pay-profile-validator";

export type PlatformPaymentReadinessBlocker = {
  code: string;
  message: string;
};

export type PlatformPaymentReadinessProfile = {
  profile_code: PlatformPaymentProfileCode;
  label: string;
  ready: boolean;
  blockers: PlatformPaymentReadinessBlocker[];
  validation_status: PlatformPaymentValidationStatus | null;
  last_validated_at: string | null;
  checks: {
    configured: boolean;
    active: boolean;
    validated: boolean;
    merchant_mode_matches: boolean;
    has_merchant_id: boolean;
    has_app_id: boolean;
    has_secret_ref: boolean;
    has_secret_bundle_revision: boolean;
    has_serial_no: boolean;
    has_callback: boolean;
    callback_is_valid: boolean;
    required_channels_enabled: boolean;
  };
};

export type PlatformPaymentReadinessResult = {
  ready: boolean;
  profiles: PlatformPaymentReadinessProfile[];
};

export type PlatformWechatPayProfileDefinition = {
  profile_code: PlatformPaymentProfileCode;
  label: string;
  description: string;
  merchant_mode: PlatformPaymentMerchantMode;
  enabled_channels: string[];
  secret_setting_key: string;
};

type RepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfigByProfile"
>;

type PlatformPaymentReadinessServiceDependencies = {
  repository?: RepositoryPort;
};

export const PLATFORM_WECHAT_PAY_PROFILE_DEFINITION_BY_CODE = {
  platform_direct_recharge: {
    profile_code: "platform_direct_recharge",
    label: "平台直连商户",
    description: "用于平台自有积分充值等平台收款场景。",
    merchant_mode: "direct_merchant",
    enabled_channels: ["tenant_recharge"],
    secret_setting_key: "PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  },
  tenant_service_provider: {
    profile_code: "tenant_service_provider",
    label: "服务商商户",
    description: "用于服务商进件、租户特约商户和后续租户项目收款能力。",
    merchant_mode: "service_provider_sub_merchant",
    enabled_channels: ["project_payment", "applyment"],
    secret_setting_key: "PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
  },
} satisfies Record<
  PlatformPaymentProfileCode,
  PlatformWechatPayProfileDefinition
>;

// Internal profile count is fixed at two, so this auxiliary read is intentionally pageless.
export const PLATFORM_WECHAT_PAY_PROFILE_DEFINITIONS = Object.values(
  PLATFORM_WECHAT_PAY_PROFILE_DEFINITION_BY_CODE,
);

const BLOCKERS = {
  missing: {
    code: "PLATFORM_PAYMENT_CONFIG_MISSING",
    message: "支付配置尚未创建",
  },
  inactive: {
    code: "PLATFORM_PAYMENT_CONFIG_INACTIVE",
    message: "支付配置尚未启用",
  },
  notValidated: {
    code: "PLATFORM_PAYMENT_CONFIG_NOT_VALIDATED",
    message: "支付配置尚未通过验证",
  },
  merchantModeMismatch: {
    code: "PLATFORM_PAYMENT_MERCHANT_MODE_MISMATCH",
    message: "支付配置商户模式不匹配",
  },
  merchantIdMissing: {
    code: "PLATFORM_PAYMENT_MERCHANT_ID_MISSING",
    message: "支付配置缺少商户号",
  },
  appIdMissing: {
    code: "PLATFORM_PAYMENT_APP_ID_MISSING",
    message: "支付配置缺少 AppID",
  },
  secretRefMissing: {
    code: "PLATFORM_PAYMENT_SECRET_REF_MISSING",
    message: "支付配置缺少密钥引用",
  },
  secretBundleRevisionMissing: {
    code: "PLATFORM_PAYMENT_SECRET_BUNDLE_REVISION_MISSING",
    message: "支付配置缺少密钥版本",
  },
  serialNoMissing: {
    code: "PLATFORM_PAYMENT_SERIAL_NO_MISSING",
    message: "支付配置缺少商户证书序列号",
  },
  callbackMissing: {
    code: "PLATFORM_PAYMENT_CALLBACK_URL_MISSING",
    message: "支付配置缺少回调地址",
  },
  callbackInvalid: {
    code: "PLATFORM_PAYMENT_CALLBACK_URL_INVALID",
    message: "支付回调地址必须是无参数的公网 HTTPS 完整路径",
  },
  channelsMissing: {
    code: "PLATFORM_PAYMENT_REQUIRED_CHANNELS_MISSING",
    message: "支付配置缺少必需的启用渠道",
  },
} satisfies Record<string, PlatformPaymentReadinessBlocker>;

export class PlatformPaymentReadinessService {
  private readonly repository: RepositoryPort;

  constructor(
    dependencies: PlatformPaymentReadinessServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ?? platformPaymentConfigRepository;
  }

  async getReadiness(): Promise<PlatformPaymentReadinessResult> {
    const configs = await Promise.all(
      PLATFORM_WECHAT_PAY_PROFILE_DEFINITIONS.map((definition) =>
        this.repository.findWechatPayConfigByProfile(definition.profile_code)
      ),
    );
    const profiles = PLATFORM_WECHAT_PAY_PROFILE_DEFINITIONS.map(
      (definition, index) =>
        evaluatePlatformPaymentProfileReadiness(
          definition,
          configs[index] ?? null,
        ),
    );
    return {
      ready: profiles.every((profile) => profile.ready),
      profiles,
    };
  }
}

export function evaluatePlatformPaymentProfileReadiness(
  definition: PlatformWechatPayProfileDefinition,
  config: PlatformPaymentConfigRecord | null,
): PlatformPaymentReadinessProfile {
  if (!config) return missingProfile(definition);

  const checks = {
    configured: true,
    active: config.status === "active",
    validated: config.validation_status === "valid",
    merchant_mode_matches: config.merchant_mode === definition.merchant_mode,
    has_merchant_id: hasText(config.merchant_id),
    has_app_id: hasText(config.app_id),
    has_secret_ref: hasText(config.encrypted_config_ref),
    has_secret_bundle_revision: hasText(config.secret_bundle_revision),
    has_serial_no: hasText(config.serial_no),
    has_callback: hasText(config.notify_url),
    callback_is_valid: isValidWechatPayNotifyUrl(config.notify_url),
    required_channels_enabled: definition.enabled_channels.every((channel) =>
      config.enabled_channels.includes(channel)
    ),
  };
  const blockers: PlatformPaymentReadinessBlocker[] = [];
  if (!checks.active) blockers.push(BLOCKERS.inactive);
  if (!checks.validated) blockers.push(BLOCKERS.notValidated);
  if (!checks.merchant_mode_matches) blockers.push(BLOCKERS.merchantModeMismatch);
  if (!checks.has_merchant_id) blockers.push(BLOCKERS.merchantIdMissing);
  if (!checks.has_app_id) blockers.push(BLOCKERS.appIdMissing);
  if (!checks.has_secret_ref) blockers.push(BLOCKERS.secretRefMissing);
  if (!checks.has_secret_bundle_revision) {
    blockers.push(BLOCKERS.secretBundleRevisionMissing);
  }
  if (!checks.has_serial_no) blockers.push(BLOCKERS.serialNoMissing);
  if (!checks.has_callback) blockers.push(BLOCKERS.callbackMissing);
  else if (!checks.callback_is_valid) blockers.push(BLOCKERS.callbackInvalid);
  if (!checks.required_channels_enabled) blockers.push(BLOCKERS.channelsMissing);

  return {
    profile_code: definition.profile_code,
    label: definition.label,
    ready: blockers.length === 0,
    blockers,
    validation_status: config.validation_status,
    last_validated_at: config.last_validated_at,
    checks,
  };
}

function missingProfile(
  definition: PlatformWechatPayProfileDefinition,
): PlatformPaymentReadinessProfile {
  return {
    profile_code: definition.profile_code,
    label: definition.label,
    ready: false,
    blockers: [BLOCKERS.missing],
    validation_status: null,
    last_validated_at: null,
    checks: {
      configured: false,
      active: false,
      validated: false,
      merchant_mode_matches: false,
      has_merchant_id: false,
      has_app_id: false,
      has_secret_ref: false,
      has_secret_bundle_revision: false,
      has_serial_no: false,
      has_callback: false,
      callback_is_valid: false,
      required_channels_enabled: false,
    },
  };
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const platformPaymentReadinessService =
  new PlatformPaymentReadinessService();
