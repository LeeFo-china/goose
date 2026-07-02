import { Errors } from "@/errors/error-factory";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
  type PlatformPaymentConfigStatus,
  type PlatformPaymentConfigUpsertInput,
} from "@/repositories/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";

export type SavePlatformWechatPayConfigInput = {
  merchant_mode?: "direct_merchant";
  merchant_name?: string | null;
  merchant_id?: string | null;
  app_id?: string | null;
  encrypted_config_ref?: string | null;
  serial_no?: string | null;
  notify_url?: string | null;
  enabled_channels?: string[];
  status?: PlatformPaymentConfigStatus;
  risk_switches?: Record<string, unknown>;
};

export type PlatformWechatPayConfigView = Omit<
  PlatformPaymentConfigRecord,
  "serial_no"
> & {
  serial_no_masked: string | null;
  has_encrypted_config_ref: boolean;
};

export type PlatformWechatPayConfigResult = {
  configured: boolean;
  can_manage: boolean;
  config: PlatformWechatPayConfigView | null;
};

type PlatformPaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfig" | "upsertWechatPayConfig"
>;

type PlatformPaymentConfigServiceDependencies = {
  repository?: PlatformPaymentConfigRepositoryPort;
};

const PLATFORM_WECHAT_RECHARGE_CHANNEL = "tenant_recharge";

export class PlatformPaymentConfigService {
  private readonly repository: PlatformPaymentConfigRepositoryPort;

  constructor(dependencies: PlatformPaymentConfigServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformPaymentConfigRepository;
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
    const saved = await this.repository.upsertWechatPayConfig({
      provider: "wechat_pay",
      principal_type: "platform",
      merchant_mode: "direct_merchant",
      merchant_name: input.merchant_name ?? null,
      merchant_id: input.merchant_id ?? null,
      app_id: input.app_id ?? null,
      encrypted_config_ref: input.encrypted_config_ref === undefined
        ? current?.encrypted_config_ref ?? null
        : input.encrypted_config_ref,
      serial_no: input.serial_no === undefined
        ? current?.serial_no ?? null
        : input.serial_no,
      notify_url: input.notify_url ?? null,
      enabled_channels: input.enabled_channels ??
        current?.enabled_channels ??
        [PLATFORM_WECHAT_RECHARGE_CHANNEL],
      status: input.status ?? "pending",
      validation_status: "unchecked",
      last_validated_at: null,
      risk_switches: input.risk_switches ?? current?.risk_switches ?? {},
      created_by_employee_id:
        current?.created_by_employee_id ?? authContext.employeeId,
      updated_by_employee_id: authContext.employeeId,
    } satisfies PlatformPaymentConfigUpsertInput);

    return {
      configured: true,
      can_manage: true,
      config: this.toView(saved),
    };
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
    const { serial_no: _serialNo, ...safeConfig } = config;
    return {
      ...safeConfig,
      serial_no_masked: this.maskSerialNo(config.serial_no),
      has_encrypted_config_ref: Boolean(config.encrypted_config_ref),
    };
  }

  private maskSerialNo(serialNo: string | null) {
    if (!serialNo) return null;
    if (serialNo.length <= 8) return "****";
    return `${serialNo.slice(0, 8)}****${serialNo.slice(-4)}`;
  }
}

export const platformPaymentConfigService = new PlatformPaymentConfigService();
