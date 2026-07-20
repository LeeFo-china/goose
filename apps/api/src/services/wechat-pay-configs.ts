import { Errors } from "@/errors/error-factory";
import {
  wechatPayConfigRepository,
  type WechatPayConfigRecord,
  type WechatPayConfigUpsertInput,
} from "@/repositories/wechat-pay-configs";
import type { UpdateWechatPayConfigInput } from "@/schema/wechat-pay-configs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type WechatPayConfigRepositoryPort = {
  findWechatPayConfig: (tenantId: string) =>
    Promise<WechatPayConfigRecord | null>;
  upsertWechatPayConfig: (
    input: WechatPayConfigUpsertInput,
  ) => Promise<WechatPayConfigRecord>;
};

type AccessPolicyPort = {
  assertTenantContext: (authContext: AuthContext) => string;
  hasPermission: (authContext: AuthContext, permissionCode: string) => boolean;
};

type WechatPayConfigServiceDependencies = {
  repository?: WechatPayConfigRepositoryPort;
  accessPolicyService?: AccessPolicyPort;
};

type SaveWechatPayConfigInput =
  Partial<UpdateWechatPayConfigInput> &
  Pick<UpdateWechatPayConfigInput, "merchant_mode" | "status">;

export type WechatPayConfigView = {
  id: string;
  principal_type: string;
  merchant_mode: string;
  merchant_name: string | null;
  merchant_id: string | null;
  sub_merchant_id: string | null;
  app_id: string | null;
  sub_app_id: string | null;
  applyment_business_code: string | null;
  applyment_id: string | null;
  applyment_state: string;
  applyment_state_message: string | null;
  appid_binding_state: string;
  appid_binding_message: string | null;
  opened_at: string | null;
  suspended_at: string | null;
  status: string;
  enabled_channels: unknown;
  settlement_account_summary: string | null;
  has_encrypted_config_ref: boolean;
  risk_switches: unknown;
  serial_no_masked: string | null;
  notify_url: string | null;
  validation_status: string;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  managed_by_platform: boolean;
};

export type WechatPayConfigResult = {
  configured: boolean;
  can_manage: boolean;
  config: WechatPayConfigView | null;
};

export class WechatPayConfigService {
  private repository: WechatPayConfigRepositoryPort;
  private accessPolicyService: AccessPolicyPort;

  constructor(dependencies: WechatPayConfigServiceDependencies = {}) {
    this.repository = dependencies.repository ?? wechatPayConfigRepository;
    this.accessPolicyService =
      dependencies.accessPolicyService ?? accessPolicyService;
  }

  async getConfig(authContext: AuthContext): Promise<WechatPayConfigResult> {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    this.assertReadPermission(authContext);

    const config = await this.repository.findWechatPayConfig(tenantId);
    return {
      configured: Boolean(config),
      can_manage: this.canManage(authContext) && !isPlatformManaged(config),
      config: config ? this.toView(config) : null,
    };
  }

