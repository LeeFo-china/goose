import { Errors } from "@/errors/error-factory";
import type {
  PlatformWechatVirtualEnvironmentInput,
  UpdatePlatformWechatVirtualMessageTokenInput,
  UpdatePlatformWechatVirtualSecretBundleInput,
} from "@/schema/platform-payment-configs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  isApplicationErrorLike,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { systemSettingsService } from "@/services/system-settings";
import {
  isValidWechatMiniProgramOriginalId,
  isValidWechatVirtualPaymentMessageToken,
} from "@/services/wechat-virtual-payment-message-config";

const READ_PERMISSION = "platform.payment.config.read";
const MANAGE_PERMISSION = "platform.payment.config.manage";
const MESSAGE_TOKEN_KEY = "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN";
const ORIGINAL_ID_KEY = "WECHAT_MINIPROGRAM_ORIGINAL_ID";
const ORIGINAL_ID_SETTINGS_HREF = "/settings?group=wechat";
const STABLE_DATABASE_GUARD_MESSAGES: Readonly<Record<string, string>> = {
  PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS:
    "存在使用当前微信支付配置的待支付充值订单，请等待订单支付或关闭后再修改",
  BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS:
    "存在待签发、签发中或待核对的虚拟支付订单，请完成处理后再变更密钥",
  BRANDING_VIRTUAL_PAYMENT_SECRET_IDENTITY_IMMUTABLE:
    "虚拟支付密钥的标识、归属和密钥属性不可修改",
  BRANDING_VIRTUAL_PAYMENT_SECRET_SCOPE_INVALID:
    "虚拟支付密钥必须是平台级加密配置",
  WECHAT_VIRTUAL_MESSAGE_TOKEN_IDENTITY_IMMUTABLE:
    "虚拟支付消息令牌的标识、归属和密钥属性不可修改",
  WECHAT_VIRTUAL_MESSAGE_TOKEN_SCOPE_INVALID:
    "虚拟支付消息令牌必须是平台级加密配置",
};

type SettingsServicePort = Pick<
  typeof systemSettingsService,
  | "getPlatformSettingStatus"
  | "getPlatformSecretString"
  | "updatePlatformPaymentSecretSetting"
>;
type AccessPolicyPort = Pick<typeof accessPolicyService, "hasPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;

export type PlatformBrandingVirtualPaymentSecretDependencies = {
  settingsService?: SettingsServicePort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
};

export class PlatformBrandingVirtualPaymentSecretService {
  private readonly settingsService: SettingsServicePort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;

  constructor(
    dependencies: PlatformBrandingVirtualPaymentSecretDependencies = {},
  ) {
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
  }

  async getStatuses(authContext: AuthContext) {
    this.requireReadable(authContext);
    try {
      const [
        sandbox,
        production,
        messageTokenStatus,
        originalIdStatus,
        messageToken,
        originalId,
      ] = await Promise.all([
        this.settingsService.getPlatformSettingStatus(
          WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.sandbox,
        ),
        this.settingsService.getPlatformSettingStatus(
          WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
        ),
        this.settingsService.getPlatformSettingStatus(MESSAGE_TOKEN_KEY),
        this.settingsService.getPlatformSettingStatus(ORIGINAL_ID_KEY),
        this.settingsService.getPlatformSecretString(MESSAGE_TOKEN_KEY),
        this.settingsService.getPlatformSecretString(ORIGINAL_ID_KEY),
      ]);
      return {
        virtual_secret_sources: { sandbox, production },
        message_auth: {
          message_token: {
            ...messageTokenStatus,
            valid: isValidWechatVirtualPaymentMessageToken(messageToken),
          },
          original_id: {
            ...originalIdStatus,
            valid: isValidWechatMiniProgramOriginalId(originalId),
            settings_href: ORIGINAL_ID_SETTINGS_HREF,
          },
        },
      };
    } catch (error) {
      throw sanitizeSettingsError(error, "读取虚拟支付密钥状态失败");
    }
  }

  async saveSecretBundle(
    authContext: AuthContext,
    environment: PlatformWechatVirtualEnvironmentInput,
    input: UpdatePlatformWechatVirtualSecretBundleInput,
  ) {
    const actor = this.requireManageable(authContext);
    const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[environment];
    await this.updateSetting(
      authContext,
      key,
      JSON.stringify({ appKey: input.app_key, revision: input.revision }),
      "保存虚拟支付密钥失败",
    );
    const result = {
      environment,
      configured: true,
      source: "database" as const,
      revision: input.revision,
    };
    await this.audit.recordBestEffort({
      action: "platform_config_update",
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
      resourceType: "system_setting",
      resourceLabel: key,
      status: "success",
      summary: "更新虚拟支付 AppKey",
      metadata: {
        key,
        environment,
        revision: input.revision,
        configured: true,
      },
    });
    return result;
  }

  async saveMessageToken(
    authContext: AuthContext,
    input: UpdatePlatformWechatVirtualMessageTokenInput,
  ) {
    const actor = this.requireManageable(authContext);
    await this.updateSetting(
      authContext,
      MESSAGE_TOKEN_KEY,
      input.message_token,
      "保存虚拟支付消息令牌失败",
    );
    const result = {
      configured: true,
      valid: isValidWechatVirtualPaymentMessageToken(input.message_token),
      source: "database" as const,
    };
    await this.audit.recordBestEffort({
      action: "platform_config_update",
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
      resourceType: "system_setting",
      resourceLabel: MESSAGE_TOKEN_KEY,
      status: "success",
      summary: "更新虚拟支付消息令牌",
      metadata: { key: MESSAGE_TOKEN_KEY, configured: true },
    });
    return result;
  }

  private requireReadable(authContext: AuthContext) {
    this.requirePlatformContext(authContext);
    if (!this.canManage(authContext) &&
      !this.accessPolicy.hasPermission(authContext, READ_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private requireManageable(authContext: AuthContext) {
    if (!this.canManage(authContext)) throw Errors.forbidden();
    return {
      employeeId: authContext.employeeId,
      authUserId: authContext.authUserId,
    };
  }

  private requirePlatformContext(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin || authContext.tenantId !== null) {
      throw Errors.forbidden();
    }
  }

  private canManage(authContext: AuthContext): authContext is AuthContext & {
    authUserId: string;
    employeeId: string;
    tenantId: null;
    isPlatformAdmin: true;
  } {
    return authContext.isPlatformAdmin &&
      authContext.tenantId === null &&
      Boolean(authContext.employeeId) &&
      Boolean(authContext.authUserId) &&
      this.accessPolicy.hasPermission(authContext, MANAGE_PERMISSION);
  }

  private async updateSetting(
    authContext: AuthContext,
    key: string,
    value: string,
    fallbackMessage: string,
  ) {
    try {
      await this.settingsService.updatePlatformPaymentSecretSetting(
        authContext,
        key,
        value,
      );
    } catch (error) {
      throw sanitizeSettingsError(error, fallbackMessage);
    }
  }
}

function sanitizeSettingsError(error: unknown, fallbackMessage: string) {
  if (isApplicationErrorLike(error)) {
    const applicationError = error as {
      statusCode: number;
      message: string;
      code: string;
    };
    return Errors.business(
      applicationError.statusCode,
      STABLE_DATABASE_GUARD_MESSAGES[applicationError.code] ?? fallbackMessage,
      applicationError.code,
    );
  }
  return Errors.dbError(fallbackMessage);
}

export const platformBrandingVirtualPaymentSecretService =
  new PlatformBrandingVirtualPaymentSecretService();
