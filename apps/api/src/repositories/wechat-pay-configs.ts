import { Errors } from "@/errors/error-factory";
import type { Inserts, Tables, Updates } from "@/types/db";
import { SupabaseDB } from "@/utils/supabase/index";

export type WechatPayConfigRecord = Tables<"tenant_payment_configs">;
export type WechatPayConfigUpdate = Updates<"tenant_payment_configs">;

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

  async updateWechatPayConfig(input: {
    id: string;
    patch: WechatPayConfigUpdate;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_payment_configs")
      .update(input.patch)
      .eq("id", input.id)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("更新微信支付配置失败", error);
    }

    return data as WechatPayConfigRecord;
  }

  async listCallbackCandidateConfigs(): Promise<WechatPayConfigRecord[]> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_payment_configs")
      .select("*")
      .eq("provider", "wechat_pay")
      .eq("status", "active")
      .not("encrypted_config_ref", "is", null)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      throw Errors.dbError("查询微信支付回调候选配置失败", error);
    }

    return (data ?? []) as WechatPayConfigRecord[];
  }
}

export const wechatPayConfigRepository = new WechatPayConfigRepository();