  async saveConfig(
    authContext: AuthContext,
    input: SaveWechatPayConfigInput,
  ): Promise<WechatPayConfigResult> {
    const tenantId = this.accessPolicyService.assertTenantContext(authContext);
    if (!this.canManage(authContext)) {
      throw Errors.forbidden();
    }
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    const current = await this.repository.findWechatPayConfig(tenantId);
    if (
      isPlatformManaged(current) ||
      input.merchant_mode === "service_provider_sub_merchant"
    ) {
      throw Errors.business(
        409,
        "服务商微信支付配置由平台进件激活流程统一维护",
        "WECHAT_PAY_CONFIG_PLATFORM_MANAGED",
      );
    }
    const saved = await this.repository.upsertWechatPayConfig({
      tenant_id: tenantId,
      provider: "wechat_pay",
      principal_type: input.principal_type ?? current?.principal_type ?? "tenant",
      merchant_mode: input.merchant_mode,
      merchant_name: input.merchant_name ?? null,
      merchant_id: input.merchant_id ?? null,
      sub_merchant_id: input.sub_merchant_id ?? null,
      app_id: input.app_id ?? null,
      sub_app_id: input.sub_app_id ?? null,
      applyment_business_code: input.applyment_business_code === undefined
        ? current?.applyment_business_code ?? null
        : input.applyment_business_code,
      applyment_id: input.applyment_id === undefined
        ? current?.applyment_id ?? null
        : input.applyment_id,
      applyment_state:
        input.applyment_state ?? current?.applyment_state ?? "not_started",
      applyment_state_message: input.applyment_state_message === undefined
        ? current?.applyment_state_message ?? null
        : input.applyment_state_message,
      appid_binding_state:
        input.appid_binding_state ?? current?.appid_binding_state ?? "not_required",
      appid_binding_message: input.appid_binding_message === undefined
        ? current?.appid_binding_message ?? null
        : input.appid_binding_message,
      status: input.status,
      enabled_channels: input.enabled_channels ??
        current?.enabled_channels ??
        ["project_payment"],
      settlement_account_summary: input.settlement_account_summary ?? null,
      encrypted_config_ref: current?.encrypted_config_ref ?? null,
      risk_switches: (input.risk_switches === undefined
        ? current?.risk_switches ?? {}
        : input.risk_switches) as WechatPayConfigUpsertInput["risk_switches"],
      serial_no: input.serial_no === undefined
        ? current?.serial_no ?? null
        : input.serial_no,
      notify_url: input.notify_url ?? null,
      validation_status: "unchecked",
      last_validated_at: null,
      created_by_employee_id:
        current?.created_by_employee_id ?? authContext.employeeId,
      updated_by_employee_id: authContext.employeeId,
    });

    return {
      configured: true,
      can_manage: true,
      config: this.toView(saved),
    };
  }

  private assertReadPermission(authContext: AuthContext) {
    if (this.canManage(authContext)) {
      return;
    }
    if (!this.accessPolicyService.hasPermission(
      authContext,
      "wechat_pay.config.read",
    )) {
      throw Errors.forbidden();
    }
  }

  private canManage(authContext: AuthContext) {
    return this.accessPolicyService.hasPermission(
      authContext,
      "wechat_pay.config.manage",
    );
  }

  private toView(config: WechatPayConfigRecord): WechatPayConfigView {
    return {
      id: config.id,
      principal_type: config.principal_type,
      merchant_mode: config.merchant_mode,
      merchant_name: config.merchant_name,
      merchant_id: config.merchant_id,
      sub_merchant_id: config.sub_merchant_id,
      app_id: config.app_id,
      sub_app_id: config.sub_app_id,
      applyment_business_code: config.applyment_business_code,
      applyment_id: config.applyment_id,
      applyment_state: config.applyment_state,
      applyment_state_message: config.applyment_state_message,
      appid_binding_state: config.appid_binding_state,
      appid_binding_message: config.appid_binding_message,
      opened_at: config.opened_at,
      suspended_at: config.suspended_at,
      status: config.status,
      enabled_channels: config.enabled_channels,
      settlement_account_summary: config.settlement_account_summary,
      has_encrypted_config_ref: Boolean(config.encrypted_config_ref),
      risk_switches: config.risk_switches,
      serial_no_masked: this.maskSerialNo(config.serial_no),
      notify_url: config.notify_url,
      validation_status: config.validation_status,
      last_validated_at: config.last_validated_at,
      created_at: config.created_at,
      updated_at: config.updated_at,
      created_by_employee_id: config.created_by_employee_id,
      updated_by_employee_id: config.updated_by_employee_id,
      managed_by_platform: isPlatformManaged(config),
    };
  }

  private maskSerialNo(serialNo: string | null) {
    if (!serialNo) return null;
    if (serialNo.length <= 8) return "****";
    return `${serialNo.slice(0, 8)}****${serialNo.slice(-4)}`;
  }
}

function isPlatformManaged(config: WechatPayConfigRecord | null) {
  return Boolean(
    config &&
      (config.platform_payment_config_id ||
        config.merchant_mode === "service_provider_sub_merchant"),
  );
}

export const wechatPayConfigService = new WechatPayConfigService();
