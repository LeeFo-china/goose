import { Errors } from "@/errors/error-factory";
import type { TenantOwnerFinanceSnapshot } from "@/services/tenant-owner-daily-dashboard-types";
import { SupabaseDB } from "@/utils/supabase/index";

export async function getTenantOwnerFinanceSnapshot(input: {
  tenantId: string;
  businessDate: string;
  startAt: string;
  endAt: string;
}): Promise<TenantOwnerFinanceSnapshot> {
  const sevenDaysLater = addDays(input.businessDate, 7);
  const { data, error } = await SupabaseDB.getAdminClient().rpc(
    "get_tenant_owner_finance_snapshot",
    {
      p_tenant_id: input.tenantId,
      p_business_date: input.businessDate,
      p_start_at: input.startAt,
      p_end_at: input.endAt,
      p_due_7d: sevenDaysLater,
    },
  );

  if (error) {
    throw Errors.dbError("查询老板财务快照失败", error);
  }

  const record = asRecord(data);

  return {
    today_income_amount: formatMoney(record.today_income_amount),
    today_expense_amount: formatMoney(record.today_expense_amount),
    today_net_cash_amount: formatMoney(record.today_net_cash_amount),
    receivable_due_today_amount: formatMoney(record.receivable_due_today_amount),
    receivable_due_7d_amount: formatMoney(record.receivable_due_7d_amount),
    overdue_receivable_amount: formatMoney(record.overdue_receivable_amount),
    pending_supplier_payable_amount: formatMoney(
      record.pending_supplier_payable_amount,
    ),
  };
}

function toMoney(value: unknown) {
  const amount = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value)
      : 0;
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(value: unknown) {
  return toMoney(value).toFixed(2);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
