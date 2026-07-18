import { Errors } from "@/errors/error-factory";
import type { TenantCreditOrderRecord } from "@/repositories/billing-recharge";
import { SupabaseDB } from "@/utils/supabase/index";

export type MarkPendingRechargePrepayCreatedInput = {
  tenantId: string;
  orderId: string;
  prepayId: string;
  now: Date;
};

type PrepayUpdateTable = {
  update: (patch: Record<string, unknown>) => PrepayUpdateTable;
  eq: (column: string, value: unknown) => PrepayUpdateTable;
  gt: (column: string, value: unknown) => PrepayUpdateTable;
  select: (columns: string) => PrepayUpdateTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
};

type PrepayUpdateClient = {
  from: (table: "tenant_credit_orders") => PrepayUpdateTable;
};

export async function markPendingRechargePrepayCreated(
  input: MarkPendingRechargePrepayCreatedInput,
): Promise<TenantCreditOrderRecord | null> {
  const client = SupabaseDB.getAdminClient() as unknown as PrepayUpdateClient;
  const { data, error } = await client.from("tenant_credit_orders")
    .update({ prepay_id: input.prepayId })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .eq("status", "pending")
    .gt("payment_expires_at", input.now.toISOString())
    .select("*")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("保存积分充值预支付单失败", error);
  }
  return (data as TenantCreditOrderRecord | null) ?? null;
}
