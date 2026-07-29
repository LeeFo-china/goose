import { Errors } from "@/errors/error-factory";
import {
  type BrandingAddonPaymentOrderRecord,
  PAYMENT_ORDER_COLUMNS,
} from "@/repositories/branding-addon-order-records";

type QueryResult = { data: unknown; error: unknown };
export type BrandingAddonFailureTransitionQuery = {
  update(patch: Record<string, unknown>): BrandingAddonFailureTransitionQuery;
  eq(column: string, value: unknown): BrandingAddonFailureTransitionQuery;
  is(column: string, value: unknown): BrandingAddonFailureTransitionQuery;
  select(columns: string): BrandingAddonFailureTransitionQuery;
  maybeSingle(): Promise<QueryResult>;
};

export type MarkBrandingAddonOrderFailedBeforePrepayInput = {
  tenantId: string;
  orderId: string;
  paymentConfigId: string;
  expectedGuardVersion: number;
};

export async function markBrandingAddonOrderFailedBeforePrepay(
  query: BrandingAddonFailureTransitionQuery,
  input: MarkBrandingAddonOrderFailedBeforePrepayInput,
) {
  const { data, error } = await query
    .update({
      status: "failed",
      failure_code: "BRANDING_ADDON_ORDER_PAYMENT_CONFIG_CHANGED",
      failure_message: "支付配置或密钥版本在预下单前发生变化",
    })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .eq("status", "pending")
    .eq("payment_config_id", input.paymentConfigId)
    .eq("expected_guard_version", input.expectedGuardVersion)
    .is("prepay_id", null)
    .select(PAYMENT_ORDER_COLUMNS)
    .maybeSingle();
  if (error) {
    throw Errors.dbError("标记年度品牌权益订单预下单失败状态失败");
  }
  return (data as BrandingAddonPaymentOrderRecord | null) ?? null;
}
