import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  then: Promise<{ data: unknown; error: unknown }>["then"];
};

type UntypedClient = {
  from: (table: "tenant_credit_orders") => UntypedTable;
};

function table() {
  return (SupabaseDB.getAdminClient() as unknown as UntypedClient)
    .from("tenant_credit_orders");
}

export async function hasPendingWechatOrdersForPaymentConfig(
  configId: string,
) {
  const { data, error } = await table()
    .select("id")
    .eq("payment_config_id", configId)
    .eq("channel", "wechat_pay")
    .eq("status", "pending")
    .limit(1);

  if (error) {
    throw Errors.dbError("检查微信充值待支付订单失败", error);
  }

  return ((data ?? []) as unknown[]).length > 0;
}
