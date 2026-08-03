import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = { data: unknown; error: unknown };

type BrandingAddonPaymentConfigQuery = PromiseLike<QueryResult> & {
  select(columns: string): BrandingAddonPaymentConfigQuery;
  eq(column: string, value: unknown): BrandingAddonPaymentConfigQuery;
  limit(value: number): BrandingAddonPaymentConfigQuery;
};

type BrandingAddonPaymentConfigClient = {
  from(table: "tenant_addon_orders"): BrandingAddonPaymentConfigQuery;
};

export async function hasPendingAddonOrdersForPaymentConfig(
  paymentConfigId: string,
) {
  const { data, error } = await (
    SupabaseDB.getAdminClient() as unknown as BrandingAddonPaymentConfigClient
  )
    .from("tenant_addon_orders")
    .select("id")
    .eq("payment_config_id", paymentConfigId)
    .eq("status", "pending")
    .limit(1);
  if (error) {
    throw Errors.dbError("检查品牌权益待支付订单失败", error);
  }
  return Array.isArray(data) && data.length > 0;
}

export const brandingAddonPaymentConfigRepository = {
  hasPendingOrdersForPaymentConfig: hasPendingAddonOrdersForPaymentConfig,
};
