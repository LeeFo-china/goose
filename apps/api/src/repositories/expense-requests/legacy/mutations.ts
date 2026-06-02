import { Errors, SupabaseDB } from "./shared";
import type {
  ExpenseRequestItemMutationInput,
  ExpenseRequestMutationPayload,
  ExpenseRequestRecord,
} from "./shared";

export async function create(this: any, 
  payload: ExpenseRequestMutationPayload,
  items: ExpenseRequestItemMutationInput[],
): Promise<ExpenseRequestRecord> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("expense_requests")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("创建费用申请失败", error);
  }

  if (!data?.id) {
    throw Errors.badRequest("创建费用申请失败");
  }

  if (items.length > 0) {
    await this.replaceItems(data.id, items, payload.tenant_id ?? null);
  }

  const record = await this.findById(data.id, payload.tenant_id ?? null);
  if (!record) {
    throw Errors.badRequest("费用申请创建成功但读取失败");
  }

  return record;
}

export async function update(this: any, 
  id: string,
  payload: ExpenseRequestMutationPayload,
  items?: ExpenseRequestItemMutationInput[],
  tenantId?: string | null,
): Promise<ExpenseRequestRecord> {
  let query = SupabaseDB.getAdminClient()
    .from("expense_requests")
    .update(payload)
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.select("id").maybeSingle();

  if (error) {
    throw Errors.dbError("更新费用申请失败", error);
  }

  if (!data?.id) {
    throw Errors.badRequest("费用申请不存在或更新失败");
  }

  if (items) {
    await this.replaceItems(id, items, tenantId ?? payload.tenant_id ?? null);
  }

  const record = await this.findById(id, tenantId ?? payload.tenant_id ?? null);
  if (!record) {
    throw Errors.badRequest("费用申请更新成功但读取失败");
  }

  return record;
}

export async function replaceItems(this: any, 
  id: string,
  items: ExpenseRequestItemMutationInput[],
  tenantId?: string | null,
) {
  let deleteQuery = SupabaseDB.getAdminClient()
    .from("expense_request_items")
    .delete()
    .eq("expense_request_id", id);

  if (tenantId) {
    deleteQuery = deleteQuery.eq("tenant_id", tenantId);
  }

  const { error: deleteError } = await deleteQuery.select("id");

  if (deleteError) {
    throw Errors.dbError("清理费用明细失败", deleteError);
  }

  if (items.length === 0) {
    return;
  }

  const payload = items.map((item) => ({
    tenant_id: tenantId ?? null,
    expense_request_id: id,
    occurred_at: item.occurred_at ?? null,
    category_code: item.category_code ?? null,
    category: item.category,
    category_remark: item.category_remark ?? null,
    amount: item.amount,
    remark: item.remark ?? null,
    invoice_no: item.invoice_no ?? null,
    vendor_name: item.vendor_name ?? null,
    evidence_images: item.evidence_images ?? [],
  }));

  const { error } = await SupabaseDB.getAdminClient()
    .from("expense_request_items")
    .insert(payload)
    .select("id");

  if (error) {
    throw Errors.dbError("保存费用明细失败", error);
  }
}
