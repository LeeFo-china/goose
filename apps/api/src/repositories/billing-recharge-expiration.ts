import { Errors } from "@/errors/error-factory";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import { SupabaseDB } from "@/utils/supabase/index";

type ExpirationTable = {
  update: (patch: Record<string, unknown>) => ExpirationTable;
  eq: (column: string, value: unknown) => ExpirationTable;
  is: (column: string, value: unknown) => ExpirationTable;
  select: (columns: string) => ExpirationTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
};

type ExpirationClient = {
  from: (table: "tenant_credit_orders") => ExpirationTable;
  rpc: (
    functionName:
      | "billing_claim_expired_recharge_orders"
      | "billing_renew_recharge_close_claim",
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export type ClaimExpiredRechargeOrdersInput = {
  batchSize: number;
  leaseSeconds: number;
  excludedOrderIds: string[];
};

export type RenewRechargeOrderCloseClaimInput = {
  orderId: string;
  claimToken: string;
  leaseSeconds: number;
};

export type MarkClaimedRechargeOrderClosedInput = {
  orderId: string;
  claimToken: string;
  closedAt: Date;
  requireMissingPrepay?: boolean;
};

export type ReleaseRechargeOrderCloseClaimInput = {
  orderId: string;
  claimToken: string;
  errorMessage: string | null;
};

export async function claimExpiredRechargeOrders(
  input: ClaimExpiredRechargeOrdersInput,
): Promise<TenantCreditOrderRecord[]> {
  const { data, error } = await client().rpc(
    "billing_claim_expired_recharge_orders",
    {
      p_limit: clampInteger(input.batchSize, 1, 100),
      p_lease_seconds: clampInteger(input.leaseSeconds, 10, 600),
      p_excluded_ids: input.excludedOrderIds.slice(0, 100),
    },
  );
  if (error) {
    throw Errors.dbError("领取过期积分充值订单失败", error);
  }
  return (data ?? []) as TenantCreditOrderRecord[];
}

export async function renewRechargeOrderCloseClaim(
  input: RenewRechargeOrderCloseClaimInput,
): Promise<TenantCreditOrderRecord | null> {
  const { data, error } = await client().rpc(
    "billing_renew_recharge_close_claim",
    {
      p_order_id: input.orderId,
      p_claim_token: input.claimToken,
      p_lease_seconds: clampInteger(input.leaseSeconds, 10, 600),
    },
  );
  if (error) {
    throw Errors.dbError("续租积分充值关单领取失败", error);
  }
  return (data as TenantCreditOrderRecord | null) ?? null;
}

export async function markClaimedRechargeOrderClosed(
  input: MarkClaimedRechargeOrderClosedInput,
): Promise<TenantCreditOrderRecord | null> {
  let query = table()
    .update({
      status: "closed",
      closed_at: input.closedAt.toISOString(),
      close_claim_token: null,
      close_claim_expires_at: null,
      close_last_error: null,
    })
    .eq("id", input.orderId)
    .eq("status", "pending")
    .eq("close_claim_token", input.claimToken);
  if (input.requireMissingPrepay) {
    query = query.is("prepay_id", null);
  }
  const { data, error } = await query.select("*").maybeSingle();
  if (error) {
    throw Errors.dbError("关闭过期积分充值订单失败", error);
  }
  return (data as TenantCreditOrderRecord | null) ?? null;
}

export async function releaseRechargeOrderCloseClaim(
  input: ReleaseRechargeOrderCloseClaimInput,
): Promise<TenantCreditOrderRecord | null> {
  const { data, error } = await table()
    .update({
      close_claim_token: null,
      close_claim_expires_at: null,
      close_last_error: input.errorMessage?.slice(0, 500) ?? null,
    })
    .eq("id", input.orderId)
    .eq("status", "pending")
    .eq("close_claim_token", input.claimToken)
    .select("*")
    .maybeSingle();
  if (error) {
    throw Errors.dbError("释放积分充值关单领取失败", error);
  }
  return (data as TenantCreditOrderRecord | null) ?? null;
}

function client() {
  return SupabaseDB.getAdminClient() as unknown as ExpirationClient;
}

function table() {
  return client().from("tenant_credit_orders");
}

function clampInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}
