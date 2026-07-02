import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type PlatformPaymentProvider = "wechat_pay";
export type PlatformPaymentPrincipalType = "platform";
export type PlatformPaymentMerchantMode = "direct_merchant";
export type PlatformPaymentConfigStatus =
  | "pending"
  | "active"
  | "disabled"
  | "suspended";
export type PlatformPaymentValidationStatus = "unchecked" | "valid" | "invalid";

export type PlatformPaymentConfigRecord = {
  id: string;
  provider: PlatformPaymentProvider;
  principal_type: PlatformPaymentPrincipalType;
  merchant_mode: PlatformPaymentMerchantMode;
  merchant_name: string | null;
  merchant_id: string | null;
  app_id: string | null;
  encrypted_config_ref: string | null;
  serial_no: string | null;
  notify_url: string | null;
  enabled_channels: string[];
  status: PlatformPaymentConfigStatus;
  validation_status: PlatformPaymentValidationStatus;
  last_validated_at: string | null;
  risk_switches: Record<string, unknown>;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformPaymentConfigUpsertInput = {
  provider: PlatformPaymentProvider;
  principal_type: PlatformPaymentPrincipalType;
  merchant_mode: PlatformPaymentMerchantMode;
  merchant_name: string | null;
  merchant_id: string | null;
  app_id: string | null;
  encrypted_config_ref: string | null;
  serial_no: string | null;
  notify_url: string | null;
  enabled_channels: string[];
  status: PlatformPaymentConfigStatus;
  validation_status: PlatformPaymentValidationStatus;
  last_validated_at: string | null;
  risk_switches: Record<string, unknown>;
  created_by_employee_id: string | null;
  updated_by_employee_id: string | null;
};

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  upsert: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
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
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询平台微信支付配置失败", error);
    }

    return (data as PlatformPaymentConfigRecord | null) ?? null;
  }

  async upsertWechatPayConfig(input: PlatformPaymentConfigUpsertInput) {
    const { data, error } = await this.from("platform_payment_configs")
      .upsert(input, {
        onConflict: "provider",
        ignoreDuplicates: false,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("保存平台微信支付配置失败", error);
    }

    return data as PlatformPaymentConfigRecord;
  }
}

export const platformPaymentConfigRepository =
  new PlatformPaymentConfigRepository();
