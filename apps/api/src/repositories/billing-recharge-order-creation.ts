import { Errors } from "@/errors/error-factory";
import { matchesPostgresError } from "@/errors/postgres-error-details";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import { SupabaseDB } from "@/utils/supabase/index";

export type GuardedTenantCreditOrderCreateInput = {
  tenant_id: string;
  order_no: string;
  out_trade_no: string;
  idempotency_key: string | null;
  package_code: string;
  credits: number;
  bonus_credits: number;
  amount_fen: number;
  channel: "wechat_pay";
  status: "pending";
  created_by: string;
  payment_config_id: string;
  expected_payment_config_guard_version: number;
  payment_expires_at: string;
  metadata: Record<string, unknown>;
};

type UntypedClient = {
  rpc: (
    functionName: "billing_create_pending_wechat_recharge_order",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const VERSION_CHANGED = "BILLING_RECHARGE_PAYMENT_CONFIG_VERSION_CHANGED";
const CONFIG_NOT_READY = "BILLING_RECHARGE_PAYMENT_CONFIG_NOT_READY";

export async function createGuardedPendingRechargeOrder(
  input: GuardedTenantCreditOrderCreateInput,
) {
  const client = SupabaseDB.getAdminClient() as unknown as UntypedClient;
  const { data, error } = await client.rpc(
    "billing_create_pending_wechat_recharge_order",
    {
      p_tenant_id: input.tenant_id,
      p_order_no: input.order_no,
      p_out_trade_no: input.out_trade_no,
      p_idempotency_key: input.idempotency_key,
      p_package_code: input.package_code,
      p_credits: input.credits,
      p_bonus_credits: input.bonus_credits,
      p_amount_fen: input.amount_fen,
      p_created_by: input.created_by,
      p_payment_config_id: input.payment_config_id,
      p_expected_guard_version: input.expected_payment_config_guard_version,
      p_payment_expires_at: input.payment_expires_at,
      p_metadata: input.metadata,
    },
  );

  if (error) {
    if (matchesPostgresError(error, "23514", VERSION_CHANGED)) {
      throw Errors.business(
        409,
        "微信支付配置已更新，请重新发起充值",
        VERSION_CHANGED,
      );
    }
    if (matchesPostgresError(error, "23514", CONFIG_NOT_READY)) {
      throw Errors.business(
        409,
        "平台微信支付配置未启用或不完整",
        "BILLING_RECHARGE_PAYMENT_CONFIG_INVALID",
      );
    }
    throw Errors.dbError("创建积分充值订单失败", error);
  }

  return data as TenantCreditOrderRecord;
}
