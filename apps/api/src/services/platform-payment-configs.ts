import { Errors } from "@/errors/error-factory";
import { billingRechargeRepository } from "@/repositories/billing-recharge";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentProfileCode,
  type PlatformPaymentConfigRecord,
  type PlatformPaymentConfigStatus,
  type PlatformPaymentConfigUpsertInput,
  type PlatformPaymentMerchantMode,
} from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";
import {
  assertCriticalPaymentConfigChangeAllowed,
  assertPaymentSecretChangeAllowed,
  type PendingRechargeOrderPort,
} from "@/services/platform-payment-config-pending-orders";
import { runPlatformPaymentConfigMutation } from "@/services/platform-payment-config-mutation";
import { systemSettingsService } from "@/services/system-settings";

export type SavePlatformWechatPayConfigInput = {
  merchant_mode?: PlatformPaymentMerchantMode;
  merchant_name?: string | null;
  merchant_id?: string | null;
  sub_merchant_id?: string | null;
  app_id?: string | null;
  sub_app_id?: string | null;
  encrypted_config_ref?: string | null;
  serial_no?: string | null;
  notify_url?: string | null;
  enabled_channels?: string[];
  status?: PlatformPaymentConfigStatus;
  risk_switches?: Record<string, unknown>;
};

export type SavePlatformWechatPaySecretBundleInput = {
  private_key_pem: string;
  api_v3_key: string;
  wechat_pay_public_key_id?: string | null;
  wechat_pay_public_key_pem?: string | null;
  base_url?: string;
};

export type PlatformWechatPayConfigView = Omit<
  PlatformPaymentConfigRecord,
  "serial_no" | "recharge_guard_version"
> & {
  serial_no_masked: string | null;
  has_encrypted_config_ref: boolean;
};

export type PlatformWechatPayConfigResult = {
  configured: boolean;
  can_manage: boolean;
  config: PlatformWechatPayConfigView | null;
};

export type PlatformWechatPayProfileView = {
  profile_code: PlatformPaymentProfileCode;
  label: string;
  description: string;
  secret_setting_key: string;
  configured: boolean;
  config: PlatformWechatPayConfigView | null;
};

export type PlatformWechatPayProfileListResult = {
  can_manage: boolean;
  profiles: PlatformWechatPayProfileView[];
};

type PlatformPaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  | "findWechatPayConfig"
  | "findWechatPayConfigByProfile"
  | "upsertWechatPayConfig"
>;

type PlatformSystemSettingsPort = Pick<typeof systemSettingsService, "updateSetting">;

type PlatformPaymentConfigServiceDependencies = {
  repository?: PlatformPaymentConfigRepositoryPort;
  settingsService?: PlatformSystemSettingsPort;
  pendingRechargeOrders?: PendingRechargeOrderPort;
};

const PLATFORM_WECHAT_RECHARGE_CHANNEL = "tenant_recharge";
const DEFAULT_WECHAT_PAY_BASE_URL = "https://api.mch.weixin.qq.com";

type PlatformWechatPayProfileDefinition = {
  profile_code: PlatformPaymentProfileCode;
  label: string;
  description: string;
  merchant_mode: PlatformPaymentMerchantMode;
  enabled_channels: string[];
  secret_setting_key: string;
};

