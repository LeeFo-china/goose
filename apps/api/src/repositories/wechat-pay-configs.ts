import { Errors } from "@/errors/error-factory";
import type { Inserts, Tables } from "@/types/db";
import { SupabaseDB } from "@/utils/supabase/index";

export type WechatPayConfigRecord = Tables<"tenant_payment_configs">;

export type WechatPayConfigUpsertInput =
  Inserts<"tenant_payment_configs"> & { provider: "wechat_pay" };

class WechatPayConfigRepository {
  async findWechatPayConfig(tenantId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_payment_configs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("provider", "wechat_pay")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询微信支付配置失败", error);
    }

    return (data as WechatPayConfigRecord | null) ?? null;
  }

  async upsertWechatPayConfig(input: WechatPayConfigUpsertInput) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_payment_configs")
      .upsert(input, {
        onConflict: "tenant_id,provider",
        ignoreDuplicates: false,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("保存微信支付配置失败", error);
    }

    return data as WechatPayConfigRecord;
  }
}

export const wechatPayConfigRepository = new WechatPayConfigRepository();
