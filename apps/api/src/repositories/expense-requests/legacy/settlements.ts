import { Errors, SupabaseDB } from "./shared";
import type { ExpenseRequestSettlementPayload } from "./shared";

export async function createSettlement(this: any, payload: ExpenseRequestSettlementPayload) {
  const { error } = await SupabaseDB.getAdminClient()
    .from("expense_request_settlements")
    .insert({
      tenant_id: payload.tenant_id ?? null,
      expense_request_id: payload.expense_request_id,
      payee_name: payload.payee_name,
      payee_bank: payload.payee_bank ?? null,
      payee_account: payload.payee_account ?? null,
      method: payload.method,
      paid_amount: payload.paid_amount,
      paid_at: payload.paid_at,
      paid_by: payload.paid_by,
      evidence_images: payload.evidence_images,
      remark: payload.remark ?? null,
    })
    .select("id");

  if (error) {
    throw Errors.dbError("登记费用打款失败", error);
  }
}

export async function hasSettlement(this: any, expenseRequestId: string, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("expense_request_settlements")
    .select("id")
    .eq("expense_request_id", expenseRequestId);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw Errors.dbError("查询费用打款记录失败", error);
  }

  return !!data?.id;
}
