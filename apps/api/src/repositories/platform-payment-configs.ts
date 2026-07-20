import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type PlatformPaymentProvider = "wechat_pay";
export type PlatformPaymentProfileCode =
  | "platform_direct_recharge"
  | "tenant_service_provider";
export type PlatformPaymentPrincipalType = "platform";
export type PlatformPaymentMerchantMode =
  | "direct_merchant"
  | "service_provider_sub_merchant";
export type PlatformPaymentConfigStatus =
  | "pending"
  | "active"
  | "disabled"
  | "suspended";
export type PlatformPaymentValidationStatus = "unchecked" | "valid" | "invalid";

export type PlatformPaymentConfigRecord = {
  id: string;
  provider: PlatformPaymentProvider;
  profile_code: PlatformPaymentProfileCode;
  principal_type: PlatformPaymentPrincipalType;
  merchant_mode: PlatformPaymentMerchantMode;
  merchant_name: string | null;
  merchant_id: string | null;
  sub_merchant_id: string | null;
  app_id: string | null;
  sub_app_id: string | null;
  encrypted_config_ref: string | null;
  secret_bundle_revision?: string | null;
  serial_no: string | null;
  notify_url: string | null;
  enabled_channels: string[];
  status: PlatformPaymentConfigStatus;
  validation_status: PlatformPaymentValidationStatus;
  last_validated_at: string | null;
  last_validation_error_code?: string | null;
  last_validation_error_message?: string | null;
  last_validation_request_id?: string | null;
  risk_switches: Record<string, unknown>;
  recharge_guard_version?: number;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformPaymentConfigUpsertInput = {
  provider: PlatformPaymentProvider;
  profile_code: PlatformPaymentProfileCode;
  principal_type: PlatformPaymentPrincipalType;
  merchant_mode: PlatformPaymentMerchantMode;
  merchant_name: string | null;
  merchant_id: string | null;
  sub_merchant_id: string | null;
  app_id: string | null;
  sub_app_id: string | null;
  encrypted_config_ref: string | null;
  secret_bundle_revision: string | null;
  serial_no: string | null;
  notify_url: string | null;
  enabled_channels: string[];
  status: PlatformPaymentConfigStatus;
  validation_status: PlatformPaymentValidationStatus;
  last_validated_at: string | null;
  last_validation_error_code: string | null;
  last_validation_error_message: string | null;
  last_validation_request_id: string | null;
  risk_switches: Record<string, unknown>;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
};

export type PlatformPaymentValidationUpdateInput = {
  configId: string;
  expectedUpdatedAt: string;
  validationStatus: PlatformPaymentValidationStatus;
  lastValidatedAt: string;
  lastValidationErrorCode: string | null;
  lastValidationErrorMessage: string | null;
  lastValidationRequestId: string | null;
  updatedByEmployeeId: string;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  upsert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

type UntypedClient = {
  from: (table: "platform_payment_configs") => UntypedTable;
};

class PlatformPaymentConfigRepository {
  private from(table: "platform_payment_configs") {
    return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
  }

  async findWechatPayConfig() {
    const { data, error } = await this.from("platform_payment_configs")
      .select("*")
      .eq("provider", "wechat_pay")
      .eq("profile_code", "platform_direct_recharge")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询平台微信支付配置失败", error);
    }

    return (data as PlatformPaymentConfigRecord | null) ?? null;
  }

  async findWechatPayConfigByProfile(profileCode: PlatformPaymentProfileCode) {
    const { data, error } = await this.from("platform_payment_configs")
      .select("*")
      .eq("provider", "wechat_pay")
      .eq("profile_code", profileCode)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询平台微信支付配置失败", error);
    }

    return (data as PlatformPaymentConfigRecord | null) ?? null;
  }

  async findWechatPayConfigById(configId: string) {
    const { data, error } = await this.from("platform_payment_configs")
      .select("*")
      .eq("id", configId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询平台微信支付配置失败", error);
    }

    return (data as PlatformPaymentConfigRecord | null) ?? null;
  }

  async listCallbackCandidateConfigs() {
    const { data, error } = await this.from("platform_payment_configs")
      .select("*")
      .eq("provider", "wechat_pay")
      .eq("status", "active")
      .limit(10);

    if (error) {
      throw Errors.dbError("查询平台微信支付回调配置失败", error);
    }

    return (data ?? []) as PlatformPaymentConfigRecord[];
  }

  async upsertWechatPayConfig(input: PlatformPaymentConfigUpsertInput) {
    const { data, error } = await this.from("platform_payment_configs")
      .upsert(input, {
        onConflict: "provider,profile_code",
        ignoreDuplicates: false,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("保存平台微信支付配置失败", error);
    }

    return data as PlatformPaymentConfigRecord;
  }

  async updateWechatPayValidation(input: PlatformPaymentValidationUpdateInput) {
    const { data, error } = await this.from("platform_payment_configs")
      .update({
        validation_status: input.validationStatus,
        last_validated_at: input.lastValidatedAt,
        last_validation_error_code: input.lastValidationErrorCode,
        last_validation_error_message: input.lastValidationErrorMessage,
        last_validation_request_id: input.lastValidationRequestId,
        updated_by_employee_id: input.updatedByEmployeeId,
      })
      .eq("id", input.configId)
      .eq("updated_at", input.expectedUpdatedAt)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("保存平台微信支付配置验证结果失败", error);
    }
    if (!data) {
      throw Errors.business(
        409,
        "支付配置已更新，请重新验证",
        "PLATFORM_PAYMENT_PROFILE_CHANGED",
      );
    }

    return data as PlatformPaymentConfigRecord;
  }
}

export const platformPaymentConfigRepository =
  new PlatformPaymentConfigRepository();
