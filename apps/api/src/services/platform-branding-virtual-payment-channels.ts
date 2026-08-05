import { Errors } from "@/errors/error-factory";
import {
  platformVirtualPaymentChannelsRepository,
} from "@/repositories/platform-virtual-payment-channels";
import type {
  PlatformWechatVirtualEnvironmentInput,
  UpdatePlatformWechatVirtualChannelInput,
} from "@/schema/platform-payment-configs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  isApplicationErrorLike,
  parseWechatVirtualPaymentSecretBundle,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { systemSettingsService } from "@/services/system-settings";

const MANAGE_PERMISSION = "platform.payment.config.manage";

type SettingsPort = Pick<typeof systemSettingsService, "getPlatformSecretString">;
type AccessPolicyPort = Pick<typeof accessPolicyService, "hasPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type ChannelRepositoryPort = Pick<
  typeof platformVirtualPaymentChannelsRepository,
  "update"
>;

export type PlatformBrandingVirtualPaymentChannelDependencies = {
  settingsService?: SettingsPort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  channelRepository?: ChannelRepositoryPort;
};

export class PlatformBrandingVirtualPaymentChannelService {
  private readonly settingsService: SettingsPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly channelRepository: ChannelRepositoryPort;

  constructor(
    dependencies: PlatformBrandingVirtualPaymentChannelDependencies = {},
  ) {
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.channelRepository = dependencies.channelRepository ??
      platformVirtualPaymentChannelsRepository;
  }

  async updateChannel(
    authContext: AuthContext,
    environment: PlatformWechatVirtualEnvironmentInput,
    input: UpdatePlatformWechatVirtualChannelInput,
  ) {
    const actor = this.requireManageable(authContext);
    const encryptedSecretRef = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[environment];
    const secretConfigured = await this.hasConfiguredSecretBundle(
      encryptedSecretRef,
      input.secret_revision,
    );
    if (input.status === "active" && !secretConfigured) {
      throw Errors.business(
        409,
        "虚拟支付密钥未配置或版本不匹配",
        "WECHAT_VIRTUAL_PAYMENT_SECRET_INVALID",
      );
    }

    const saved = await this.channelRepository.update({
      environment,
      expectedVersion: input.version,
      appId: input.app_id,
      virtualMerchantId: input.virtual_merchant_id,
      offerId: input.offer_id,
      encryptedSecretRef,
      secretRevision: input.secret_revision,
      status: input.status,
      actorEmployeeId: actor.employeeId,
    });
    await this.audit.recordBestEffort({
      action: "platform_config_update",
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
      resourceType: "platform_virtual_payment_channel",
      resourceId: saved.id,
      resourceLabel: environment,
      status: "success",
      summary: "更新微信虚拟支付渠道配置",
      metadata: {
        environment,
        status: saved.status,
        version: saved.version,
        secret_revision: saved.secret_revision,
      },
    });
    return {
      environment: saved.environment,
      app_id: saved.app_id,
      virtual_merchant_id: saved.virtual_merchant_id,
      offer_id: saved.offer_id,
      encrypted_secret_ref: saved.encrypted_secret_ref,
      secret_revision: saved.secret_revision,
      status: saved.status,
      version: saved.version,
    };
  }

  private requireManageable(authContext: AuthContext) {
    const isPlatformIdentity =
      authContext.isPlatformStaff === true ||
      authContext.isPlatformAdmin === true;
    if (
      !isPlatformIdentity ||
      authContext.tenantId !== null ||
      !authContext.employeeId ||
      !authContext.authUserId ||
      !this.accessPolicy.hasPermission(authContext, MANAGE_PERMISSION)
    ) {
      throw Errors.forbidden();
    }
    return {
      employeeId: authContext.employeeId,
      authUserId: authContext.authUserId,
    };
  }

  private async hasConfiguredSecretBundle(key: string, revision: number) {
    try {
      const raw = await this.settingsService.getPlatformSecretString(key);
      return parseWechatVirtualPaymentSecretBundle(raw)?.revision === revision;
    } catch (error) {
      if (isApplicationErrorLike(error)) {
        const applicationError = error as {
          statusCode: number;
          message: string;
          code: string;
        };
        throw Errors.business(
          applicationError.statusCode,
          applicationError.message,
          applicationError.code,
        );
      }
      throw Errors.dbError("读取平台支付密钥配置失败");
    }
  }
}

export const platformBrandingVirtualPaymentChannelService =
  new PlatformBrandingVirtualPaymentChannelService();