const WECHAT_PAY_PROFILE_DEFINITIONS: PlatformWechatPayProfileDefinition[] = [
  {
    profile_code: "platform_direct_recharge",
    label: "平台直连商户",
    description: "用于平台自有积分充值等平台收款场景。",
    merchant_mode: "direct_merchant",
    enabled_channels: [PLATFORM_WECHAT_RECHARGE_CHANNEL],
    secret_setting_key: "PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  },
  {
    profile_code: "tenant_service_provider",
    label: "服务商商户",
    description: "用于服务商进件、租户特约商户和后续租户项目收款能力。",
    merchant_mode: "service_provider_sub_merchant",
    enabled_channels: ["project_payment", "applyment"],
    secret_setting_key: "PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
  },
];

export class PlatformPaymentConfigService {
  private readonly repository: PlatformPaymentConfigRepositoryPort;
  private readonly settingsService: PlatformSystemSettingsPort;
  private readonly pendingRechargeOrders: PendingRechargeOrderPort;

  constructor(dependencies: PlatformPaymentConfigServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformPaymentConfigRepository;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.pendingRechargeOrders = dependencies.pendingRechargeOrders ??
      billingRechargeRepository;
  }

  async getWechatPayConfig(
    authContext: AuthContext,
  ): Promise<PlatformWechatPayConfigResult> {
    this.assertReadable(authContext);
    const config = await this.repository.findWechatPayConfig();
    return {
      configured: Boolean(config),
      can_manage: this.canManage(authContext),
      config: config ? this.toView(config) : null,
    };
  }

  async saveWechatPayConfig(
    authContext: AuthContext,
    input: SavePlatformWechatPayConfigInput,
  ): Promise<PlatformWechatPayConfigResult> {
    this.assertManageable(authContext);
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    const current = await this.repository.findWechatPayConfig();
    const merchantMode = input.merchant_mode === undefined
      ? current?.merchant_mode ?? "direct_merchant"
      : input.merchant_mode;
    const next = {
      provider: "wechat_pay",
      profile_code: "platform_direct_recharge",
      principal_type: "platform",
      merchant_mode: merchantMode,
      merchant_name: input.merchant_name === undefined
        ? current?.merchant_name ?? null
        : input.merchant_name,
      merchant_id: input.merchant_id === undefined
        ? current?.merchant_id ?? null
        : input.merchant_id,
      sub_merchant_id: null,
      app_id: input.app_id === undefined
        ? current?.app_id ?? null
        : input.app_id,
      sub_app_id: null,
      encrypted_config_ref: input.encrypted_config_ref === undefined
        ? current?.encrypted_config_ref ??
          this.settingRef("PLATFORM_WECHAT_PAY_SECRET_BUNDLE")
        : input.encrypted_config_ref,
      serial_no: input.serial_no === undefined
        ? current?.serial_no ?? null
        : input.serial_no,
      notify_url: input.notify_url === undefined
        ? current?.notify_url ?? null
        : input.notify_url,
      enabled_channels: input.enabled_channels ??
        current?.enabled_channels ??
        [PLATFORM_WECHAT_RECHARGE_CHANNEL],
      status: input.status ?? current?.status ?? "pending",
      validation_status: "unchecked",
      last_validated_at: null,
      risk_switches: input.risk_switches ?? current?.risk_switches ?? {},
      created_by_employee_id:
        current?.created_by_employee_id ?? authContext.employeeId,
      updated_by_employee_id: authContext.employeeId,
    } satisfies PlatformPaymentConfigUpsertInput;
    if (merchantMode !== "direct_merchant") {
      throw Errors.badRequest("商户模式与支付配置 profile 不匹配");
    }
    await assertCriticalPaymentConfigChangeAllowed({
      current,
      next,
      pendingRechargeOrders: this.pendingRechargeOrders,
    });
    const saved = await runPlatformPaymentConfigMutation(() =>
      this.repository.upsertWechatPayConfig(next)
    );

    return {
      configured: true,
      can_manage: true,
      config: this.toView(saved),
    };
  }

  async listWechatPayProfiles(
    authContext: AuthContext,
  ): Promise<PlatformWechatPayProfileListResult> {
    this.assertReadable(authContext);
    const profiles = await Promise.all(
      WECHAT_PAY_PROFILE_DEFINITIONS.map(async (definition) => {
        const config = await this.repository.findWechatPayConfigByProfile(
          definition.profile_code,
        );
        return this.toProfileView(definition, config);
      }),
    );

    return {
      can_manage: this.canManage(authContext),
      profiles,
    };
  }

  async getWechatPayProfileConfig(
    authContext: AuthContext,
    profileCode: PlatformPaymentProfileCode,
  ): Promise<PlatformWechatPayProfileView> {
    this.assertReadable(authContext);
    const definition = this.getProfileDefinition(profileCode);
    const config = await this.repository.findWechatPayConfigByProfile(
      profileCode,
    );
    return this.toProfileView(definition, config);
  }

  async saveWechatPayProfile(
    authContext: AuthContext,
    profileCode: PlatformPaymentProfileCode,
    input: SavePlatformWechatPayConfigInput,
  ): Promise<PlatformWechatPayProfileView> {
    this.assertManageable(authContext);
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    const definition = this.getProfileDefinition(profileCode);
    const current = await this.repository.findWechatPayConfigByProfile(
      profileCode,
    );
    const merchantMode = input.merchant_mode === undefined
      ? current?.merchant_mode ?? definition.merchant_mode
      : input.merchant_mode;
    const next = {
      provider: "wechat_pay",
      profile_code: profileCode,
      principal_type: "platform",
      merchant_mode: merchantMode,
      merchant_name: input.merchant_name === undefined
        ? current?.merchant_name ?? null
        : input.merchant_name,
      merchant_id: input.merchant_id === undefined
        ? current?.merchant_id ?? null
        : input.merchant_id,
      sub_merchant_id: profileCode === "tenant_service_provider"
        ? input.sub_merchant_id === undefined
          ? current?.sub_merchant_id ?? null
          : input.sub_merchant_id
        : null,
      app_id: input.app_id === undefined
        ? current?.app_id ?? null
        : input.app_id,
      sub_app_id: profileCode === "tenant_service_provider"
        ? input.sub_app_id === undefined
          ? current?.sub_app_id ?? null
          : input.sub_app_id
        : null,
      encrypted_config_ref: input.encrypted_config_ref === undefined
        ? current?.encrypted_config_ref ??
          this.settingRef(definition.secret_setting_key)
        : input.encrypted_config_ref,
      serial_no: input.serial_no === undefined
        ? current?.serial_no ?? null
        : input.serial_no,
      notify_url: input.notify_url === undefined
        ? current?.notify_url ?? null
        : input.notify_url,
      enabled_channels: input.enabled_channels ??
        current?.enabled_channels ??
        definition.enabled_channels,
      status: input.status ?? current?.status ?? "pending",
      validation_status: "unchecked",
      last_validated_at: null,
      risk_switches: input.risk_switches ?? current?.risk_switches ?? {},
      created_by_employee_id:
        current?.created_by_employee_id ?? authContext.employeeId,
      updated_by_employee_id: authContext.employeeId,
    } satisfies PlatformPaymentConfigUpsertInput;
    if (merchantMode !== definition.merchant_mode) {
      throw Errors.badRequest("商户模式与支付配置 profile 不匹配");
    }
    await assertCriticalPaymentConfigChangeAllowed({
      current,
      next,
      pendingRechargeOrders: this.pendingRechargeOrders,
    });
    const saved = await runPlatformPaymentConfigMutation(() =>
      this.repository.upsertWechatPayConfig(next)
    );

    return this.toProfileView(definition, saved);
  }

  async saveWechatPaySecretBundle(
    authContext: AuthContext,
    profileCode: PlatformPaymentProfileCode,
    input: SavePlatformWechatPaySecretBundleInput,
  ): Promise<PlatformWechatPayProfileView> {
    this.assertManageable(authContext);
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    const definition = this.getProfileDefinition(profileCode);
    const current = await this.repository.findWechatPayConfigByProfile(
      profileCode,
    );
    await assertPaymentSecretChangeAllowed({
      current,
      pendingRechargeOrders: this.pendingRechargeOrders,
    });
    const encryptedConfigRef = this.settingRef(definition.secret_setting_key);
    const secretBundle = {
      private_key_pem: input.private_key_pem.trim(),
      api_v3_key: input.api_v3_key.trim(),
      wechat_pay_public_key_id:
        input.wechat_pay_public_key_id?.trim() || null,
      wechat_pay_public_key_pem:
        input.wechat_pay_public_key_pem?.trim() || null,
      base_url: input.base_url?.trim() || DEFAULT_WECHAT_PAY_BASE_URL,
    };

    await runPlatformPaymentConfigMutation(() =>
      this.settingsService.updateSetting(
        authContext,
        definition.secret_setting_key,
        JSON.stringify(secretBundle),
      )
    );

    const saved = await runPlatformPaymentConfigMutation(() =>
      this.repository.upsertWechatPayConfig({
        provider: "wechat_pay",
        profile_code: profileCode,
        principal_type: "platform",
        merchant_mode: current?.merchant_mode ?? definition.merchant_mode,
        merchant_name: current?.merchant_name ?? null,
        merchant_id: current?.merchant_id ?? null,
        sub_merchant_id: current?.sub_merchant_id ?? null,
        app_id: current?.app_id ?? null,
        sub_app_id: current?.sub_app_id ?? null,
        encrypted_config_ref: encryptedConfigRef,
        serial_no: current?.serial_no ?? null,
        notify_url: current?.notify_url ?? null,
        enabled_channels: current?.enabled_channels ??
          definition.enabled_channels,
        status: current?.status ?? "pending",
        validation_status: "unchecked",
        last_validated_at: null,
        risk_switches: current?.risk_switches ?? {},
        created_by_employee_id:
          current?.created_by_employee_id ?? authContext.employeeId,
        updated_by_employee_id: authContext.employeeId,
      } satisfies PlatformPaymentConfigUpsertInput)
    );

    return this.toProfileView(definition, saved);
  }

  private assertReadable(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.canManage(authContext) && !this.hasPermission(
      authContext,
      "platform.payment.config.read",
    )) {
      throw Errors.forbidden();
    }
  }

  private assertManageable(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.canManage(authContext)) {
      throw Errors.forbidden();
    }
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private canManage(authContext: AuthContext) {
    return this.hasPermission(authContext, "platform.payment.config.manage");
  }

  private hasPermission(authContext: AuthContext, permissionCode: string) {
    return authContext.permissions.some((permission) =>
      permission.code === permissionCode
    );
  }

  private toView(
    config: PlatformPaymentConfigRecord,
  ): PlatformWechatPayConfigView {
    const {
      serial_no: _serialNo,
      recharge_guard_version: _guardVersion,
      ...safeConfig
    } = config;
    return {
      ...safeConfig,
      serial_no_masked: this.maskSerialNo(config.serial_no),
      has_encrypted_config_ref: Boolean(config.encrypted_config_ref),
    };
  }

  private toProfileView(
    definition: PlatformWechatPayProfileDefinition,
    config: PlatformPaymentConfigRecord | null,
  ): PlatformWechatPayProfileView {
    return {
      profile_code: definition.profile_code,
      label: definition.label,
      description: definition.description,
      secret_setting_key: definition.secret_setting_key,
      configured: Boolean(config),
      config: config ? this.toView(config) : null,
    };
  }

  private getProfileDefinition(profileCode: PlatformPaymentProfileCode) {
    const definition = WECHAT_PAY_PROFILE_DEFINITIONS.find((item) =>
      item.profile_code === profileCode
    );
    if (!definition) {
      throw Errors.badRequest("无效的平台支付配置 profile");
    }
    return definition;
  }

  private settingRef(settingKey: string) {
    return `setting://${settingKey}`;
  }

  private maskSerialNo(serialNo: string | null) {
    if (!serialNo) return null;
    if (serialNo.length <= 8) return "****";
    return `${serialNo.slice(0, 8)}****${serialNo.slice(-4)}`;
  }
}

export const platformPaymentConfigService = new PlatformPaymentConfigService();
